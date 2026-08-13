#!/usr/bin/env python3
"""Run structural and negative fixtures for One Clue."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from validate_one_clue import validate

ROOT = Path(__file__).resolve().parents[2]


def merge(target: dict, patch: dict) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            merge(target[key], value)
        else:
            target[key] = value


def delete_path(target: dict, dotted: str) -> None:
    parts = dotted.split(".")
    current = target
    for part in parts[:-1]:
        current = current[part]
    current.pop(parts[-1], None)


def main() -> int:
    suite_path = ROOT / ".opencode/validators/examples/one-clue.invalid-fixtures.json"
    suite = json.loads(suite_path.read_text(encoding="utf-8"))
    base = json.loads((ROOT / suite["baseFixture"]).read_text(encoding="utf-8"))

    base_errors = validate(base)
    if base_errors:
        print(f"FAIL valid: {base_errors}")
        return 1
    print("PASS valid")

    failed = False
    for case in suite["cases"]:
        item = copy.deepcopy(base)
        merge(item, case.get("overrides", {}))
        for dotted in case.get("deletePaths", []):
            delete_path(item, dotted)
        errors = validate(item)
        expected = case["expectedCode"]
        if expected not in errors:
            failed = True
            print(f"FAIL {case['id']}: expected {expected}, got {errors}")
        else:
            print(f"PASS {case['id']}: {expected}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
