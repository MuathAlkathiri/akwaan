#!/usr/bin/env python3
"""Regression tests for global archetypes versus scoped puzzle families."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path


VALIDATOR_DIR = Path(__file__).resolve().parent
REPO_ROOT = VALIDATOR_DIR.parents[2]
sys.path.insert(0, str(VALIDATOR_DIR))

from validate_moving_xo import FAMILIES, RETIRED_SCOPES, validate as validate_moving_xo  # noqa: E402
from validate_question_craft import VALID_ARCHETYPES, validate_single_item  # noqa: E402
from validate_rakkibha import validate_authoring  # noqa: E402


ARCHETYPES_DOC = REPO_ROOT / "ai/.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md"
PUZZLE_FAMILY_DOC = REPO_ROOT / "ai/.opencode/knowledge/architecture/PUZZLE-FAMILY.md"
HISTORICAL_GALLERY = REPO_ROOT / "ai/review/puzzles-observation-illusions-r1-gallery.html"


def canonical_archetypes_from_doc() -> set[str]:
    """Read the registry table; production validation has no second registry."""
    values: set[str] = set()
    for line in ARCHETYPES_DOC.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\|\s*`([A-Z][A-Z0-9_]*)`\s*\|", line)
        if match:
            values.add(match.group(1))
    return values


def moving_xo_fixture(scope: str, family: str, profile: dict) -> dict:
    mode = "multiple_choice" if "multiple_choice" in profile["modes"] else "match"
    if mode == "multiple_choice":
        answer_payload = {
            "mode": mode,
            "options": [
                {"id": "a", "label": {"ar": "أ"}},
                {"id": "b", "label": {"ar": "ب"}},
            ],
            "correctOptionId": "a",
        }
    else:
        answer_payload = {"mode": mode, "acceptedAnswers": ["قلم"]}
    row = {
        "contentItemId": f"{scope}-{family}",
        "scope": scope,
        "family": family,
        "prompt": {"ar": "سؤال قصير؟"},
        "answerPayload": answer_payload,
    }
    if profile["media"] == "required":
        row["media"] = {
            "type": "image",
            "assets": [{"url": "https://cdn.akwaan.test/family.png"}],
        }
    return row


class ArchetypeOwnershipTests(unittest.TestCase):
    def test_validator_matches_the_single_20_id_documented_registry(self) -> None:
        documented = canonical_archetypes_from_doc()
        self.assertEqual(len(documented), 20)
        self.assertEqual(VALID_ARCHETYPES, documented)

    def test_all_canonical_archetypes_are_accepted(self) -> None:
        for archetype in VALID_ARCHETYPES:
            errors = validate_single_item(
                {"id": archetype, "questionArchetype": archetype, "prompt": {"ar": "سؤال؟"}}
            )
            self.assertEqual(errors, [], archetype)

    def test_question_archetype_is_optional(self) -> None:
        self.assertEqual(validate_single_item({"id": "missing", "prompt": {"ar": "سؤال؟"}}), [])

    def test_unknown_and_puzzle_family_are_rejected(self) -> None:
        for value in ("NOT_AN_ARCHETYPE", "PUZZLE_FAMILY"):
            errors = validate_single_item(
                {"id": value, "questionArchetype": value, "prompt": {"ar": "سؤال؟"}}
            )
            self.assertTrue(any("Invalid questionArchetype" in error for error in errors), value)

    def test_puzzle_family_is_rejected_even_in_puzzles_world(self) -> None:
        errors = validate_single_item(
            {
                "id": "puzzles-item",
                "world": "puzzles",
                "scope": "observation-illusions",
                "questionArchetype": "PUZZLE_FAMILY",
                "prompt": {"ar": "سؤال؟"},
            }
        )
        self.assertTrue(any("Invalid questionArchetype" in error for error in errors))

    def test_scoped_moving_xo_family_is_not_a_global_archetype(self) -> None:
        row = {
            "id": "moving-xo-family",
            "world": "puzzles",
            "scope": "wordplay-letters",
            "family": "anagram-rearrange",
            "prompt": {"ar": "سؤال؟"},
        }
        self.assertEqual(validate_single_item(row), [])

    def test_all_78_scope_owned_families_remain_valid(self) -> None:
        family_count = sum(len(families) for families in FAMILIES.values())
        self.assertEqual(len(FAMILIES), 6)
        self.assertEqual(family_count, 78)
        self.assertEqual(family_count, len({family for families in FAMILIES.values() for family in families}))
        for scope, families in FAMILIES.items():
            for family, profile in families.items():
                self.assertEqual(
                    validate_moving_xo(moving_xo_fixture(scope, family, profile)),
                    [],
                    f"{scope}/{family}",
                )

    def test_unknown_and_retired_moving_xo_families_remain_rejected(self) -> None:
        self.assertTrue(validate_moving_xo({
            "scope": "wordplay-letters",
            "family": "not-a-family",
            "prompt": {"ar": "سؤال؟"},
            "answerPayload": {"mode": "match", "acceptedAnswers": ["قلم"]},
        }))
        for scope in RETIRED_SCOPES:
            self.assertTrue(validate_moving_xo({
                "scope": scope,
                "family": "anagram-rearrange",
                "prompt": {"ar": "سؤال؟"},
                "answerPayload": {"mode": "match", "acceptedAnswers": ["قلم"]},
            }), scope)

    def test_rakkibha_interaction_pattern_contract_is_unchanged(self) -> None:
        valid = {
            "authoring": {
                "rakkibha": {
                    "interactionPattern": "ROUTE_NAVIGATION",
                    "runtimeCompatibility": "CURRENT_RUNTIME_COMPATIBLE",
                    "expectedConversation": "نقارن ما نراه ونستبعد الخيارات.",
                    "scopeSlug": "observation-illusions",
                }
            }
        }
        self.assertEqual(validate_authoring(valid), [])
        invalid = {
            "authoring": {
                "rakkibha": {
                    **valid["authoring"]["rakkibha"],
                    "interactionPattern": "PUZZLE_FAMILY",
                }
            }
        }
        self.assertIn("interaction_pattern_unknown", validate_authoring(invalid))

    def test_historical_puzzle_family_references_remain_untouched(self) -> None:
        self.assertIn("PUZZLE_FAMILY", PUZZLE_FAMILY_DOC.read_text(encoding="utf-8"))
        self.assertIn("PUZZLE_FAMILY", HISTORICAL_GALLERY.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
