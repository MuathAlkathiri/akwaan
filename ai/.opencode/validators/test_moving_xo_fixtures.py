#!/usr/bin/env python3
"""Structural and negative fixtures for the Moving XO authoring contract.

Every forward Scope gets a worked example, and every rule the validator claims
to enforce gets an item that breaks it. The shipped example pack is validated
too, so a fixture cannot quietly rot into something the validator rejects.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

from validate_moving_xo import (
    FAMILIES,
    partition,
    RETIRED_SCOPES,
    has_digit,
    signals,
    validate,
    validate_batch,
)

EXAMPLES = Path(__file__).resolve().parent / "examples" / "moving-xo.valid.json"

#: A minimal text-native puzzle. Each case below changes exactly one thing, so a
#: failure names the rule rather than the fixture.
BASE = {
    "contentItemId": "fixture",
    "compatibleChallengeTypeIds": ["moving-xo"],
    "scope": "wordplay-letters",
    "family": "anagram-rearrange",
    "prompt": {"ar": "رتّب حروف «م ل ق» لتكوّن أداة كتابة."},
    "answerPayload": {
        "mode": "multiple_choice",
        "options": [
            {"id": "qalam", "label": {"ar": "قلم"}},
            {"id": "qalamah", "label": {"ar": "قلامة"}},
        ],
        "correctOptionId": "qalam",
    },
}

MATCH_BASE = {
    "contentItemId": "match-fixture",
    "compatibleChallengeTypeIds": ["moving-xo"],
    "scope": "observation-illusions",
    "family": "figure-ground-reversal",
    "prompt": {"ar": "ما الشكل المخفي في الفراغ؟"},
    "media": {"type": "image", "assets": [{"url": "https://cdn.akwaan.test/match.png"}]},
    "answerPayload": {"mode": "match", "acceptedAnswers": ["قلم"]},
}

VISUAL_BASE = {
    "contentItemId": "fixture-visual",
    "compatibleChallengeTypeIds": ["moving-xo"],
    "scope": "observation-illusions",
    "family": "count-in-clutter",
    "prompt": {"ar": "كم مثلثًا في الشكل؟"},
    "media": {"type": "image", "assets": [{"url": "https://cdn.akwaan.test/t.png"}]},
    "answerPayload": {
        "mode": "multiple_choice",
        "options": [
            {"id": "four", "label": {"ar": "٤"}},
            {"id": "five", "label": {"ar": "٥"}},
        ],
        "correctOptionId": "five",
    },
}


def item(base: dict, **overrides) -> dict:
    merged = copy.deepcopy(base)
    for key, value in overrides.items():
        if value is None:
            merged.pop(key, None)
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def check(name: str, errors: list[str], expect_failure: bool) -> bool:
    failed = bool(errors)
    ok = failed == expect_failure
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f" :: {errors}"))
    return ok


def check_mentions(name: str, errors: list[str], fragment: str) -> bool:
    ok = any(fragment in error for error in errors)
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f" :: {errors}"))
    return ok


def main() -> int:
    results: list[bool] = []

    # --- The six forward Scopes, each with a worked example -----------------
    pack = json.loads(EXAMPLES.read_text(encoding="utf-8"))
    results.append(check("shipped example pack validates", validate_batch(pack), False))
    covered = {row["scope"] for row in pack["items"]}
    results.append(
        check(
            "example pack covers all six forward Scopes",
            [] if covered == set(FAMILIES) else [f"missing: {sorted(set(FAMILIES) - covered)}"],
            False,
        )
    )

    # Every family in the table must be reachable: a family an author cannot
    # name is documentation, not a contract.
    for scope, families in FAMILIES.items():
        for family, profile in families.items():
            mode = "multiple_choice" if "multiple_choice" in profile["modes"] else "match"
            payload = (
                {
                    "mode": "multiple_choice",
                    "options": [
                        {"id": "a", "label": {"ar": "أ"}},
                        {"id": "b", "label": {"ar": "ب"}},
                    ],
                    "correctOptionId": "a",
                }
                if mode == "multiple_choice"
                else {"mode": "match", "acceptedAnswers": ["قلم"]}
            )
            candidate = {
                "contentItemId": f"{scope}-{family}",
                "scope": scope,
                "family": family,
                "prompt": {"ar": "سؤال قصير؟"},
                "answerPayload": payload,
            }
            if profile["media"] == "required":
                candidate["media"] = {
                    "type": "image",
                    "assets": [{"url": "https://cdn.akwaan.test/x.png"}],
                }
            results.append(check(f"{scope}/{family} is authorable", validate(candidate), False))

    # --- Scope boundaries ---------------------------------------------------
    for retired in sorted(RETIRED_SCOPES):
        results.append(
            check_mentions(
                f"retired scope rejected: {retired}",
                validate(item(BASE, scope=retired, family="anagram-rearrange")),
                "retired",
            )
        )
    results.append(check("unknown scope rejected", validate(item(BASE, scope="chess")), True))
    results.append(check("missing scope rejected", validate(item(BASE, scope=None)), True))
    results.append(
        check_mentions(
            "retired family rejected",
            validate(item(BASE, scope="numbers-estimation", family="numeric-pattern")),
            "does not belong",
        )
    )
    results.append(
        check(
            "family from another scope rejected",
            validate(item(BASE, family="cube-net-fold")),
            True,
        )
    )
    results.append(check("missing family rejected", validate(item(BASE, family=None)), True))

    # --- Answer modes -------------------------------------------------------
    for mode in ("closest", "vote", "split", "top_5", "ryo", ""):
        results.append(
            check(
                f"unplayable answer mode rejected: {mode or 'missing'}",
                validate(item(BASE, answerPayload={"mode": mode})),
                True,
            )
        )
    results.append(
        check_mentions(
            "a family's own mode restriction is enforced",
            validate(
                item(
                    MATCH_BASE,
                    scope="numbers-estimation",
                    family="visual-quantity-estimate",
                    answerPayload={"mode": "match", "acceptedAnswers": ["قلم"]},
                )
            ),
            "may not answer in",
        )
    )

    # --- match: the normalizer's limits -------------------------------------
    results.append(check("digit detection: ASCII", [] if has_digit("25") else ["miss"], False))
    results.append(check("digit detection: Arabic-Indic", [] if has_digit("٢٥") else ["miss"], False))
    results.append(check("digit detection: pure letters", [] if not has_digit("قلم") else ["hit"], False))
    for answer in ("25", "٢٥", "٧ سنوات", "90 درجة"):
        results.append(
            check_mentions(
                f"numeric match answer rejected: {answer}",
                validate(item(MATCH_BASE, answerPayload={"mode": "match", "acceptedAnswers": [answer]})),
                "does not fold",
            )
        )
    results.append(
        check_mentions(
            "an alias the normalizer already folds is rejected",
            # المثلث normalizes to مثلث, so listing both is one answer twice.
            validate(
                item(MATCH_BASE, answerPayload={"mode": "match", "acceptedAnswers": ["مثلث", "المثلث"]})
            ),
            "already covered by normalization",
        )
    )
    results.append(
        check_mentions(
            "a sentence-length match answer is rejected",
            validate(
                item(
                    MATCH_BASE,
                    answerPayload={
                        "mode": "match",
                        "acceptedAnswers": ["القلم الذي يكتب بالحبر الأزرق"],
                    },
                )
            ),
            "fifteen seconds",
        )
    )
    results.append(
        check(
            "empty accepted answers rejected",
            validate(item(MATCH_BASE, answerPayload={"mode": "match", "acceptedAnswers": []})),
            True,
        )
    )

    # --- multiple_choice: the phone renders text only -----------------------
    results.append(
        check_mentions(
            "image options rejected",
            validate(
                item(
                    VISUAL_BASE,
                    answerPayload={
                        "mode": "multiple_choice",
                        "options": [
                            {"id": "a", "label": "https://cdn.akwaan.test/a.png"},
                            {"id": "b", "label": "shape-b.svg"},
                        ],
                        "correctOptionId": "a",
                    },
                )
            ),
            "renders text choices only",
        )
    )
    results.append(
        check(
            "single option rejected",
            validate(
                item(
                    VISUAL_BASE,
                    answerPayload={
                        "mode": "multiple_choice",
                        "options": [{"id": "a", "label": {"ar": "أ"}}],
                        "correctOptionId": "a",
                    },
                )
            ),
            True,
        )
    )
    results.append(
        check(
            "correctOptionId outside the options rejected",
            validate(
                item(
                    VISUAL_BASE,
                    answerPayload={
                        "mode": "multiple_choice",
                        "options": [
                            {"id": "a", "label": {"ar": "أ"}},
                            {"id": "b", "label": {"ar": "ب"}},
                        ],
                        "correctOptionId": "z",
                    },
                )
            ),
            True,
        )
    )
    results.append(
        check_mentions(
            "two options reading the same rejected",
            validate(
                item(
                    VISUAL_BASE,
                    answerPayload={
                        "mode": "multiple_choice",
                        "options": [
                            {"id": "a", "label": {"ar": "المثلث"}},
                            {"id": "b", "label": {"ar": "مثلث"}},
                        ],
                        "correctOptionId": "a",
                    },
                )
            ),
            "read the same after normalization",
        )
    )

    # --- Media --------------------------------------------------------------
    results.append(
        check_mentions(
            "a visual family with no asset is rejected",
            validate(item(VISUAL_BASE, media=None)),
            "resolved media asset is required",
        )
    )
    results.append(
        check_mentions(
            "declared media with an empty asset list is an intention, not an asset",
            validate(item(VISUAL_BASE, media={"type": "image", "assets": []})),
            "no resolved asset",
        )
    )
    results.append(
        check(
            "an asset with a blank url does not count",
            validate(item(VISUAL_BASE, media={"type": "image", "assets": [{"url": "   "}]})),
            True,
        )
    )
    results.append(
        check(
            "video satisfies a visual family",
            validate(
                item(
                    VISUAL_BASE,
                    scope="paths-motion",
                    family="gear-train-direction",
                    media={"type": "video", "assets": [{"url": "https://cdn.akwaan.test/g.mp4"}]},
                )
            ),
            False,
        )
    )
    results.append(
        check(
            "a text-native family carrying media is rejected",
            validate(
                item(
                    BASE,
                    media={"type": "image", "assets": [{"url": "https://cdn.akwaan.test/x.png"}]},
                )
            ),
            True,
        )
    )
    results.append(
        check(
            "a mixed family is never blocked for missing media",
            validate(
                item(
                    BASE,
                    scope="spot-the-error",
                    family="order-violation",
                    answerPayload={
                        "mode": "multiple_choice",
                        "options": [
                            {"id": "a", "label": {"ar": "أ"}},
                            {"id": "b", "label": {"ar": "ب"}},
                        ],
                        "correctOptionId": "a",
                    },
                )
            ),
            False,
        )
    )

    # --- Prompt and batch ---------------------------------------------------
    results.append(check("missing prompt rejected", validate(item(BASE, prompt=None)), True))
    results.append(
        check(
            "duplicate ids in one batch rejected",
            validate_batch({"items": [copy.deepcopy(BASE), copy.deepcopy(BASE)]}),
            True,
        )
    )
    results.append(
        check_mentions(
            "a repeated prompt in one batch is rejected",
            validate_batch(
                {"items": [copy.deepcopy(BASE), item(BASE, contentItemId="fixture-2")]}
            ),
            "prompt repeats",
        )
    )
    results.append(check("empty batch rejected", validate_batch({"items": []}), True))
    results.append(
        check(
            "a `questions` pack is read like an `items` pack",
            validate_batch({"questions": [copy.deepcopy(BASE)]}),
            False,
        )
    )

    # --- Mechanic targeting -------------------------------------------------
    # A Puzzles pack is not automatically a Moving XO pack: the authored packs
    # in ai/workbench/artifacts mix Moving XO, Bomb, RYO and Closest rows in one
    # file. Reporting a Closest row as a broken Moving XO item is the noise that
    # teaches authors to ignore a validator.
    other = item(BASE, compatibleChallengeTypeIds=["bomb"], scope="general-knowledge")
    results.append(
        check("a row for another mechanic is skipped, not failed", validate_batch({"items": [other]}), False)
    )
    results.append(
        check(
            "an undeclared row is not guessed at",
            validate_batch({"items": [item(BASE, compatibleChallengeTypeIds=None, scope="general-knowledge")]}),
            False,
        )
    )
    results.append(
        check(
            "...but is checked once the caller says the pack is Moving XO",
            validate_batch(
                {"items": [item(BASE, compatibleChallengeTypeIds=None, scope="general-knowledge")]},
                assume_moving_xo=True,
            ),
            True,
        )
    )
    results.append(
        check(
            "pack metadata can say it instead of the caller",
            validate_batch(
                {
                    "metadata": {"mechanic": "moving-xo"},
                    "items": [item(BASE, compatibleChallengeTypeIds=None, scope="general-knowledge")],
                }
            ),
            True,
        )
    )
    results.append(
        check(
            "an explicit row declaration overrides the pack",
            validate_batch(
                {"metadata": {"mechanic": "moving-xo"}, "items": [other]},
            ),
            False,
        )
    )
    mine, theirs, unknown = partition(
        {"items": [copy.deepcopy(BASE), other, item(BASE, compatibleChallengeTypeIds=None, contentItemId="u")]}
    )
    results.append(
        check(
            "partition counts every row exactly once",
            [] if (len(mine), len(theirs), len(unknown)) == (1, 1, 1) else [f"{len(mine)}/{len(theirs)}/{len(unknown)}"],
            False,
        )
    )

    # --- Signals are signals, not rejections --------------------------------
    long_prompt = {"ar": "سؤال طويل جدًا " * 20}
    results.append(
        check("an over-long prompt is a signal, not an error", validate(item(BASE, prompt=long_prompt)), False)
    )
    results.append(
        check(
            "...and it is actually reported",
            [] if signals({"items": [item(BASE, prompt=long_prompt)]}) else ["no signal"],
            False,
        )
    )

    passed = sum(1 for result in results if result)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
