#!/usr/bin/env python3
"""Validate "ركّبها" (rakkibha) asymmetric visual-assembly ContentItems.

The active contract (backend `validateRakkibhaPayload`): one private reference view
and two-or-three private candidate views. Each candidate carries a server-side
`canonicalIdentity`; exactly one candidate globally matches
`correctCanonicalIdentity`. The team describes what each privately sees and selects
the matching piece. The runtime is implemented, so a well-formed item may be ready.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from collections import Counter

VARIANT = "visual-assembly"
CHALLENGE_TYPE = "rakkibha"
TRUTH_KEYS = {
    "correctAnswer", "correctValue", "acceptedAnswers", "correctOptionId",
    "answerPayload", "answer",
}
RUNTIME_KEYS = {
    "hint", "hints", "lockMs", "lockDuration", "timerSeconds", "timeLimit",
    "deadlineMs", "answerer", "answererSchedule", "order", "solved",
    "wrongAttempts", "elapsedMs", "winner", "score", "scoringRule",
}
RETIRED_FIELDS = {"segments", "fragments", "twoPlayerMergeOptions", "publicPrompt"}
CURRENT_RUNTIME_COMPATIBLE = {
    "ROUTE_NAVIGATION", "SYMBOL_CODE_RECONSTRUCTION", "CONSTRAINT_SATISFACTION",
    "DEFUSE_LOGIC", "MISSING_PIECE",
}
NEEDS_RUNTIME_EXTENSION = {
    "DISTRIBUTED_ARABIC_NAME_BANK", "ODD_SCENE_MATCHING_PAIR",
}
CANONICAL_PATTERNS = CURRENT_RUNTIME_COMPATIBLE | NEEDS_RUNTIME_EXTENSION
PUZZLES_SCOPES_DIR = Path(__file__).resolve().parents[1] / "skills/worlds/puzzles/scopes"


def canonical_puzzles_scope_slugs() -> set[str]:
    """Derive the allowlist from canonical Puzzles Scope manifests."""
    scopes: set[str] = set()
    for scope_file in PUZZLES_SCOPES_DIR.glob("*/SCOPE.md"):
        for line in scope_file.read_text().splitlines():
            if line.strip().startswith("- `scopeId`: `puzzles.") and line.rstrip().endswith("`"):
                scopes.add(line.strip().removeprefix("- `scopeId`: `puzzles.").removesuffix("`"))
                break
    return scopes


def normalize_arabic(value: str) -> str:
    """Conservative authoring normalization: folds common alef forms and strips tashkeel."""
    folded = value.strip().replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    return "".join(ch for ch in folded if not ("\u064b" <= ch <= "\u065f"))


def valid_name_from_bank(name: str, letters: Counter[str]) -> bool:
    normalized = normalize_arabic(name)
    return bool(normalized) and all("\u0621" <= ch <= "\u064a" for ch in normalized) and not (Counter(normalized) - letters)


def validate_authoring(item: dict) -> list[str]:
    authoring = item.get("authoring")
    rakkibha = authoring.get("rakkibha") if isinstance(authoring, dict) else None
    if not isinstance(rakkibha, dict):
        return ["authoring_rakkibha_metadata_required"]
    pattern = str(rakkibha.get("interactionPattern", "")).strip()
    compatibility = str(rakkibha.get("runtimeCompatibility", "")).strip()
    errors: list[str] = []
    if pattern not in CANONICAL_PATTERNS and pattern != "PROPOSED_PATTERN":
        errors.append("interaction_pattern_unknown")
    expected_compatibility = (
        "CURRENT_RUNTIME_COMPATIBLE"
        if pattern in CURRENT_RUNTIME_COMPATIBLE
        else "NEEDS_RUNTIME_EXTENSION"
    )
    if pattern in CANONICAL_PATTERNS and compatibility != expected_compatibility:
        errors.append("runtime_compatibility_mismatch")
    if pattern == "PROPOSED_PATTERN" and compatibility != "PROPOSED_PATTERN":
        errors.append("proposed_pattern_status_invalid")
    if not str(rakkibha.get("expectedConversation", "")).strip():
        errors.append("expected_conversation_required")
    if str(rakkibha.get("scopeSlug", "")).strip() not in canonical_puzzles_scope_slugs():
        errors.append("scope_coverage_blocker")
    if pattern in NEEDS_RUNTIME_EXTENSION:
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        if metadata.get("runtimeContractStatus") != "authoring_only" or not str(rakkibha.get("runtimeBlocker", "")).strip():
            errors.append("runtime_extension_must_be_authoring_only")
    if pattern == "DISTRIBUTED_ARABIC_NAME_BANK":
        bank = rakkibha.get("nameBank")
        if not isinstance(bank, dict):
            return errors + ["name_bank_required"]
        groups = bank.get("playerLetterSets")
        if not isinstance(groups, list) or len(groups) < 2 or any(not isinstance(group, list) or not group for group in groups):
            errors.append("name_bank_letter_sets_invalid")
            groups = []
        letters = Counter(ch for group in groups for ch in group if isinstance(ch, str))
        if any(len(ch) != 1 or not ("\u0621" <= ch <= "\u064a") for ch in letters):
            errors.append("name_bank_letters_not_arabic")
        names = bank.get("acceptedNames")
        if not isinstance(names, list) or len(names) < 12:
            errors.append("name_bank_solution_pool_too_small")
            names = names if isinstance(names, list) else []
        normalized_names = [normalize_arabic(str(name)) for name in names]
        if len(set(normalized_names)) != len(normalized_names):
            errors.append("name_bank_names_not_unique")
        if any(not valid_name_from_bank(str(name), letters) for name in names):
            errors.append("name_bank_name_exceeds_letter_multiplicity")
        if bank.get("targetCount") != 9:
            errors.append("name_bank_target_invalid")
    if pattern == "SYMBOL_CODE_RECONSTRUCTION":
        proof = rakkibha.get("symbolReconstruction")
        if not isinstance(proof, dict) or not all(str(proof.get(key, "")).strip() for key in ("input", "rule", "operation", "derivedCandidate")):
            errors.append("symbol_reconstruction_proof_required")
        elif proof.get("directVisualCopy") is True or normalize_arabic(str(proof["input"])) == normalize_arabic(str(proof["derivedCandidate"])):
            errors.append("symbol_reconstruction_direct_copy")
    if pattern == "DEFUSE_LOGIC":
        proof = rakkibha.get("defuseLogic")
        device = proof.get("device") if isinstance(proof, dict) else None
        contributions = proof.get("contributions") if isinstance(proof, dict) else None
        if not isinstance(device, dict) or not all(str(device.get(key, "")).strip() for key in ("id", "baselineState", "actionableState")) or not isinstance(contributions, list) or len(contributions) < 2:
            errors.append("defuse_shared_device_proof_required")
        else:
            device_id = str(device["id"]).strip()
            if any(not isinstance(contribution, dict) or str(contribution.get("deviceId", "")).strip() != device_id or not str(contribution.get("holderId", "")).strip() or not str(contribution.get("information", "")).strip() for contribution in contributions):
                errors.append("defuse_split_device_state")
    return errors


def validate_batch(items: list[dict]) -> list[str]:
    if len(items) < 10:
        return []
    patterns = []
    for item in items:
        rakkibha = (item.get("authoring") or {}).get("rakkibha", {}) if isinstance(item, dict) else {}
        patterns.append(rakkibha.get("interactionPattern"))
    counts = Counter(patterns)
    errors: list[str] = []
    if len(set(patterns)) < 5:
        errors.append("batch_pattern_diversity_too_low")
    if any(count > 2 for pattern, count in counts.items() if pattern):
        errors.append("batch_pattern_over_concentrated")
    if counts["MISSING_PIECE"] / len(items) > .2:
        errors.append("batch_missing_piece_cap_exceeded")
    return errors


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def text_of(localized) -> str:
    if not isinstance(localized, dict):
        return ""
    return " ".join(str(v) for v in localized.values()).strip().lower()


def image_ok(media) -> bool:
    if not isinstance(media, dict):
        return False
    assets = media.get("assets")
    return (
        media.get("type") in {"image", "audio", "video"}
        and isinstance(assets, list)
        and len(assets) >= 1
        and bool(str(assets[0].get("url", "")).strip())
    )


def validate(item: dict) -> list[str]:
    e: list[str] = []
    if CHALLENGE_TYPE not in item.get("compatibleChallengeTypeIds", []):
        e.append("challenge_type_invalid")

    mechanic = item.get("mechanicPayload")
    if not isinstance(mechanic, dict):
        return sorted(set(e + ["native_payload_object_required"]))

    if mechanic.get("variant") != VARIANT:
        e.append("variant_invalid")
    if not text_of(mechanic.get("instruction")):
        e.append("instruction_missing")

    reference = mechanic.get("reference")
    if not isinstance(reference, dict) or not image_ok(reference.get("media")):
        e.append("reference_media_invalid")

    views = mechanic.get("candidateViews")
    if not isinstance(views, list) or len(views) < 2:
        e.append("candidate_views_required")
        views = views if isinstance(views, list) else []
    view_ids = [v.get("id") for v in views if isinstance(v, dict)]
    if len(set(view_ids)) != len(view_ids):
        e.append("candidate_view_ids_invalid")

    all_identities: list[str] = []
    for view in views:
        candidates = view.get("candidates") if isinstance(view, dict) else None
        if not isinstance(candidates, list) or not (2 <= len(candidates) <= 3):
            e.append("candidate_count_invalid")
            continue
        local_ids = [c.get("localId") for c in candidates if isinstance(c, dict)]
        if len(set(local_ids)) != len(local_ids) or not all(local_ids):
            e.append("local_ids_invalid")
        for candidate in candidates:
            if not isinstance(candidate, dict):
                e.append("candidate_invalid")
                continue
            identity = str(candidate.get("canonicalIdentity", "")).strip()
            if not identity:
                e.append("canonical_identity_required")
            else:
                all_identities.append(identity)
            if not image_ok(candidate.get("media")):
                e.append("candidate_media_invalid")

    correct = str(mechanic.get("correctCanonicalIdentity", "")).strip()
    if not correct or all_identities.count(correct) != 1:
        e.append("true_candidate_invalid")

    if mechanic.get("supportedTeamSizes") != [2, 3]:
        e.append("team_sizes_invalid")
    if item.get("status") == "ready" and mechanic.get("authorSafetyConfirmation") is not True:
        e.append("safety_confirmation_missing")

    # The correct identity is a server-side token; it must never appear in any
    # client-visible text (instruction, prompt, or a candidate's own content).
    public_texts = [text_of(mechanic.get("instruction")), text_of(item.get("prompt"))]
    for view in views:
        if isinstance(view, dict):
            public_texts.append(text_of(view.get("content")))
            for candidate in view.get("candidates", []) or []:
                if isinstance(candidate, dict):
                    public_texts.append(text_of(candidate.get("content")))
    if correct and any(correct.lower() in t for t in public_texts if t):
        e.append("correct_identity_leaked")

    if TRUTH_KEYS & set(walk_keys(mechanic)):
        e.append("truth_duplicated_in_mechanic")
    if RUNTIME_KEYS & set(walk_keys(mechanic)):
        e.append("runtime_field_in_mechanic")
    if RETIRED_FIELDS & set(mechanic):
        e.append("retired_mechanic_field")

    return sorted(set(e + validate_authoring(item)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    failed = False
    for raw in args.paths:
        path = Path(raw)
        document = json.loads(path.read_text())
        items = document.get("items") if isinstance(document, dict) else None
        errors = [error for item in items for error in validate(item)] + validate_batch(items) if isinstance(items, list) else validate(document)
        print(("PASS " if not errors else "FAIL ") + str(path))
        for error in errors:
            print("- " + error)
        failed |= bool(errors)
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
