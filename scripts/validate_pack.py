#!/usr/bin/env python3
"""Validate a football development pack against the canonical Akwaan contracts.

Usage:
    validate_pack.py <pack.json> [pack.json ...]

Extracts every ContentItem from a pack (flat `items` or `contentItemBatches`).
Top-10 items are validated against the dedicated top-10 patterns schema and the
Top 10 validator; all other items are validated against CONTENTITEM.schema.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERIC_SCHEMA = ROOT / ".opencode/validators/CONTENTITEM.schema.json"
TOP10_SCHEMA = ROOT / ".opencode/skills/challenge-types/top-10/top-10.patterns.schema.json"

sys.path.insert(0, str(ROOT / ".opencode/validators"))
import validate_schema_examples as vse  # noqa: E402
import validate_top_10 as vtt  # noqa: E402


def iter_items(pack: dict):
    if isinstance(pack.get("items"), list):
        yield from pack["items"]
    elif isinstance(pack.get("contentItemBatches"), list):
        for batch in pack["contentItemBatches"]:
            yield from batch.get("contentItems", [])


def validate_pack(path: Path) -> int:
    pack = json.loads(path.read_text(encoding="utf-8"))
    generic = json.loads(GENERIC_SCHEMA.read_text(encoding="utf-8"))
    t10schema = json.loads(TOP10_SCHEMA.read_text(encoding="utf-8"))
    failed = False
    item_count = 0
    for item in iter_items(pack):
        item_count += 1
        is_top10 = "top-10" in item.get("compatibleChallengeTypeIds", [])
        schema = t10schema if is_top10 else generic
        errors = vse.validate(item, schema, schema)
        if is_top10:
            errors += vtt.validate(item)
        if errors:
            failed = True
            print(f"FAIL {path.name} :: {item.get('id')}")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"PASS {path.name} :: {item.get('id')}")
    if item_count == 0:
        print(f"NOTE {path.name}: no items found")
    return 1 if failed else 0


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: validate_pack.py <pack.json> [...]", file=sys.stderr)
        return 2
    any_fail = False
    for raw in argv:
        any_fail |= validate_pack(Path(raw)) == 1
    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))