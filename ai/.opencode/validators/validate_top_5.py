#!/usr/bin/env python3
"""Validate canonical Top 5 ContentItems beyond JSON Schema expressiveness."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


def validate(item: dict) -> list[str]:
    errors: list[str] = []
    if "top-5" not in item.get("compatibleChallengeTypeIds", []):
        errors.append("compatibleChallengeTypeIds must contain top-5")
    if item.get("patternId") != "keep-or-give":
        errors.append("patternId must be keep-or-give for active authoring")
    if item.get("answerMode") != "top_5":
        errors.append("answerMode must be top_5")

    prompt = " ".join(item.get("prompt", {}).values()).lower()
    manual_markers = ("rank these", "rank the", "رتب ", "رتّب ")
    if any(marker in prompt for marker in manual_markers):
        errors.append("prompt instructs players to rank entries manually")

    interaction = item.get("interactionPayload", {})
    resolution = item.get("resolutionPayload", {})
    expected_interaction = {
        "variant": "keep-or-give",
        "teamCount": 2,
        "turnCount": 10,
        "turnDeadlineSeconds": 15,
        "actions": ["keep", "give"],
        "timeoutAction": "keep",
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

    entries = interaction.get("entries", [])
    entry_ids = [entry.get("id") for entry in entries]
    entry_labels = [entry.get("label") for entry in entries]
    if len(entries) != 10:
        errors.append("exactly 10 entries are required")
    if None in entry_ids or len(set(entry_ids)) != len(entry_ids):
        errors.append("entry IDs must be present and unique")
    if len(set(entry_labels)) != len(entry_labels):
        errors.append("entry labels must be unique")

    ranked = [entry for entry in entries if entry.get("rank") is not None]
    traps = [entry for entry in entries if entry.get("rank") is None]
    ranks = [entry.get("rank") for entry in ranked]
    if len(ranked) != 5:
        errors.append("exactly 5 ranked entries are required")
    if set(ranks) != set(range(1, 6)):
        errors.append("ranks must be the unique integers 1 through 5")
    if len(traps) != 5:
        errors.append("exactly 5 traps (rank null) are required")
    ranked_ids = {entry.get("id") for entry in ranked}
    trap_ids = {entry.get("id") for entry in traps}
    if ranked_ids & trap_ids:
        errors.append("ranked and trap sets must be disjoint")
    if ranked_ids | trap_ids != set(entry_ids):
        errors.append("ranked and trap sets must cover all entries exactly")

    source_values = [entry.get("sourceValue") for entry in entries if "sourceValue" in entry]
    if any(count > 1 for count in Counter(map(str, source_values)).values()) and not interaction.get("tiebreaker"):
        errors.append("equal source values require an authoritative tiebreaker")

    expected_resolution = {
        "scoringRuleId": "top-5.result",
        "winnerScoreEventType": "top-5.win",
        "tieScoreEventType": None,
        "runtimeEventTypes": ["top5-card-decided", "top5-completed"],
    }
    for key, expected in expected_resolution.items():
        if resolution.get(key) != expected:
            errors.append(f"resolutionPayload.{key} must equal {expected!r}")

    reviews = item.get("metadata", {}).get("trapReview", [])
    reviewed_ids = [review.get("candidateId") for review in reviews]
    if len(reviews) != 5 or set(reviewed_ids) != trap_ids:
        errors.append("trapReview must cover all five traps exactly")
    for review in reviews:
        if review.get("cutoffDistance", 0) < 1 or not review.get("plausibility"):
            errors.append(f"incomplete trap review for {review.get('candidateId')}")
        if review.get("tooEasy") is True:
            errors.append(f"trap marked too easy: {review.get('candidateId')}")

    return errors


def main(paths: list[str]) -> int:
    if not paths:
        print("usage: validate_top_5.py <contentitem.json> [...]", file=sys.stderr)
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
