#!/usr/bin/env python3
"""Validate Who Among Us authoring and block speculative runtime readiness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

SENSITIVE_MARKERS = {
    "weight", "body", "health", "religion", "politics", "sexuality",
    "wealth", "income", "trauma", "crime", "relationship", "intelligence",
    "وزن", "جسم", "صحة", "مرض", "دين", "سياسة", "جنس", "ثروة", "دخل",
    "راتب", "صدمة", "جريمة", "علاقة", "ذكاء",
}
OBJECTIVE_MARKERS = {
    "who scored", "most goals", "correct teammate", "من سجّل", "سجّل أهدافًا", "الأكثر أهداف",
    "الإجابة الصحيحة",
}
ROSTER_MARKERS = {
    "من في الفريق", "من فيكم", "أي زميل", "who on the team", "who among you",
    "which teammate",
}


def validate(item: dict, *, authoring_only: bool = False) -> list[str]:
    errors: list[str] = []

    if "who-among-us" not in item.get("compatibleChallengeTypeIds", []):
        errors.append("challenge_type_invalid")
    if item.get("patternId") != "team-consensus":
        errors.append("pattern_id_invalid")
    if item.get("answerMode") != "vote":
        errors.append("input_mode_invalid")

    prompt = " ".join(item.get("prompt", {}).values()).lower()
    if not any(marker in prompt for marker in ROSTER_MARKERS):
        errors.append("roster_aware_prompt_missing")
    if any(marker in prompt for marker in OBJECTIVE_MARKERS):
        errors.append("objective_answer_prompt")
    if any(marker in prompt for marker in SENSITIVE_MARKERS):
        errors.append("sensitive_prompt")

    interaction = item.get("interactionPayload", {})
    expected_interaction = {
        "actorModel": "active_team_all_eligible",
        "rosterBinding": "active_team_eligible_roster",
        "voteValueType": "participant_id",
        "submissionLimitPerActor": 1,
        "duplicateSelectionsAllowed": True,
        "selfVotePolicy": "forbidden",
        "minimumTeamSize": 3,
        "maximumTeamSize": None,
        "timerSeconds": None,
        "timeoutPolicy": "runtime_contract_missing",
        "individualVoteVisibility": "private_until_reveal",
        "partialTallyVisibility": "hidden",
        "revealTrigger": "all_submitted_or_runtime_deadline",
    }
    for key, expected in expected_interaction.items():
        if interaction.get(key, object()) != expected:
            code = "projection_leakage" if key in {"individualVoteVisibility", "partialTallyVisibility"} else "input_contract_invalid"
            errors.append(code)

    if interaction.get("hardcodedParticipantIds") or interaction.get("hardcodedParticipantNames"):
        errors.append("hardcoded_participant")
    forbidden_keys = {"participantIds", "participantNames", "targetParticipantId", "targetParticipantName"}
    if forbidden_keys & set(interaction):
        errors.append("hardcoded_participant")

    resolution = item.get("resolutionPayload", {})
    if "tiePolicy" not in resolution:
        errors.append("tie_policy_missing")
    elif resolution.get("tiePolicy") != "multiple_winners":
        errors.append("tie_policy_invalid")
    expected_resolution = {
        "resolution": "participant_vote_tally",
        "winnerPolicy": "highest_vote_total",
        "winnerCardinality": "one_or_more",
        "revealPayload": "final_tally_only",
        "scoringPolicy": "social_reveal_only",
        "matchPointValue": None,
    }
    for key, expected in expected_resolution.items():
        if resolution.get(key, object()) != expected:
            errors.append("resolution_contract_invalid")
    if {"correctParticipantId", "objectiveWinnerId", "correctAnswer"} & set(resolution):
        errors.append("objective_answer_prompt")

    if item.get("isReusableAcrossSessions") is not True:
        errors.append("reuse_policy_invalid")

    metadata = item.get("metadata", {})
    runtime_missing = (
        interaction.get("runtimeContractStatus") == "runtime_contract_missing"
        or metadata.get("runtimeContractStatus") == "runtime_contract_missing"
        or metadata.get("runtimeBlocker") == "runtime_contract_missing"
    )
    if not runtime_missing:
        errors.append("runtime_status_invalid")
    if metadata.get("validationStatus") != "blocked":
        errors.append("runtime_status_invalid")
    if runtime_missing and not authoring_only:
        errors.append("runtime_contract_missing")

    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    parser.add_argument("--authoring-only", action="store_true")
    args = parser.parse_args()
    failed = False
    for raw_path in args.paths:
        path = Path(raw_path)
        item = json.loads(path.read_text(encoding="utf-8"))
        errors = validate(item, authoring_only=args.authoring_only)
        if errors:
            failed = True
            print(f"FAIL {path}")
            for error in errors:
                print(f"- {error}")
        else:
            print(f"PASS {path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
