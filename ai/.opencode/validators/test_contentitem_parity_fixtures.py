#!/usr/bin/env python3
"""Test-only contract checks for the cross-layer ContentItem parity vectors."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict

VALIDATOR_ROOT = Path(__file__).resolve().parent
FIXTURE = VALIDATOR_ROOT / "examples" / "contentitem-parity.v1.json"
sys.path.insert(0, str(VALIDATOR_ROOT))

from validate_question_craft import validate_single_item  # noqa: E402


EXPECTED_CASES = {
    "valid-ryo-multiple-choice",
    "missing-required-prompt",
    "invalid-correct-option-id",
}
LAYER_NAMES = {"questionCraft", "deterministicScreen", "compatibility"}


def load_fixture() -> Dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def assert_contract(document: Dict[str, Any]) -> None:
    def check(condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)

    check(document.get("version") == 1, "fixture version must be 1")
    check(
        document.get("contract") == "contentitem-validation-parity",
        "fixture contract name is invalid",
    )
    cases = document.get("cases")
    check(isinstance(cases, list), "fixture cases must be a list")
    check(
        {case.get("id") for case in cases} == EXPECTED_CASES,
        "fixture case IDs do not match the approved three cases",
    )

    for case in cases:
        check(isinstance(case.get("id"), str), "case ID must be a string")
        item = case.get("item")
        context = case.get("context")
        layers = case.get("layers")
        check(isinstance(item, dict), f"{case.get('id')}: item must be an object")
        check(
            isinstance(context, dict),
            f"{case.get('id')}: context must be an object",
        )
        check(isinstance(layers, dict), f"{case.get('id')}: layers must be an object")
        check(set(layers) == LAYER_NAMES, f"{case.get('id')}: layer set is incomplete")
        check(
            item.get("compatibleChallengeTypeKey"),
            f"{case.get('id')}: challenge type key is missing",
        )
        check(
            item.get("compatibleChallengeTypeKey")
            == context.get("challengeTypeKey"),
            f"{case.get('id')}: item/context challenge keys differ",
        )

        prompt = item.get("prompt")
        payload = item.get("answerPayload")
        check(isinstance(prompt, dict), f"{case.get('id')}: prompt must be an object")
        check("ar" in prompt, f"{case.get('id')}: Arabic prompt is missing")
        check(
            isinstance(payload, dict),
            f"{case.get('id')}: answer payload must be an object",
        )
        check(
            payload.get("mode") == "multiple_choice",
            f"{case.get('id')}: expected multiple-choice payload",
        )
        check(
            isinstance(payload.get("options"), list)
            and len(payload["options"]) >= 2,
            f"{case.get('id')}: realistic options are required",
        )
        check(
            isinstance(payload.get("correctOptionId"), str),
            f"{case.get('id')}: correct option ID is missing",
        )

        for layer_name, expectation in layers.items():
            check(isinstance(expectation, dict), f"{case.get('id')}: {layer_name} missing")
            check(
                isinstance(expectation.get("applicable"), bool),
                f"{case.get('id')}: {layer_name}.applicable must be boolean",
            )
            expected = expectation.get("expected")
            check(
                isinstance(expected, str),
                f"{case.get('id')}: {layer_name}.expected must be a string",
            )
            if expectation["applicable"]:
                check(
                    expected != "not_applicable",
                    f"{case.get('id')}: applicable {layer_name} cannot be N/A",
                )
            else:
                check(
                    expected == "not_applicable",
                    f"{case.get('id')}: non-applicable {layer_name} must be N/A",
                )
                check(
                    bool(expectation.get("reason")),
                    f"{case.get('id')}: non-applicable {layer_name} needs a reason",
                )

        screen = layers["deterministicScreen"]
        check(
            isinstance(screen.get("blockingCodes"), list),
            f"{case.get('id')}: screen blockingCodes must be a list",
        )
        if screen["expected"] == "pass":
            check(
                screen["blockingCodes"] == [],
                f"{case.get('id')}: passing screen case cannot expect blockers",
            )
        else:
            check(
                bool(screen["blockingCodes"]),
                f"{case.get('id')}: failing screen case needs blockers",
            )

        compatibility = layers["compatibility"]
        check(
            isinstance(compatibility.get("blockerCodes"), list),
            f"{case.get('id')}: compatibility blockerCodes must be a list",
        )
        if compatibility["expected"] == "deferred":
            check(
                compatibility["blockerCodes"] == [],
                f"{case.get('id')}: deferred case cannot expect blockers",
            )
        else:
            check(
                bool(compatibility["blockerCodes"]),
                f"{case.get('id')}: blocked case needs blockers",
            )


class ContentItemParityFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = load_fixture()
        assert_contract(cls.document)

    def test_contract_has_exactly_three_complete_cases(self) -> None:
        self.assertEqual(len(self.document["cases"]), 3)

    def test_contract_rejects_incomplete_case_sets(self) -> None:
        malformed = dict(self.document)
        malformed["cases"] = self.document["cases"][:2]
        with self.assertRaises(AssertionError):
            assert_contract(malformed)

    def test_applicable_question_craft_case_uses_real_validator(self) -> None:
        case = next(
            case
            for case in self.document["cases"]
            if case["id"] == "valid-ryo-multiple-choice"
        )
        item = dict(case["item"])
        item["id"] = case["id"]
        errors = validate_single_item(item)
        self.assertEqual(errors, [])
        self.assertEqual(case["layers"]["questionCraft"]["expected"], "pass")

    def test_canonical_payload_cases_are_explicitly_not_applicable_to_question_craft(self) -> None:
        for case in self.document["cases"]:
            if case["id"] == "valid-ryo-multiple-choice":
                continue
            expectation = case["layers"]["questionCraft"]
            self.assertFalse(expectation["applicable"])
            self.assertEqual(expectation["expected"], "not_applicable")


if __name__ == "__main__":
    unittest.main()
