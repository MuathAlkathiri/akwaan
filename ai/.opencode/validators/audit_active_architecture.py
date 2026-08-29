#!/usr/bin/env python3
"""Strict audit for the active Akwaan authoring architecture."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from validate_top_5 import validate as validate_top_5
from validate_who_among_us import validate as validate_who_among_us
from validate_rakkibha import validate as validate_rakkibha
from validate_one_clue import validate as validate_one_clue

ROOT = Path(__file__).resolve().parents[2]
ACTIVE = ROOT / ".opencode"
HISTORICAL_DIR = ACTIVE / "legacy"
TEXT_SUFFIXES = {".md", ".json", ".py"}


def active_files() -> list[Path]:
    return [
        path
        for path in ACTIVE.rglob("*")
        if path.is_file()
        and HISTORICAL_DIR not in path.parents
        and "node_modules" not in path.parts
    ]


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


errors: list[str] = []
files = active_files()

# Construct retired vocabulary without embedding it in an active file.
retired = ["ques" + "tion", "cata" + "log", "cate" + "gory", "sub" + "ject"]
for path in files:
    if path.suffix not in TEXT_SUFFIXES:
        continue
    lower = text(path).lower()
    for token in retired:
        if re.search(rf"\b{re.escape(token)}(?:s)?\b", lower, re.I):
            errors.append(f"retired vocabulary '{token}' in {path.relative_to(ROOT)}")

# Active files may describe the boundary but may not contain a routable path.
historical_ref = ".opencode" + "/legacy/"
for path in files:
    if path.suffix in TEXT_SUFFIXES and historical_ref in text(path):
        errors.append(f"historical dependency in {path.relative_to(ROOT)}")

# Generation skills are global ChallengeTypes; infrastructure lives elsewhere.
skill_files = list((ACTIVE / "skills").rglob("SKILL.md"))
challenge_root = ACTIVE / "skills" / "challenge-types"
for path in skill_files:
    if challenge_root not in path.parents:
        errors.append(f"generation skill outside ChallengeType ownership: {path.relative_to(ROOT)}")
    if "ContentItem" not in text(path):
        errors.append(f"ChallengeType skill does not define ContentItem behavior: {path.relative_to(ROOT)}")

# Every Pattern has one physical owner matching frontmatter.
pattern_files = list(challenge_root.rglob("PATTERN.md"))
seen_pattern_ids: dict[str, Path] = {}
for path in pattern_files:
    body = text(path)
    pattern_match = re.search(r"^patternId:\s*([^\s]+)", body, re.M)
    owner_match = re.search(r"^owningChallengeType:\s*([^\s]+)", body, re.M)
    if not pattern_match or not owner_match:
        errors.append(f"incomplete Pattern ownership metadata: {path.relative_to(ROOT)}")
        continue
    pattern_id, owner = pattern_match.group(1), owner_match.group(1)
    expected_owner = path.relative_to(challenge_root).parts[0]
    if owner != expected_owner:
        errors.append(f"Pattern owner mismatch: {path.relative_to(ROOT)}")
    if pattern_id in seen_pattern_ids:
        errors.append(f"duplicate patternId '{pattern_id}'")
    seen_pattern_ids[pattern_id] = path

# No ChallengeType may be nested inside a World.
for path in (ACTIVE / "skills" / "worlds").rglob("SKILL.md"):
    errors.append(f"ChallengeType nested below World: {path.relative_to(ROOT)}")

# Every Scope has both files; knowledge cannot own mechanic behavior.
scope_dirs = [p.parent for p in (ACTIVE / "skills" / "worlds").rglob("SCOPE.md")]
knowledge_forbidden = ["patternId", "answerMode", "scoringRule", "Allowed Content Patterns"]
for directory in scope_dirs:
    knowledge = directory / "KNOWLEDGE.md"
    if not knowledge.exists():
        errors.append(f"Scope missing KNOWLEDGE.md: {directory.relative_to(ROOT)}")
        continue
    body = text(knowledge)
    for token in knowledge_forbidden:
        if token in body:
            errors.append(f"Scope knowledge owns generation behavior '{token}': {knowledge.relative_to(ROOT)}")
for knowledge in (ACTIVE / "skills" / "worlds").rglob("KNOWLEDGE.md"):
    if not (knowledge.parent / "SCOPE.md").exists():
        errors.append(f"KNOWLEDGE.md missing paired SCOPE.md: {knowledge.relative_to(ROOT)}")

# Manifest world scopes match disk scopes in both directions.
manifest = json.loads(text(ACTIVE / "manifest.json"))
declared_scopes: dict[str, set[str]] = {}
for world in manifest["worlds"]:
    world_slug = world["slug"]
    scopes = set(world.get("scopes", []))
    declared_scopes[world_slug] = scopes
    world_dir = ACTIVE / "skills" / "worlds" / world_slug
    for slug in scopes:
        if not (world_dir / "scopes" / slug / "SCOPE.md").exists():
            errors.append(f"manifest scope missing SCOPE.md: {world_slug}/{slug}")
for directory in scope_dirs:
    world_slug = directory.parent.parent.name
    scope_slug = directory.name
    if scope_slug not in declared_scopes.get(world_slug, set()):
        errors.append(f"disk scope undeclared in manifest: {world_slug}/{scope_slug}")

# ChallengeType contract completeness.
required_sections = [
    "Experience Goal", "Social Dynamic", "Player Emotion", "Interaction Pattern",
    "Thinking Pattern", "Success Pattern", "Failure Pattern", "Input Contract",
    "Resolution Contract", "Content Structure", "Allowed Content Patterns",
    "Content Safety Rules", "Media Compatibility", "Scope Compatibility",
    "Validation Rules", "Anti-patterns",
]
for path in skill_files:
    body = text(path)
    for section in required_sections:
        if section not in body:
            errors.append(f"missing '{section}' in {path.relative_to(ROOT)}")

# Skill names are unique.
skill_names: dict[str, Path] = {}
for path in skill_files:
    match = re.search(r"^name:\s*([^\s]+)", text(path), re.M)
    if not match:
        errors.append(f"missing skill name: {path.relative_to(ROOT)}")
        continue
    name = match.group(1)
    if name in skill_names:
        errors.append(f"duplicate skill name '{name}'")
    skill_names[name] = path

# All JSON parses.
for path in [p for p in files if p.suffix == ".json"]:
    try:
        json.loads(text(path))
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")

# Top 5 integration and deep fixture validation.
top_5_root = challenge_root / "top-5"
top_5_required = [
    top_5_root / "SKILL.md",
    top_5_root / "patterns" / "keep-or-give" / "PATTERN.md",
    top_5_root / "top-5.patterns.schema.json",
    ACTIVE / "validators" / "TOP-5.md",
    ACTIVE / "validators" / "validate_top_5.py",
]
for path in top_5_required:
    if not path.exists():
        errors.append(f"missing Top 5 contract: {path.relative_to(ROOT)}")
top_5_fixture = ACTIVE / "validators" / "examples" / "top-5-keep-or-give.valid.json"
if top_5_fixture.exists():
    fixture_errors = validate_top_5(json.loads(text(top_5_fixture)))
    errors.extend(f"Top 5 fixture: {error}" for error in fixture_errors)
else:
    errors.append("missing Top 5 validation fixture")

# Who Among Us authoring completeness and intentional runtime blocker.
who_root = challenge_root / "who-among-us"
who_required = [
    who_root / "SKILL.md",
    who_root / "patterns" / "team-consensus" / "PATTERN.md",
    who_root / "who-among-us.schema.json",
    ACTIVE / "validators" / "WHO-AMONG-US.md",
    ACTIVE / "validators" / "validate_who_among_us.py",
    ACTIVE / "validators" / "test_who_among_us_fixtures.py",
    ACTIVE / "validators" / "examples" / "who-among-us.invalid-fixtures.json",
]
for path in who_required:
    if not path.exists():
        errors.append(f"missing Who Among Us contract: {path.relative_to(ROOT)}")
who_fixture = ACTIVE / "validators" / "examples" / "who-among-us.valid-authoring.json"
if who_fixture.exists():
    who_item = json.loads(text(who_fixture))
    authoring_errors = validate_who_among_us(who_item, authoring_only=True)
    errors.extend(f"Who Among Us authoring fixture: {error}" for error in authoring_errors)
    readiness_errors = validate_who_among_us(who_item)
    if "runtime_contract_missing" not in readiness_errors:
        errors.append("Who Among Us readiness must fail with runtime_contract_missing")
else:
    errors.append("missing Who Among Us authoring fixture")

# Rakkibha backend-synchronized contract.
rakkibha_root = challenge_root / "rakkibha"
rakkibha_required = [
    rakkibha_root / "SKILL.md",
    rakkibha_root / "patterns" / "visual-assembly" / "PATTERN.md",
    rakkibha_root / "rakkibha.patterns.schema.json",
    ACTIVE / "validators" / "RAKKIBHA.md",
    ACTIVE / "validators" / "validate_rakkibha.py",
]
for path in rakkibha_required:
    if not path.exists():
        errors.append(f"missing Rakkibha contract: {path.relative_to(ROOT)}")

# One Clue production-ready contract and full fixture suite.
one_clue_root = challenge_root / "one-clue"
one_clue_required = [
    one_clue_root / "SKILL.md",
    one_clue_root / "patterns" / "progressive-clues" / "PATTERN.md",
    one_clue_root / "one-clue.schema.json",
    ACTIVE / "knowledge" / "architecture" / "ONE-CLUE.md",
    ACTIVE / "validators" / "ONE-CLUE.md",
    ACTIVE / "validators" / "validate_one_clue.py",
    ACTIVE / "validators" / "test_one_clue_fixtures.py",
    ACTIVE / "validators" / "examples" / "one-clue.invalid-fixtures.json",
]
for path in one_clue_required:
    if not path.exists():
        errors.append(f"missing One Clue contract: {path.relative_to(ROOT)}")
one_clue_fixture = ACTIVE / "validators" / "examples" / "one-clue.valid.json"
if one_clue_fixture.exists():
    fixture_errors = validate_one_clue(json.loads(text(one_clue_fixture)))
    errors.extend(f"One Clue fixture: {error}" for error in fixture_errors)
else:
    errors.append("missing One Clue validation fixture")


# Example manifests contain exactly the schema-required top-level keys.
schema_path = ACTIVE / "workflows" / "BATCH-MANIFEST.schema.json"
schema = json.loads(text(schema_path))
required = set(schema["required"])
allowed = set(schema["properties"])
for path in (ACTIVE / "workflows" / "examples").glob("*.json"):
    manifest = json.loads(text(path))
    if missing := required - set(manifest):
        errors.append(f"manifest missing {sorted(missing)}: {path.relative_to(ROOT)}")
    if extra := set(manifest) - allowed:
        errors.append(f"manifest has unsupported keys {sorted(extra)}: {path.relative_to(ROOT)}")

# Canonical backtick paths must exist.
for path in [p for p in files if p.suffix == ".md"]:
    for ref in re.findall(r"`(\.opencode/[^`]+)`", text(path)):
        if any(mark in ref for mark in ("<", ">", "*", " ")):
            continue
        if not (ROOT / ref.rstrip(".,;:")).exists():
            errors.append(f"broken canonical reference '{ref}' in {path.relative_to(ROOT)}")

# Retired derived-data names are forbidden in active state.
for path in files:
    name = path.name.lower()
    if any(part in name for part in ("cata" + "log-health", "sub" + "ject-health")):
        errors.append(f"retired health file active: {path.relative_to(ROOT)}")

# Canonical mode set remains machine-resolvable.
mode_set = {"ryo", "multiple_choice", "closest", "match", "vote", "split", "top_5", "distributed"}
item_schema = json.loads(text(ACTIVE / "validators" / "CONTENTITEM.schema.json"))
declared_modes = set(item_schema["properties"]["answerMode"]["enum"])
if declared_modes != mode_set:
    errors.append("ContentItem answer modes diverge from the canonical machine-resolvable set")

if errors:
    print(f"FAIL: {len(errors)} architecture violation(s)")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("PASS: active Akwaan architecture is canonical")
print(f"active_files={len(files)} challenge_types={len(skill_files)} patterns={len(pattern_files)} scopes={len(scope_dirs)}")
