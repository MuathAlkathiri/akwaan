#!/usr/bin/env python3
"""Test-only contract checks for the cross-layer ContentItem parity vectors."""

from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path
from typing import Any, Dict

VALIDATOR_ROOT = Path(__file__).resolve().parent
FIXTURE = VALIDATOR_ROOT / "examples" / "contentitem-parity.v1.json"
sys.path.insert(0, str(VALIDATOR_ROOT))

from validate_question_craft import validate_single_item  # noqa: E402
from validate_one_clue import validate as validate_one_clue  # noqa: E402
from validate_closest import validate as validate_closest  # noqa: E402


EXPECTED_CASES = {
    "valid-ryo-multiple-choice",
    "missing-required-prompt",
    "invalid-correct-option-id",
    "normalized-mc-answer-leakage",
    "normalized-match-duplicate",
    "match-public-truth-leakage",
    "scope-excludes-challenge-type",
    "challenge-type-answer-mode-mismatch",
    "media-shape-missing-assets",
    "resolved-media-awaiting-ready",
    "moving-xo-visual-scope-media-required",
    "valid-closest-numeric-range",
    "closest-target-off-step",
}
LAYER_NAMES = {"questionCraft", "deterministicScreen", "compatibility"}
CHALLENGE_KEYS = {"ryo", "match", "moving-xo", "closest"}
WORLD_KEYS = {"football", "puzzles"}
SCOPE_KEYS = {"world-cup", "observation-illusions"}


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
        len(cases) == len(EXPECTED_CASES),
        "fixture must contain exactly the approved number of cases",
    )
    check(
        {case.get("id") for case in cases} == EXPECTED_CASES,
        "fixture case IDs do not match the approved thirteen cases",
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
        check(
            context.get("challengeTypeKey") in CHALLENGE_KEYS,
            f"{case.get('id')}: unsupported symbolic challenge key",
        )
        check(
            context.get("worldKey") in WORLD_KEYS,
            f"{case.get('id')}: unsupported symbolic World key",
        )
        check(
            context.get("scopeKey") in SCOPE_KEYS,
            f"{case.get('id')}: unsupported symbolic Scope key",
        )
        if "scopeExcludedChallengeTypeKey" in context:
            check(
                context["scopeExcludedChallengeTypeKey"] in CHALLENGE_KEYS,
                f"{case.get('id')}: unsupported excluded challenge key",
            )

        prompt = item.get("prompt")
        payload = item.get("answerPayload")
        check(isinstance(prompt, dict), f"{case.get('id')}: prompt must be an object")
        check("ar" in prompt, f"{case.get('id')}: Arabic prompt is missing")
        check(
            isinstance(payload, dict),
            f"{case.get('id')}: answer payload must be an object",
        )
        if payload.get("mode") == "multiple_choice":
            check(
                isinstance(payload.get("options"), list)
                and len(payload["options"]) >= 2,
                f"{case.get('id')}: realistic options are required",
            )
            check(
                isinstance(payload.get("correctOptionId"), str),
                f"{case.get('id')}: correct option ID is missing",
            )
        elif payload.get("mode") == "match":
            check(
                isinstance(payload.get("acceptedAnswers"), list)
                and len(payload["acceptedAnswers"]) >= 1
                and all(isinstance(answer, str) for answer in payload["acceptedAnswers"]),
                f"{case.get('id')}: realistic accepted answers are required",
            )
        elif payload.get("mode") == "closest":
            target = payload.get("correctValue")
            check(
                isinstance(target, (int, float))
                and not isinstance(target, bool)
                and math.isfinite(target),
                f"{case.get('id')}: Closest correctValue must be finite",
            )
            mechanic_payload = item.get("mechanicPayload")
            check(
                isinstance(mechanic_payload, dict),
                f"{case.get('id')}: Closest mechanicPayload is required",
            )
            slider = mechanic_payload.get("closestSlider")
            check(
                isinstance(slider, dict),
                f"{case.get('id')}: Closest slider metadata is required",
            )
            check(
                slider.get("mode") == "numeric-range",
                f"{case.get('id')}: parity Closest fixtures require numeric-range",
            )
            low, high, step = slider.get("min"), slider.get("max"), slider.get("step")
            check(
                all(
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and math.isfinite(value)
                    for value in (low, high, step)
                ),
                f"{case.get('id')}: Closest range metadata must be finite",
            )
            check(low < high and step > 0, f"{case.get('id')}: Closest range is invalid")
            check(low <= target <= high, f"{case.get('id')}: Closest target is out of range")
        else:
            check(False, f"{case.get('id')}: unsupported answer payload mode")

        if "media" in item:
            media = item["media"]
            check(isinstance(media, dict), f"{case.get('id')}: media must be an object")
            check(
                media.get("type") in {"none", "image", "audio", "video"},
                f"{case.get('id')}: unsupported media type",
            )
            check(
                isinstance(media.get("assets"), list),
                f"{case.get('id')}: media assets must be a list",
            )
            for asset in media["assets"]:
                check(isinstance(asset, dict), f"{case.get('id')}: media asset must be an object")
                if "url" in asset:
                    check(isinstance(asset["url"], str), f"{case.get('id')}: media asset URL must be a string")

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
            if "diagnosticContains" in expectation:
                check(
                    isinstance(expectation["diagnosticContains"], list)
                    and all(
                        isinstance(value, str) and value
                        for value in expectation["diagnosticContains"]
                    ),
                    f"{case.get('id')}: diagnosticContains must be non-empty strings",
                )
            if "deferredCodes" in expectation:
                check(
                    isinstance(expectation["deferredCodes"], list)
                    and all(
                        isinstance(value, str) and value
                        for value in expectation["deferredCodes"]
                    ),
                    f"{case.get('id')}: deferredCodes must be non-empty strings",
                )

        screen = layers["deterministicScreen"]
        check(
            isinstance(screen.get("blockingCodes"), list),
            f"{case.get('id')}: screen blockingCodes must be a list",
        )
        if not screen["applicable"]:
            check(
                screen["blockingCodes"] == [],
                f"{case.get('id')}: non-applicable screen cannot expect blockers",
            )
        elif screen["expected"] == "pass":
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
        if not compatibility["applicable"]:
            check(
                compatibility["blockerCodes"] == [],
                f"{case.get('id')}: non-applicable compatibility cannot expect blockers",
            )
        elif compatibility["expected"] == "deferred":
            check(
                compatibility["blockerCodes"] == [],
                f"{case.get('id')}: deferred case cannot expect blockers",
            )
        else:
            check(
                bool(compatibility["blockerCodes"]),
                f"{case.get('id')}: blocked case needs blockers",
            )

        mechanic = case.get("mechanicValidator")
        if mechanic is not None:
            check(
                isinstance(mechanic, dict),
                f"{case.get('id')}: mechanicValidator must be an object",
            )
            check(
                set(mechanic).issubset(
                    {
                        "key",
                        "baseFixture",
                        "applicable",
                        "expected",
                        "diagnosticCodes",
                        "diagnosticContains",
                        "overrides",
                    }
                ),
                f"{case.get('id')}: unknown mechanicValidator field",
            )
            check(mechanic.get("applicable") is True, f"{case.get('id')}: mechanic validator must apply")
            check(mechanic.get("expected") in {"pass", "fail"}, f"{case.get('id')}: invalid mechanic expectation")
            if mechanic.get("key") == "one-clue":
                check(
                    mechanic.get("baseFixture") == "one-clue.valid.json",
                    f"{case.get('id')}: mechanic fixture must use the canonical One Clue fixture",
                )
                check(
                    isinstance(mechanic.get("diagnosticCodes"), list)
                    and all(isinstance(code, str) and code for code in mechanic["diagnosticCodes"]),
                    f"{case.get('id')}: mechanic diagnostic codes are required",
                )
                check(isinstance(mechanic.get("overrides"), dict), f"{case.get('id')}: mechanic overrides are required")
            elif mechanic.get("key") == "closest":
                check("baseFixture" not in mechanic, f"{case.get('id')}: Closest uses the native item contract")
                check(
                    isinstance(mechanic.get("diagnosticContains"), list)
                    and all(isinstance(value, str) and value for value in mechanic["diagnosticContains"]),
                    f"{case.get('id')}: Closest diagnosticContains must be a string list",
                )
            else:
                check(False, f"{case.get('id')}: unsupported mechanic validator")


def merge_fixture(target: dict[str, Any], patch: dict[str, Any]) -> None:
    """Test-only deep merge for applying fixture overrides to native examples."""
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            merge_fixture(target[key], value)
        else:
            target[key] = value


def load_mechanic_fixture(case: dict[str, Any]) -> dict[str, Any]:
    mechanic = case["mechanicValidator"]
    source = VALIDATOR_ROOT / "examples" / mechanic["baseFixture"]
    item = json.loads(source.read_text(encoding="utf-8"))
    merge_fixture(item, mechanic["overrides"])
    return item


class ContentItemParityFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = load_fixture()
        assert_contract(cls.document)

    def test_contract_has_exactly_thirteen_complete_cases(self) -> None:
        self.assertEqual(len(self.document["cases"]), 13)

    def test_contract_rejects_incomplete_case_sets(self) -> None:
        malformed = dict(self.document)
        malformed["cases"] = self.document["cases"][:2]
        with self.assertRaises(AssertionError):
            assert_contract(malformed)

    def test_contract_rejects_unknown_layer_names(self) -> None:
        malformed = json.loads(json.dumps(self.document))
        malformed["cases"][0]["layers"]["unexpected"] = {
            "applicable": False,
            "expected": "not_applicable",
            "reason": "unsupported layer",
        }
        with self.assertRaises(AssertionError):
            assert_contract(malformed)

    def test_contract_rejects_invalid_symbolic_keys(self) -> None:
        malformed = json.loads(json.dumps(self.document))
        malformed["cases"][0]["context"]["challengeTypeKey"] = "unknown"
        malformed["cases"][0]["item"]["compatibleChallengeTypeKey"] = "unknown"
        with self.assertRaises(AssertionError):
            assert_contract(malformed)

    def test_contract_rejects_malformed_closest_metadata(self) -> None:
        malformed = json.loads(json.dumps(self.document))
        closest = next(
            case for case in malformed["cases"] if case["id"] == "valid-closest-numeric-range"
        )
        closest["item"]["mechanicPayload"]["closestSlider"]["mode"] = "legacy"
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
            expectation = case["layers"]["questionCraft"]
            if not expectation["applicable"]:
                self.assertEqual(expectation["expected"], "not_applicable")

    def test_question_craft_leakage_uses_its_existing_contract(self) -> None:
        case = next(
            case
            for case in self.document["cases"]
            if case["id"] == "match-public-truth-leakage"
        )
        item = dict(case["item"])
        item["id"] = case["id"]
        errors = validate_single_item(item)
        for expected in case["layers"]["questionCraft"]["diagnosticContains"]:
            self.assertTrue(
                any(expected in error for error in errors),
                f"expected Question Craft diagnostic {expected!r}, got {errors}",
            )

    def test_mechanic_validator_expectations_use_real_native_validators(self) -> None:
        for case in self.document["cases"]:
            mechanic = case.get("mechanicValidator")
            if not mechanic or not mechanic["applicable"]:
                continue
            if mechanic["key"] == "one-clue":
                errors = validate_one_clue(load_mechanic_fixture(case))
                self.assertEqual(mechanic["expected"], "fail")
                for expected in mechanic["diagnosticCodes"]:
                    self.assertIn(expected, errors, f"{case['id']}: {errors}")
            else:
                errors = validate_closest(case["item"])
                self.assertEqual(
                    mechanic["expected"] == "pass",
                    not errors,
                    f"{case['id']}: {errors}",
                )
                for expected in mechanic["diagnosticContains"]:
                    self.assertTrue(
                        any(expected in error for error in errors),
                        f"{case['id']}: expected {expected!r}, got {errors}",
                    )


if __name__ == "__main__":
    unittest.main()
