#!/usr/bin/env python3
"""
Validator for Akwaan Question Craft, Archetype Compliance, and Batch Variety.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

VALID_ARCHETYPES = {
    "NAME_FRAGMENT",
    "COMPLETE_THE_NAME",
    "COMPLETION",
    "REVERSE_QUESTION",
    "NICKNAME_OR_ALIAS",
    "REAL_NAME",
    "CAREER_PATH",
    "CONNECTION",
    "SEQUENCE",
    "DETAIL_RECOGNITION",
    "VISUAL_RECOGNITION",
    "PARTIAL_VISUAL",
    "AUDIO_RECOGNITION",
    "WORK_TO_CHARACTER",
    "CHARACTER_TO_WORK",
    "WHO_SAID_OR_DID_IT",
    "BEFORE_AFTER",
    "ODD_ONE_OUT",
    "CATEGORY_IDENTIFICATION",
    "FAST_ATTRIBUTE",
    "PUZZLE_FAMILY"
}


def normalize_ar(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"ى", "ي", text)
    text = re.sub(r"[ً-ٰٟ]", "", text)
    text = re.sub(r"[^\w\s؀-ۿ]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_archetype(item: Dict[str, Any]) -> str:
    authoring = item.get("authoring")
    if isinstance(authoring, dict) and "questionArchetype" in authoring:
        return str(authoring["questionArchetype"]).strip()
    if "questionArchetype" in item:
        return str(item["questionArchetype"]).strip()
    return "UNKNOWN"


def extract_content_dimension(item: Dict[str, Any]) -> str:
    authoring = item.get("authoring")
    if isinstance(authoring, dict) and "contentDimension" in authoring:
        return str(authoring["contentDimension"]).strip()
    if "contentDimension" in item:
        return str(item["contentDimension"]).strip()
    return "UNKNOWN"


def validate_single_item(item: Dict[str, Any], index: int = 0) -> List[str]:
    errors = []
    item_id = item.get("id", f"item_{index}")
    prompt_text = ""
    if isinstance(item.get("prompt"), dict):
        prompt_text = item["prompt"].get("ar", "")
    elif isinstance(item.get("prompt"), str):
        prompt_text = item["prompt"]

    # 1. Archetype Check (Hard Error if unknown value provided)
    archetype = extract_archetype(item)
    if archetype != "UNKNOWN" and archetype not in VALID_ARCHETYPES:
        errors.append(f"[{item_id}] Invalid questionArchetype '{archetype}'. Must be one of {sorted(VALID_ARCHETYPES)}")

    # 2. Prompt Length Check (Hard Limit: 250 chars)
    if len(prompt_text) > 250:
        errors.append(f"[{item_id}] Prompt length ({len(prompt_text)} chars) exceeds maximum allowable 250 chars (ANTI_WALL_TEXT)")

    # 3. Zero Answer Leakage Check (Hard Error)
    accepted = item.get("acceptedAnswers", [])
    if isinstance(item.get("answerPayload"), dict):
        accepted = item["answerPayload"].get("acceptedAnswers", accepted)
    
    p_norm = normalize_ar(prompt_text)
    for ans in accepted:
        a_norm = normalize_ar(ans)
        if len(a_norm) >= 4 and a_norm in p_norm:
            if re.search(r"\b" + re.escape(a_norm) + r"\b", p_norm):
                errors.append(f"[{item_id}] Zero Answer Leakage Violation: Answer '{ans}' (norm: '{a_norm}') found in prompt '{prompt_text}' (ANTI_LEAKAGE)")

    return errors


def validate_batch(items: List[Dict[str, Any]]) -> Tuple[List[str], List[str], Dict[str, Any]]:
    errors = []
    warnings = []
    n = len(items)
    if n == 0:
        return (["Batch is empty"], [], {})

    # Item-level validation (Hard Errors)
    for i, item in enumerate(items):
        item_errs = validate_single_item(item, i)
        errors.extend(item_errs)

    # Batch-level metrics (Advisory Quality Warnings)
    archetype_counts: Dict[str, int] = {}
    dimension_counts: Dict[str, int] = {}
    opening_counts: Dict[str, int] = {"generic_man_ma": 0, "other": 0}
    consecutive_same = 1
    max_consecutive_same = 1
    last_arch = None

    for i, item in enumerate(items):
        arch = extract_archetype(item)
        dim = extract_content_dimension(item)
        
        archetype_counts[arch] = archetype_counts.get(arch, 0) + 1
        if dim != "UNKNOWN":
            dimension_counts[dim] = dimension_counts.get(dim, 0) + 1

        # Consecutive archetype check
        if arch != "UNKNOWN":
            if arch == last_arch:
                consecutive_same += 1
                if consecutive_same > max_consecutive_same:
                    max_consecutive_same = consecutive_same
            else:
                consecutive_same = 1
            last_arch = arch

        # Opening phrase check
        prompt_text = ""
        if isinstance(item.get("prompt"), dict):
            prompt_text = item["prompt"].get("ar", "").strip()
        elif isinstance(item.get("prompt"), str):
            prompt_text = item["prompt"].strip()

        if prompt_text.startswith("من ") or prompt_text.startswith("ما "):
            opening_counts["generic_man_ma"] += 1
        else:
            opening_counts["other"] += 1

    # Warning calculations (Advisory)
    max_arch_share = 0.0
    dominant_arch = "NONE"
    for arch, count in archetype_counts.items():
        share = count / n
        if share > max_arch_share:
            max_arch_share = share
            dominant_arch = arch

    if n >= 9 and max_arch_share > 0.35 and dominant_arch != "UNKNOWN":
        warnings.append(f"Archetype concentration notice: '{dominant_arch}' represents {max_arch_share*100:.1f}% of batch (Quality Target <= 35%)")

    unique_archetypes = len([a for a in archetype_counts.keys() if a != "UNKNOWN"])
    if n >= 9 and unique_archetypes < 4 and unique_archetypes > 0:
        warnings.append(f"Archetype spread notice: Batch uses {unique_archetypes} distinct archetypes (Quality Target >= 4 for batches >= 9 items)")

    generic_opening_share = opening_counts["generic_man_ma"] / n
    if generic_opening_share > 0.40:
        warnings.append(f"Prompt openings notice: {generic_opening_share*100:.1f}% start with 'من / ما' (Quality Target <= 40%)")

    if max_consecutive_same >= 3 and last_arch != "UNKNOWN":
        warnings.append(f"Clustering notice: Found {max_consecutive_same} consecutive items with the same archetype '{dominant_arch}'")

    diversity_score = 0.0
    if unique_archetypes > 0:
        norm_unique = min(unique_archetypes / min(n, 6), 1.0)
        norm_spread = max(0.0, 1.0 - max_arch_share)
        norm_openings = max(0.0, 1.0 - generic_opening_share)
        diversity_score = 0.4 * norm_unique + 0.3 * norm_spread + 0.3 * norm_openings

    stats = {
        "itemCount": n,
        "uniqueArchetypes": unique_archetypes,
        "archetypeBreakdown": archetype_counts,
        "contentDimensions": dimension_counts if dimension_counts else "not_specified",
        "maxArchetypeShare": f"{max_arch_share*100:.1f}%",
        "genericOpeningShare": f"{generic_opening_share*100:.1f}%",
        "maxConsecutiveSame": max_consecutive_same,
        "diversityScore": round(diversity_score, 2),
        "status": "PASS" if not errors else "FAIL"
    }

    return (errors, warnings, stats)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: validate_question_craft.py <path_to_questions.json>")
        sys.exit(0)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: {file_path} not found")
        sys.exit(1)

    data = json.loads(file_path.read_text(encoding="utf-8"))
    items = data.get("questions", data) if isinstance(data, dict) else data

    errors, warnings, stats = validate_batch(items)

    print("=== QUESTION CRAFT & BATCH VARIETY AUDIT ===")
    print(json.dumps(stats, indent=2, ensure_ascii=False))

    if warnings:
        print(f"\nADVISORY QUALITY NOTICES ({len(warnings)}):")
        for w in warnings:
            print(f"- 🟡 {w}")

    if errors:
        print(f"\nHARD CONTRACT ERRORS ({len(errors)}):")
        for e in errors:
            print(f"- ❌ {e}")
        sys.exit(1)
    else:
        print("\n✅ HARD CONTRACT PASS: Zero errors detected.")
        sys.exit(0)
