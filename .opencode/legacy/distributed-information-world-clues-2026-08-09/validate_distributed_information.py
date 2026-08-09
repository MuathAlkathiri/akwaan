#!/usr/bin/env python3
"""Validate backend-synchronized Distributed Information ContentItems."""
from __future__ import annotations
import argparse, json, math
from pathlib import Path

IDS = {"A", "B", "C"}
MODES = {"match", "multiple_choice", "closest"}
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
        for child in value: yield from walk_keys(child)

def text_of(localized):
    if not isinstance(localized, dict):
        return ""
    return " ".join(str(v) for v in localized.values()).strip().lower()

def candidate_geometry_errors(mode: str, answer: dict, mechanic: dict) -> list[str]:
    """Enforce the distributed-information safety contract via candidateSets.

    Each segment resolves to a candidate subset (option ids for MC, accepted
    answer names for match, numeric values for closest). Runtime-safety
    requires: every segment keeps >= 2 candidates, every two-player merge
    keeps >= 2 candidates, and only the all-three merge collapses to exactly
    the ground-truth answer.
    """
    e = []
    sets = mechanic.get("candidateSets")
    if not isinstance(sets, dict) or not {"A", "B", "C"} <= set(sets):
        return ["candidate_sets_required"]
    try:
        cs = {k: list(sets[k]) for k in ("A", "B", "C")}
    except Exception:
        return ["candidate_sets_invalid"]
    for k in ("A", "B", "C"):
        if len(cs[k]) < 2:
            e.append("candidate_singleton_segment")
    for name, (x, y) in {"AB": ("A", "B"), "AC": ("A", "C"), "BC": ("B", "C")}.items():
        inter = set(cs[x]) & set(cs[y])
        if len(inter) < 2:
            e.append(f"candidate_merge_{name}_ambiguous")
    tri = set(cs["A"]) & set(cs["B"]) & set(cs["C"])
    if len(tri) != 1:
        e.append("candidate_triple_not_unique")
    else:
        only = next(iter(tri))
        if mode == "multiple_choice":
            if answer.get("correctOptionId") not in tri:
                e.append("candidate_answer_mismatch")
        elif mode == "match":
            if only not in (answer.get("acceptedAnswers") or []):
                e.append("candidate_answer_mismatch")
        elif mode == "closest":
            if only != answer.get("correctValue"):
                e.append("candidate_answer_mismatch")
    return e

def validate(item: dict) -> list[str]:
    e = []
    if "distributed-information" not in item.get("compatibleChallengeTypeIds", []): e.append("challenge_type_invalid")
    if item.get("patternId") != "three-segment-race": e.append("pattern_id_invalid")
    if item.get("answerMode") != "distributed": e.append("answer_mode_invalid")
    answer, mechanic = item.get("answerPayload"), item.get("mechanicPayload")
    if not isinstance(answer, dict) or not isinstance(mechanic, dict): return sorted(set(e + ["native_payload_object_required"]))
    mode = answer.get("mode")
    if mode not in MODES: e.append("inner_answer_mode_unsupported")
    e.extend(candidate_geometry_errors(mode, answer, mechanic))
    if mode == "match" and (not isinstance(answer.get("acceptedAnswers"), list) or not all(isinstance(x, str) and x.strip() for x in answer.get("acceptedAnswers", []))): e.append("machine_truth_invalid")
    if mode == "closest":
        truth, tolerance = answer.get("correctValue"), answer.get("acceptedTolerance", 0)
        if not isinstance(truth, (int, float)) or isinstance(truth, bool) or not math.isfinite(truth): e.append("machine_truth_invalid")
        if not isinstance(tolerance, (int, float)) or isinstance(tolerance, bool) or not math.isfinite(tolerance) or tolerance < 0: e.append("machine_truth_invalid")
    if mode == "multiple_choice":
        options = [x for x in answer.get("options", []) if isinstance(x, dict)]
        ids = [x.get("id") for x in options]
        if len(options) < 2 or answer.get("correctOptionId") not in ids or len(set(ids)) != len(ids): e.append("machine_truth_invalid")
    if mechanic.get("variant") != "three-segment-race": e.append("variant_invalid")
    if not str(mechanic.get("publicPrompt", {}).get("ar", "")).strip(): e.append("public_prompt_missing")
    segments = mechanic.get("segments", [])
    if len(segments) != 3: e.append("segment_count_invalid")
    seg_ids = [x.get("id") for x in segments if isinstance(x, dict)]
    if len(seg_ids) != 3 or set(seg_ids) != IDS: e.append("segment_ids_invalid")
    contents = []
    for segment in segments:
        if not isinstance(segment, dict) or not str(segment.get("content", {}).get("ar", "")).strip(): e.append("segment_content_missing")
        contents.append(str(segment.get("content", {}).get("ar", "")).strip().lower())
    if len(segments) == 3 and len(set(contents)) != 3: e.append("duplicate_segment_content")
    merges = mechanic.get("twoPlayerMergeOptions", [])
    if not merges: e.append("merge_missing")
    for merge in merges:
        first = merge.get("firstParticipantSegmentIds", []) if isinstance(merge, dict) else []
        second = merge.get("secondParticipantSegmentIds", []) if isinstance(merge, dict) else []
        if sorted([len(first), len(second)]) != [1, 2] or len(first + second) != 3 or set(first + second) != IDS: e.append("merge_invalid")
    if mechanic.get("supportedTeamSizes") != [2, 3]: e.append("team_sizes_invalid")
    if item.get("status") == "ready" and mechanic.get("authorSafetyConfirmation") is not True: e.append("safety_confirmation_missing")
    if TRUTH_KEYS & set(walk_keys(mechanic)): e.append("truth_duplicated_in_mechanic")
    if RUNTIME_KEYS & set(walk_keys(mechanic)): e.append("runtime_field_in_mechanic")
    notes = item.get("metadata", {}).get("notes")
    if notes is not None and not isinstance(notes, str): e.append("metadata_notes_forbidden")
    public = text_of(mechanic.get("publicPrompt"))
    answer_text = []
    answer_text += [str(x).lower() for x in answer.get("acceptedAnswers", [])]
    answer_text += [str(answer.get("correctValue", "")).lower(), str(answer.get("correctOptionId", "")).lower()]
    if any(x and x in public for x in answer_text): e.append("public_truth_leakage")
    for segment in segments:
        if not isinstance(segment, dict): continue
        content = text_of(segment.get("content"))
        if any(x and x in content for x in answer_text): e.append("segment_truth_leakage")
        if content and public and content in public: e.append("public_private_leakage")
    meta = item.get("metadata", {})
    if item.get("status") not in {"draft", "ready"} or meta.get("validationStatus") != item.get("status"): e.append("validation_status_invalid")
    if meta.get("runtimeContractStatus") != "fully_playable" or meta.get("runtimeBlocker") is not None: e.append("runtime_status_invalid")
    return sorted(set(e))

def main():
    p=argparse.ArgumentParser(); p.add_argument("paths", nargs="+"); a=p.parse_args(); failed=False
    for raw in a.paths:
        path=Path(raw); errors=validate(json.loads(path.read_text()))
        print(("PASS " if not errors else "FAIL ")+str(path))
        for error in errors: print("- "+error)
        failed |= bool(errors)
    return int(failed)
if __name__ == "__main__": raise SystemExit(main())
