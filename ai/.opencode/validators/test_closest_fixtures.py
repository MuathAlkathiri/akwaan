#!/usr/bin/env python3
"""Structural and negative fixtures for the مين أقرب slider contract."""

from __future__ import annotations

import copy

from validate_closest import midpoint_signal, validate_batch, validate_slider

VALID = {"mode": "numeric-range", "min": 0, "max": 500, "step": 5}


def check(name: str, errors: list[str], expect_failure: bool) -> bool:
    failed = bool(errors)
    ok = failed == expect_failure
    print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f" :: {errors}"))
    return ok


def main() -> int:
    results: list[bool] = []

    results.append(check("valid numeric-range", validate_slider(VALID, 250, "x"), False))
    results.append(
        check(
            "valid between-anchors",
            validate_slider(
                {"mode": "between-anchors", "min": 0, "max": 10, "step": 1,
                 "leftAnchor": "أ", "rightAnchor": "ب"},
                4,
                "x",
            ),
            False,
        )
    )
    results.append(
        check(
            "valid calendar-year",
            validate_slider(
                {"mode": "numeric-range", "min": 1900, "max": 2000, "step": 1,
                 "displayFormat": "calendar-year"},
                1966,
                "x",
            ),
            False,
        )
    )

    # Negatives — each must be caught.
    bad: list[tuple[str, dict | None, float]] = [
        ("legacy mode rejected", {"mode": "legacy", "min": 0, "max": 10, "step": 1}, 5),
        ("missing slider rejected", None, 5),
        ("min >= max rejected", {**VALID, "min": 500, "max": 500}, 500),
        ("zero step rejected", {**VALID, "step": 0}, 250),
        ("negative step rejected", {**VALID, "step": -5}, 250),
        ("target outside range", VALID, 900),
        ("target off the step grid", VALID, 252),
        ("unknown displayFormat", {**VALID, "displayFormat": "roman"}, 250),
        ("calendar-year with a unit", {**VALID, "displayFormat": "calendar-year", "unit": "سنة"}, 250),
        ("anchors missing", {"mode": "between-anchors", "min": 0, "max": 10, "step": 1}, 5),
        ("numeric-range without step", {"mode": "numeric-range", "min": 0, "max": 10}, 5),
        ("infinite bound", {**VALID, "max": float("inf")}, 250),
    ]
    for name, slider, target in bad:
        results.append(check(name, validate_slider(slider, target, "x"), True))

    # Batch-level drift protection.
    source = {
        "items": [
            {"contentItemId": "a", "prompt": "س", "correctValue": 10, "acceptedTolerance": 1},
            {"contentItemId": "b", "prompt": "ص", "correctValue": 20, "acceptedTolerance": 1,
             "holdForContentReview": ["factual-answer-concern"]},
        ]
    }
    authored = {
        "items": [
            {"contentItemId": "a", "prompt": "س", "correctValue": 10, "acceptedTolerance": 1,
             "closestSlider": {"mode": "numeric-range", "min": 0, "max": 100, "step": 1}},
            {"contentItemId": "b", "prompt": "ص", "correctValue": 20, "acceptedTolerance": 1,
             "holdForContentReview": ["factual-answer-concern"]},
        ]
    }
    results.append(check("clean batch against source", validate_batch(authored, source), False))

    drifted = copy.deepcopy(authored)
    drifted["items"][0]["correctValue"] = 11
    results.append(check("answer drift caught", validate_batch(drifted, source), True))

    renamed = copy.deepcopy(authored)
    renamed["items"][0]["prompt"] = "سؤال مختلف"
    results.append(check("prompt drift caught", validate_batch(renamed, source), True))

    invented = copy.deepcopy(authored)
    invented["items"][0]["contentItemId"] = "zzz"
    results.append(check("invented id caught", validate_batch(invented, source), True))

    dropped = copy.deepcopy(authored)
    dropped["items"].pop()
    results.append(check("missing source item caught", validate_batch(dropped, source), True))

    unheld = copy.deepcopy(authored)
    unheld["items"][1].pop("holdForContentReview")
    unheld["items"][1]["closestSlider"] = VALID
    results.append(check("dropped hold caught", validate_batch(unheld, source), True))

    authored_hold = copy.deepcopy(authored)
    authored_hold["items"][1]["closestSlider"] = VALID
    results.append(check("authoring a held item caught", validate_batch(authored_hold, source), True))

    # A batch may arrive under either key the repository's packs use.
    as_questions = {"questions": authored["items"]}
    results.append(check("questions[] batch accepted", validate_batch(as_questions, source), False))
    results.append(
        check("questions[] source accepted", validate_batch(authored, {"questions": source["items"]}), False)
    )
    results.append(check("batch with neither key rejected", validate_batch({"rows": []}, None), True))

    # `needsHumanAuthoring` is what the authoring workflow emits when an honest
    # range cannot contain the target, so it must validate without a slider.
    needs_human = {
        "items": [
            {"contentItemId": "a", "prompt": "س", "correctValue": 10, "acceptedTolerance": 1,
             "needsHumanAuthoring": True},
            {"contentItemId": "b", "prompt": "ص", "correctValue": 20, "acceptedTolerance": 1,
             "holdForContentReview": ["factual-answer-concern"]},
        ]
    }
    results.append(check("needsHumanAuthoring without slider accepted", validate_batch(needs_human, source), False))
    smuggled = copy.deepcopy(needs_human)
    smuggled["items"][0]["closestSlider"] = VALID
    results.append(check("needsHumanAuthoring must not carry a slider", validate_batch(smuggled, source), True))

    # Midpoint is a signal, never an error.
    signals = [
        ("exact-midpoint", midpoint_signal({"min": 0, "max": 100}, 50)),
        ("near-midpoint", midpoint_signal({"min": 0, "max": 100}, 52)),
        ("clear", midpoint_signal({"min": 0, "max": 100}, 90)),
    ]
    for expected, actual in signals:
        ok = expected == actual
        results.append(ok)
        print(f"{'ok  ' if ok else 'FAIL'} midpoint signal {expected} (got {actual})")
    results.append(
        check("midpoint alone is not an error", validate_slider({"min": 0, "max": 100, "step": 1,
              "mode": "numeric-range"}, 50, "x"), False)
    )

    passed = sum(results)
    print(f"\n{passed}/{len(results)} fixture checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
