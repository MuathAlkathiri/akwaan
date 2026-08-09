#!/usr/bin/env python3
"""Validate cooperative shared-fragment Distributed Information ContentItems.

The active contract is the Puzzle World shared-puzzle model: one instruction plus
exactly two complementary fragments plus one machine-resolvable answer. The
product backend has not migrated away from the retired three-segment-race payload,
so every item stays authoring-only and no item may be marked ready.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path

MODES = {"match", "multiple_choice", "closest"}
FRAGMENT_IDS = {"A", "B"}
TRUTH_KEYS = {"correctAnswer", "correctValue", "acceptedAnswers", "correctOptionId", "answerPayload", "answer"}
RUNTIME_KEYS = {
    "hint", "hints", "hintMs", "hintTimeMs", "lockMs", "lockDuration",
    "timerSeconds", "timeLimit", "deadlineMs", "answerer", "answererSchedule",
    "answerOrder", "itemOrder", "order", "solved", "solvedCount",
    "wrongAttempts", "elapsedMs", "winner", "score", "scoringRule",
    "reveal", "revealed",
}

def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)

def text_of(localized):
    if not isinstance(localized, dict):
        return ""
    return " ".join(str(v) for v in localized.values()).strip().lower()

def answer_texts(answer: dict) -> list[str]:
    mode = answer.get("mode")
    if mode == "match":
        return [str(x).lower() for x in answer.get("acceptedAnswers", [])]
    if mode == "closest":
        value = answer.get("correctValue")
        return [str(value).lower()] if value is not None else []
    if mode == "multiple_choice":
        target = answer.get("correctOptionId")
        for option in answer.get("options", []):
            if isinstance(option, dict) and option.get("id") == target:
                return text_of(option.get("label")).split() if isinstance(text_of(option.get("label")), str) else []
    return []

def validate(item: dict) -> list[str]:
    e = []
    if "distributed-information" not in item.get("compatibleChallengeTypeIds", []):
        e.append("challenge_type_invalid")
    if item.get("patternId") != "shared-fragments":
        e.append("pattern_id_invalid")
    if item.get("answerMode") != "distributed":
        e.append("answer_mode_invalid")
    answer, mechanic = item.get("answerPayload"), item.get("mechanicPayload")
    if not isinstance(answer, dict) or not isinstance(mechanic, dict):
        return sorted(set(e + ["native_payload_object_required"]))
    mode = answer.get("mode")
    if mode not in MODES:
        e.append("inner_answer_mode_unsupported")
    if mode == "match" and (not isinstance(answer.get("acceptedAnswers"), list) or not all(isinstance(x, str) and x.strip() for x in answer.get("acceptedAnswers", []))):
        e.append("machine_truth_invalid")
    if mode == "closest":
        truth, tolerance = answer.get("correctValue"), answer.get("acceptedTolerance", 0)
        if not isinstance(truth, (int, float)) or isinstance(truth, bool) or not math.isfinite(truth):
            e.append("machine_truth_invalid")
        if not isinstance(tolerance, (int, float)) or isinstance(tolerance, bool) or not math.isfinite(tolerance) or tolerance < 0:
            e.append("machine_truth_invalid")
    if mode == "multiple_choice":
        options = [x for x in answer.get("options", []) if isinstance(x, dict)]
        ids = [x.get("id") for x in options]
        if len(options) < 2 or answer.get("correctOptionId") not in ids or len(set(ids)) != len(ids):
            e.append("machine_truth_invalid")
    if mechanic.get("variant") != "shared-fragments":
        e.append("variant_invalid")
    instruction = text_of(mechanic.get("instruction"))
    if not instruction:
        e.append("instruction_missing")
    fragments = mechanic.get("fragments", [])
    if not isinstance(fragments, list) or len(fragments) != 2:
        e.append("fragment_count_invalid")
    ids = [x.get("id") for x in fragments if isinstance(x, dict)]
    if len(ids) != 2 or set(ids) != FRAGMENT_IDS:
        e.append("fragment_ids_invalid")
    contents = []
    for fragment in fragments:
        if not isinstance(fragment, dict) or not str(fragment.get("content", {}).get("ar", "")).strip():
            e.append("fragment_content_missing")
        else:
            contents.append(text_of(fragment.get("content")))
    if len(contents) == 2 and len(set(contents)) != 2:
        e.append("duplicate_fragment_content")
    if instruction and any(c and c == instruction for c in contents):
        e.append("instruction_duplicated_in_fragment")
    if mechanic.get("supportedTeamSizes") != [2, 3]:
        e.append("team_sizes_invalid")
    if item.get("status") == "ready" and mechanic.get("authorSafetyConfirmation") is not True:
        e.append("safety_confirmation_missing")
    if TRUTH_KEYS & set(walk_keys(mechanic)):
        e.append("truth_duplicated_in_mechanic")
    if RUNTIME_KEYS & set(walk_keys(mechanic)):
        e.append("runtime_field_in_mechanic")
    retired = {"segments", "twoPlayerMergeOptions", "candidateSets"}
    if retired & set(mechanic):
        e.append("retired_mechanic_field")
    notes = item.get("metadata", {}).get("notes")
    if notes is not None and not isinstance(notes, str):
        e.append("metadata_notes_forbidden")
    truth = answer_texts(answer)
    public = text_of(mechanic.get("instruction")) or text_of(item.get("prompt"))
    if any(x and x in public for x in truth):
        e.append("public_truth_leakage")
    for fragment in fragments:
        if not isinstance(fragment, dict):
            continue
        content = text_of(fragment.get("content"))
        if any(x and x in content for x in truth):
            e.append("fragment_truth_leakage")
    meta = item.get("metadata", {})
    if item.get("status") not in {"draft", "ready"} or meta.get("validationStatus") != item.get("status"):
        e.append("validation_status_invalid")
    if meta.get("runtimeContractStatus") != "authoring_only" or not str(meta.get("runtimeBlocker") or "").strip():
        e.append("runtime_status_invalid")
    if item.get("status") == "ready":
        e.append("runtime_blocked")
    return sorted(set(e))

def main():
    p = argparse.ArgumentParser()
    p.add_argument("paths", nargs="+")
    args = p.parse_args()
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
