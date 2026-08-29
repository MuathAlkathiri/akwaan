#!/usr/bin/env python3
"""Focused contract tests for the Rakkibha pattern library."""
from validate_rakkibha import canonical_puzzles_scope_slugs, validate_authoring, validate_batch


def item(pattern, compatibility, **extra):
    payload = {
        "authoring": {"rakkibha": {
            "interactionPattern": pattern,
            "runtimeCompatibility": compatibility,
            "expectedConversation": "أصف ما أرى ثم نقارن الخيارات ونستبعد غير المطابق.",
            "scopeSlug": "logic-deduction",
            **extra,
        }}
    }
    if compatibility == "NEEDS_RUNTIME_EXTENSION":
        payload["metadata"] = {"runtimeContractStatus": "authoring_only"}
    return payload


def expect(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    expect(not validate_authoring(item("ROUTE_NAVIGATION", "CURRENT_RUNTIME_COMPATIBLE")), "canonical route rejected")
    expect("interaction_pattern_unknown" in validate_authoring(item("GEAR_THEME", "CURRENT_RUNTIME_COMPATIBLE")), "unknown pattern accepted")
    expect("runtime_compatibility_mismatch" in validate_authoring(item("ODD_SCENE_MATCHING_PAIR", "CURRENT_RUNTIME_COMPATIBLE")), "odd scene compatibility mismatch missed")

    symbol = {"input": "△ ○ □", "rule": "اقلب الترتيب ثم بدّل المثلث بالمربع.", "operation": "transform", "derivedCandidate": "□ ○ △", "directVisualCopy": False}
    expect(not validate_authoring(item("SYMBOL_CODE_RECONSTRUCTION", "CURRENT_RUNTIME_COMPATIBLE", symbolReconstruction=symbol)), "symbol reconstruction rejected")
    direct_copy = {**symbol, "derivedCandidate": symbol["input"]}
    expect("symbol_reconstruction_direct_copy" in validate_authoring(item("SYMBOL_CODE_RECONSTRUCTION", "CURRENT_RUNTIME_COMPATIBLE", symbolReconstruction=direct_copy)), "direct symbol copy accepted")

    defuse = {"device": {"id": "panel-7", "baselineState": "amber light, wire A intact", "actionableState": "cut wire B only"}, "contributions": [{"holderId": "reference", "deviceId": "panel-7", "information": "The amber light is active."}, {"holderId": "rules", "deviceId": "panel-7", "information": "Amber means cut wire B."}]}
    expect(not validate_authoring(item("DEFUSE_LOGIC", "CURRENT_RUNTIME_COMPATIBLE", defuseLogic=defuse)), "shared-device defuse rejected")
    split_state = {**defuse, "contributions": [*defuse["contributions"], {"holderId": "other", "deviceId": "panel-8", "information": "A separate green panel exists."}]}
    expect("defuse_split_device_state" in validate_authoring(item("DEFUSE_LOGIC", "CURRENT_RUNTIME_COMPATIBLE", defuseLogic=split_state)), "split device state accepted")

    for scope_slug in canonical_puzzles_scope_slugs():
        expect(not validate_authoring(item("ROUTE_NAVIGATION", "CURRENT_RUNTIME_COMPATIBLE", scopeSlug=scope_slug)), f"canonical scope rejected: {scope_slug}")
    for scope_slug in ["device-logic", "logic-mazes", "logic-grids", "not-a-canonical-scope"]:
        expect("scope_coverage_blocker" in validate_authoring(item("ROUTE_NAVIGATION", "CURRENT_RUNTIME_COMPATIBLE", scopeSlug=scope_slug)), f"invented scope accepted: {scope_slug}")

    bank = {"playerLetterSets": [["ر", "ا", "م"], ["ي", "س", "ت"]], "acceptedNames": ["رامي"] * 12, "targetCount": 9}
    errors = validate_authoring(item("DISTRIBUTED_ARABIC_NAME_BANK", "NEEDS_RUNTIME_EXTENSION", runtimeBlocker="Repeated-name runtime needed", nameBank=bank))
    expect("name_bank_names_not_unique" in errors, "duplicate names missed")
    bank["acceptedNames"] = ["رامي", "سام", "تيم", "ريم", "ميس", "رسم", "سار", "مار", "يسر", "اسم", "رست", "تسر"]
    errors = validate_authoring(item("DISTRIBUTED_ARABIC_NAME_BANK", "NEEDS_RUNTIME_EXTENSION", runtimeBlocker="Repeated-name runtime needed", nameBank=bank))
    expect("name_bank_name_exceeds_letter_multiplicity" not in errors, "independent names consumed shared letters")
    bad = {**bank, "playerLetterSets": [["A"], ["ا"]]}
    expect("name_bank_letters_not_arabic" in validate_authoring(item("DISTRIBUTED_ARABIC_NAME_BANK", "NEEDS_RUNTIME_EXTENSION", runtimeBlocker="Repeated-name runtime needed", nameBank=bad)), "non-Arabic letter accepted")
    repeated = {**bank, "acceptedNames": ["راامي"] + bank["acceptedNames"][1:]}
    expect("name_bank_name_exceeds_letter_multiplicity" in validate_authoring(item("DISTRIBUTED_ARABIC_NAME_BANK", "NEEDS_RUNTIME_EXTENSION", runtimeBlocker="Repeated-name runtime needed", nameBank=repeated)), "repeated unavailable letter accepted")
    expect("name_bank_solution_pool_too_small" in validate_authoring(item("DISTRIBUTED_ARABIC_NAME_BANK", "NEEDS_RUNTIME_EXTENSION", runtimeBlocker="Repeated-name runtime needed", nameBank={**bank, "acceptedNames": bank["acceptedNames"][:11]})), "solution floor missed")

    missing_piece_batch = [item("MISSING_PIECE", "CURRENT_RUNTIME_COMPATIBLE") for _ in range(10)]
    batch_errors = validate_batch(missing_piece_batch)
    expect("batch_missing_piece_cap_exceeded" in batch_errors and "batch_pattern_over_concentrated" in batch_errors, "missing-piece cap missed")
    varied = [item(pattern, "CURRENT_RUNTIME_COMPATIBLE", **({"symbolReconstruction": symbol} if pattern == "SYMBOL_CODE_RECONSTRUCTION" else {"defuseLogic": defuse} if pattern == "DEFUSE_LOGIC" else {})) for pattern in ["ROUTE_NAVIGATION", "SYMBOL_CODE_RECONSTRUCTION", "CONSTRAINT_SATISFACTION", "DEFUSE_LOGIC", "MISSING_PIECE"] for _ in range(2)]
    expect(not validate_batch(varied), "five-pattern batch rejected")
    print("PASS rakkibha interaction pattern validation")


if __name__ == "__main__":
    main()
