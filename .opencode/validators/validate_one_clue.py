#!/usr/bin/env python3
"""Validate progressive-clues One Clue ContentItems.

Mirrors the production contract verified against the Lammah game backend:
wrapper answer mode `one_clue`, item answer payload mode `match`, exactly five
clues ordered 1..5 valued 5, 4, 3, 2, 1, Arabic-only clue text, and automatic
text resolution through the shared Arabic normalizer. The validator decides only
what a machine can decide. Factual correctness, relative difficulty, clue
usefulness, semantic duplication, and monotonic identification quality are
Reviewer and QA reasoning gates this validator never claims to prove.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

ONE_CLUE_VALUES = [5, 4, 3, 2, 1]
ORDER = list(range(1, 6))
MODE = "one_clue"
PATTERN_ID = "progressive-clues"
ITEM_MODE = "match"
TRUTH_KEYS = {
    "correctAnswer", "correctValue", "acceptedAnswers", "correctOptionId",
    "answerPayload", "answer", "clueAnswer",
}
RUNTIME_KEYS = {
    "hint", "hints", "hintMs", "hintTimeMs", "lockMs", "lockDuration",
    "timerSeconds", "timeLimit", "deadlineMs", "answerer", "answererSchedule",
    "answerOrder", "stageOrder", "solved", "solvedCount",
    "wrongAttempts", "elapsedMs", "winner", "score", "scoringRule",
    "reveal", "revealed", "clueIndex", "stage",
}
LEGACY_FIELDS = {
    "points", "score", "maxPoints", "difficulty", "correctAnswer",
    "wrongAnswers", "hostDecision", "approvedAnswer", "manualCorrect",
    "manualIncorrect", "winningTeam", "gameMode", "questionType",
}
SHORT_ANSWER_MAX = 3
AR_DIACRITICS = (
    "\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0656"
    "\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u065F"
)


def normalize(value: str) -> str:
    """Mirror the shared Arabic normalizer used by the game backend."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if ch not in AR_DIACRITICS)
    text = text.replace("\u0623", "\u0627").replace("\u0625", "\u0627").replace("\u0622", "\u0627")
    text = text.replace("\u0649", "\u064A").replace("\u0629", "\u0647")
    text = re.sub(r"[\W_]+", " ", text, flags=re.UNICODE).strip().lower()
    text = re.sub(r"\s+", " ", text)
    for article in ("the", "\u0627\u0644"):
        if text.startswith(article + " ") and len(text) > len(article) + 1:
            text = text[len(article) + 1:]
    return text


def walk_keys(value, keys=None):
    if keys is None:
        keys = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(key)
            walk_keys(child, keys)
    elif isinstance(value, list):
        for child in value:
            walk_keys(child, keys)
    return keys


def text_of(localized) -> str:
    if not isinstance(localized, dict):
        return ""
    return str(localized.get("ar", "")).strip()


def leaks(answer: str, corpus: list[str]) -> bool:
    if not answer:
        return False
    if len(answer) > SHORT_ANSWER_MAX:
        return any(answer in entry for entry in corpus)
    tokens = set()
    for entry in corpus:
        tokens.update(entry.split(" "))
    return answer in tokens


def validate(item: dict) -> list[str]:
    errors: list[str] = []

    if "one-clue" not in item.get("compatibleChallengeTypeIds", []):
        errors.append("challenge_type_invalid")
    if item.get("patternId") != PATTERN_ID:
        errors.append("pattern_id_invalid")
    if item.get("answerMode") != MODE:
        errors.append("answer_mode_invalid")

    answer, mechanic = item.get("answerPayload"), item.get("mechanicPayload")
    if not isinstance(answer, dict) or not isinstance(mechanic, dict):
        return sorted(set(errors + ["native_payload_object_required"]))

    if answer.get("mode") != ITEM_MODE:
        errors.append("answer_mode_invalid")
    accepted = answer.get("acceptedAnswers")
    normalized_answers: list[str] = []
    if not isinstance(accepted, list) or not all(
        isinstance(x, str) and x.strip() for x in accepted
    ):
        errors.append("machine_truth_invalid")
    else:
        normalized_answers = [normalize(x) for x in accepted]
        if any(not x for x in normalized_answers):
            errors.append("machine_truth_invalid")
        if len(set(normalized_answers)) != len(normalized_answers):
            errors.append("duplicate_accepted_answer")
        if any(x.strip() == "" for x in accepted):
            errors.append("machine_truth_invalid")

    clues = mechanic.get("clues")
    if not isinstance(clues, list) or len(clues) != 5:
        errors.append("clue_count_invalid")
    else:
        orders = [clue.get("order") for clue in clues if isinstance(clue, dict)]
        values = [clue.get("value") for clue in clues if isinstance(clue, dict)]
        if orders != ORDER:
            errors.append("clue_order_invalid")
        if values != ONE_CLUE_VALUES:
            errors.append("clue_value_invalid")
        if any(not isinstance(clue, dict) for clue in clues):
            errors.append("clue_structure_invalid")
        for clue in clues:
            if not isinstance(clue, dict):
                continue
            text = text_of(clue.get("text"))
            if not text:
                errors.append("clue_text_missing")
        normalized_texts = [
            normalize(text_of(clue.get("text")))
            for clue in clues
            if isinstance(clue, dict)
        ]
        nonempty = [x for x in normalized_texts if x]
        if len(nonempty) != len(set(nonempty)):
            errors.append("duplicate_clue_text")

    if TRUTH_KEYS & walk_keys(mechanic):
        errors.append("truth_duplicated_in_mechanic")
    if RUNTIME_KEYS & walk_keys(mechanic):
        errors.append("runtime_field_in_mechanic")
    if LEGACY_FIELDS & set(item):
        errors.append("legacy_field_present")

    if isinstance(accepted, list):
        public_corpus = []
        prompt_text = text_of(item.get("prompt"))
        if prompt_text:
            public_corpus.append(normalize(prompt_text))
        if isinstance(clues, list):
            public_corpus += [
                normalize(text_of(clue.get("text")))
                for clue in clues
                if isinstance(clue, dict)
            ]
        for normalized in normalized_answers:
            if leaks(normalized, public_corpus):
                errors.append("public_truth_leakage")

    if item.get("isReusableAcrossSessions") is not False:
        errors.append("reuse_policy_invalid")
    if item.get("media") is not None:
        errors.append("media_not_allowed")

    metadata = item.get("metadata", {})
    status = item.get("status")
    if status not in {"draft", "reviewed", "ready", "blocked"} or metadata.get("validationStatus") != status:
        errors.append("validation_status_invalid")
    if metadata.get("runtimeContractStatus") != "fully_playable":
        errors.append("runtime_status_invalid")
    if metadata.get("runtimeBlocker") not in (None, ""):
        errors.append("runtime_status_invalid")

    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    failed = False
    for raw_path in args.paths:
        path = Path(raw_path)
        item = json.loads(path.read_text(encoding="utf-8"))
        errors = validate(item)
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
