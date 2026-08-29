#!/usr/bin/env python3
"""Validate "ركّبها" (rakkibha) asymmetric visual-assembly ContentItems.

The active contract (backend `validateRakkibhaPayload`): one private reference view
and two-or-three private candidate views. Each candidate carries a server-side
`canonicalIdentity`; exactly one candidate globally matches
`correctCanonicalIdentity`. The team describes what each privately sees and selects
the matching piece. The runtime is implemented, so a well-formed item may be ready.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

VARIANT = "visual-assembly"
CHALLENGE_TYPE = "rakkibha"
TRUTH_KEYS = {
    "correctAnswer", "correctValue", "acceptedAnswers", "correctOptionId",
    "answerPayload", "answer",
}
RUNTIME_KEYS = {
    "hint", "hints", "lockMs", "lockDuration", "timerSeconds", "timeLimit",
    "deadlineMs", "answerer", "answererSchedule", "order", "solved",
    "wrongAttempts", "elapsedMs", "winner", "score", "scoringRule",
}
RETIRED_FIELDS = {"segments", "fragments", "twoPlayerMergeOptions", "publicPrompt"}


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def text_of(localized) -> str:
    if not isinstance(localized, dict):
        return ""
    return " ".join(str(v) for v in localized.values()).strip().lower()


def image_ok(media) -> bool:
    if not isinstance(media, dict):
        return False
    assets = media.get("assets")
    return (
        media.get("type") in {"image", "audio", "video"}
        and isinstance(assets, list)
        and len(assets) >= 1
        and bool(str(assets[0].get("url", "")).strip())
    )


def validate(item: dict) -> list[str]:
    e: list[str] = []
    if CHALLENGE_TYPE not in item.get("compatibleChallengeTypeIds", []):
        e.append("challenge_type_invalid")

    mechanic = item.get("mechanicPayload")
    if not isinstance(mechanic, dict):
        return sorted(set(e + ["native_payload_object_required"]))

    if mechanic.get("variant") != VARIANT:
        e.append("variant_invalid")
    if not text_of(mechanic.get("instruction")):
        e.append("instruction_missing")

    reference = mechanic.get("reference")
    if not isinstance(reference, dict) or not image_ok(reference.get("media")):
        e.append("reference_media_invalid")

    views = mechanic.get("candidateViews")
    if not isinstance(views, list) or len(views) < 2:
        e.append("candidate_views_required")
        views = views if isinstance(views, list) else []
    view_ids = [v.get("id") for v in views if isinstance(v, dict)]
    if len(set(view_ids)) != len(view_ids):
        e.append("candidate_view_ids_invalid")

    all_identities: list[str] = []
    for view in views:
        candidates = view.get("candidates") if isinstance(view, dict) else None
        if not isinstance(candidates, list) or not (2 <= len(candidates) <= 3):
            e.append("candidate_count_invalid")
            continue
        local_ids = [c.get("localId") for c in candidates if isinstance(c, dict)]
        if len(set(local_ids)) != len(local_ids) or not all(local_ids):
            e.append("local_ids_invalid")
        for candidate in candidates:
            if not isinstance(candidate, dict):
                e.append("candidate_invalid")
                continue
            identity = str(candidate.get("canonicalIdentity", "")).strip()
            if not identity:
                e.append("canonical_identity_required")
            else:
                all_identities.append(identity)
            if not image_ok(candidate.get("media")):
                e.append("candidate_media_invalid")

    correct = str(mechanic.get("correctCanonicalIdentity", "")).strip()
    if not correct or all_identities.count(correct) != 1:
        e.append("true_candidate_invalid")

    if mechanic.get("supportedTeamSizes") != [2, 3]:
        e.append("team_sizes_invalid")
    if item.get("status") == "ready" and mechanic.get("authorSafetyConfirmation") is not True:
        e.append("safety_confirmation_missing")

    # The correct identity is a server-side token; it must never appear in any
    # client-visible text (instruction, prompt, or a candidate's own content).
    public_texts = [text_of(mechanic.get("instruction")), text_of(item.get("prompt"))]
    for view in views:
        if isinstance(view, dict):
            public_texts.append(text_of(view.get("content")))
            for candidate in view.get("candidates", []) or []:
                if isinstance(candidate, dict):
                    public_texts.append(text_of(candidate.get("content")))
    if correct and any(correct.lower() in t for t in public_texts if t):
        e.append("correct_identity_leaked")

    if TRUTH_KEYS & set(walk_keys(mechanic)):
        e.append("truth_duplicated_in_mechanic")
    if RUNTIME_KEYS & set(walk_keys(mechanic)):
        e.append("runtime_field_in_mechanic")
    if RETIRED_FIELDS & set(mechanic):
        e.append("retired_mechanic_field")

    return sorted(set(e))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    failed = False
    for raw in args.paths:
        path = Path(raw)
        errors = validate(json.loads(path.read_text()))
        print(("PASS " if not errors else "FAIL ") + str(path))
        for error in errors:
            print("- " + error)
        failed |= bool(errors)
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
