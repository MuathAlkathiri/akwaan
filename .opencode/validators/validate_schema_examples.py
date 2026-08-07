#!/usr/bin/env python3
"""Dependency-free validation for canonical schema fixtures."""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]


def type_matches(value: object, declared: str) -> bool:
    mapping = {
        "object": dict,
        "array": list,
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "null": type(None),
    }
    expected = mapping[declared]
    if declared in {"integer", "number"} and isinstance(value, bool):
        return False
    return isinstance(value, expected)


def resolve(schema: dict, node: dict) -> dict:
    if "$ref" not in node:
        return node
    ref = node["$ref"]
    if not ref.startswith("#/"):
        raise AssertionError(f"external reference unsupported: {ref}")
    current: object = schema
    for part in ref[2:].split("/"):
        current = current[part]  # type: ignore[index]
    return current  # type: ignore[return-value]


def validate(value: object, node: dict, schema: dict, path: str = "$") -> list[str]:
    node = resolve(schema, node)
    errors: list[str] = []

    if "oneOf" in node:
        results = [validate(value, choice, schema, path) for choice in node["oneOf"]]
        matches = [result for result in results if not result]
        if len(matches) != 1:
            errors.append(f"{path}: oneOf matched {len(matches)} branches")
            return errors

    declared = node.get("type")
    if declared:
        declared_types = [declared] if isinstance(declared, str) else declared
        if not any(type_matches(value, item) for item in declared_types):
            return [f"{path}: invalid type"]

    if "const" in node and value != node["const"]:
        errors.append(f"{path}: const mismatch")
    if "enum" in node and value not in node["enum"]:
        errors.append(f"{path}: enum mismatch")

    if isinstance(value, str):
        if "minLength" in node and len(value) < node["minLength"]:
            errors.append(f"{path}: shorter than minLength")
        if "pattern" in node and not re.search(node["pattern"], value):
            errors.append(f"{path}: pattern mismatch")
        if node.get("format") == "date":
            try:
                date.fromisoformat(value)
            except ValueError:
                errors.append(f"{path}: invalid date")
        if node.get("format") == "uri" and urlparse(value).scheme not in {"http", "https"}:
            errors.append(f"{path}: invalid URI")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in node and value < node["minimum"]:
            errors.append(f"{path}: below minimum")

    if isinstance(value, list):
        if "minItems" in node and len(value) < node["minItems"]:
            errors.append(f"{path}: fewer than minItems")
        if "maxItems" in node and len(value) > node["maxItems"]:
            errors.append(f"{path}: more than maxItems")
        if node.get("uniqueItems"):
            serial = [json.dumps(item, sort_keys=True, ensure_ascii=False) for item in value]
            if len(serial) != len(set(serial)):
                errors.append(f"{path}: duplicate items")
        if "contains" in node and not any(not validate(item, node["contains"], schema, path) for item in value):
            errors.append(f"{path}: contains constraint failed")
        if "items" in node:
            for index, item in enumerate(value):
                errors.extend(validate(item, node["items"], schema, f"{path}[{index}]"))

    if isinstance(value, dict):
        required = set(node.get("required", []))
        missing = required - set(value)
        if missing:
            errors.append(f"{path}: missing {sorted(missing)}")
        if "minProperties" in node and len(value) < node["minProperties"]:
            errors.append(f"{path}: fewer than minProperties")
        properties = node.get("properties", {})
        if node.get("additionalProperties") is False:
            extra = set(value) - set(properties)
            if extra:
                errors.append(f"{path}: unsupported keys {sorted(extra)}")
        for key, item in value.items():
            if key in properties:
                errors.extend(validate(item, properties[key], schema, f"{path}.{key}"))

    return errors


def check(schema_path: Path, fixture_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    return validate(fixture, schema, schema)


def main() -> int:
    pairs = [
        (
            ROOT / ".opencode/workflows/BATCH-MANIFEST.schema.json",
            ROOT / ".opencode/workflows/examples/anime-one-piece-ryo.json",
        ),
        (
            ROOT / ".opencode/skills/challenge-types/top-5/top-5.patterns.schema.json",
            ROOT / ".opencode/validators/examples/top-5-keep-or-give.valid.json",
        ),
        (
            ROOT / ".opencode/skills/challenge-types/who-among-us/who-among-us.schema.json",
            ROOT / ".opencode/validators/examples/who-among-us.valid-authoring.json",
        ),
        (
            ROOT / ".opencode/skills/challenge-types/distributed-information/distributed-information.schema.json",
            ROOT / ".opencode/validators/examples/distributed-information-closest.valid.json",
        ),
        (
            ROOT / ".opencode/skills/challenge-types/distributed-information/distributed-information.schema.json",
            ROOT / ".opencode/validators/examples/distributed-information-match.valid.json",
        ),
        (
            ROOT / ".opencode/skills/challenge-types/distributed-information/distributed-information.schema.json",
            ROOT / ".opencode/validators/examples/distributed-information-multiple-choice.valid.json",
        ),
    ]
    failed = False
    for schema_path, fixture_path in pairs:
        errors = check(schema_path, fixture_path)
        if errors:
            failed = True
            print(f"FAIL {fixture_path.relative_to(ROOT)}")
            for error in errors:
                print(f"- {error}")
        else:
            print(f"PASS {fixture_path.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
