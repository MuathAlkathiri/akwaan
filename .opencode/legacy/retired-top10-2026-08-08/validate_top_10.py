#!/usr/bin/env python3
"""Validate canonical Top 10 ContentItems beyond JSON Schema expressiveness."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


def validate(item: dict) -> list[str]:
    errors: list[str] = []
    if "top-10" not in item.get("compatibleChallengeTypeIds", []):
        errors.append("compatibleChallengeTypeIds must contain top-10")
    if item.get("patternId") != "poison-deck":
        errors.append("patternId must be poison-deck for active authoring")
    if item.get("answerMode") != "top_10":
        errors.append("answerMode must be top_10")

    prompt = " ".join(item.get("prompt", {}).values()).lower()
    manual_markers = ("rank these", "rank the", "رتب ", "رتّب ")
    if any(marker in prompt for marker in manual_markers):
        errors.append("prompt instructs players to rank candidates manually")

    interaction = item.get("interactionPayload", {})
    resolution = item.get("resolutionPayload", {})
    expected_interaction = {
        "variant": "poison-deck",
        "teamCount": 2,
        "turnCount": 14,
        "turnDeadlineSeconds": 6,
        "actions": ["KEEP", "POISON"],
        "timeoutAction": "KEEP",
    }
    for key, expected in expected_interaction.items():
        if interaction.get(key) != expected:
            errors.append(f"interactionPayload.{key} must equal {expected!r}")

    for key in ("title", "rankingBasis", "sourceLabel", "sourceUrl", "asOfDate"):
        if not interaction.get(key):
            errors.append(f"interactionPayload.{key} is required")
    source_url = interaction.get("sourceUrl", "")
    if source_url and urlparse(source_url).scheme not in {"http", "https"}:
        errors.append("sourceUrl must use http or https")
    try:
        date.fromisoformat(interaction.get("asOfDate", ""))
    except ValueError:
        errors.append("asOfDate must be a valid ISO date")

    candidates = interaction.get("candidates", [])
    candidate_ids = [candidate.get("id") for candidate in candidates]
    if len(candidates) != 14:
        errors.append("exactly 14 candidates are required")
    if None in candidate_ids or len(set(candidate_ids)) != len(candidate_ids):
        errors.append("candidate IDs must be present and unique")

    ranked = resolution.get("rankedEntries", [])
    ranked_ids = [entry.get("candidateId") for entry in ranked]
    ranks = [entry.get("rank") for entry in ranked]
    if len(ranked) != 10:
        errors.append("exactly 10 ranked entries are required")
    if len(set(ranked_ids)) != len(ranked_ids):
        errors.append("ranked candidate IDs must be unique")
    if set(ranks) != set(range(1, 11)):
        errors.append("ranks must be the unique integers 1 through 10")

    decoys = resolution.get("decoyCandidateIds", [])
    if len(decoys) != 4 or len(set(decoys)) != 4:
        errors.append("exactly 4 unique decoy IDs are required")
    if set(ranked_ids) & set(decoys):
        errors.append("ranked and decoy sets must be disjoint")
    if set(ranked_ids) | set(decoys) != set(candidate_ids):
        errors.append("ranked and decoy sets must cover all candidates exactly")

    source_values = [candidate.get("sourceValue") for candidate in candidates if "sourceValue" in candidate]
    if any(count > 1 for count in Counter(map(str, source_values)).values()) and not interaction.get("tiebreaker"):
        errors.append("equal source values require an authoritative tiebreaker")

    expected_resolution = {
        "revealOrder": "rank_10_to_1_then_decoys",
        "validOwnedCardValue": 1,
        "decoyOwnedCardValue": -1,
        "poisonBonus": 0,
        "scoringRuleId": "top10.poison-deck.result",
        "winnerScoreEventType": "top10.poison-deck.win",
        "tieScoreEventType": None,
        "socialMetricIds": ["successfulPoison", "giftedValidCard", "selfKeptDecoy", "selfKeptValid"],
    }
    for key, expected in expected_resolution.items():
        if resolution.get(key) != expected:
            errors.append(f"resolutionPayload.{key} must equal {expected!r}")

    reviews = item.get("metadata", {}).get("decoyReview", [])
    reviewed_ids = [review.get("candidateId") for review in reviews]
    if len(reviews) != 4 or set(reviewed_ids) != set(decoys):
        errors.append("decoyReview must cover all four decoys exactly")
    for review in reviews:
        if review.get("cutoffDistance", 0) < 1 or not review.get("plausibility"):
            errors.append(f"incomplete decoy review for {review.get('candidateId')}")
        if review.get("tooEasy") is True:
            errors.append(f"decoy marked too easy: {review.get('candidateId')}")

    return errors


def main(paths: list[str]) -> int:
    if not paths:
        print("usage: validate_top_10.py <contentitem.json> [...]", file=sys.stderr)
        return 2
    failed = False
    for raw_path in paths:
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
    raise SystemExit(main(sys.argv[1:]))
