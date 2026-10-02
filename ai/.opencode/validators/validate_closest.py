#!/usr/bin/env python3
"""Validate authored مين أقرب slider metadata beyond JSON Schema expressiveness.

Checks the mechanical half of the Closest contract only. Whether a range is
*domain-derived* — the question that actually decides authoring quality — is not
automatable and is deliberately left to human/product review; see
`ai/.opencode/validators/CLOSEST.md`.

Two shapes are accepted:
  * a single ContentItem carrying `mechanicPayload.closestSlider`
  * an authored scale batch: `{"items": [{contentItemId, closestSlider, ...}]}`

The batch form is additionally checked against its `.source.json` when one is
given, so a run can prove no ID, prompt or answer drifted during authoring.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MODES = {"numeric-range", "between-anchors"}
DISPLAY_FORMATS = {"number", "calendar-year"}


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return float(value)


def midpoint_signal(slider: dict, target: float) -> str:
    """`exact-midpoint` / `near-midpoint` / `clear` — a signal, never a verdict."""
    low, high = _number(slider.get("min")), _number(slider.get("max"))
    if low is None or high is None or high <= low:
        return "unknown"
    middle = (low + high) / 2
    span = high - low
    if abs(target - middle) < 1e-9:
        return "exact-midpoint"
    return "near-midpoint" if abs(target - middle) <= span * 0.05 else "clear"


def validate_slider(slider: object, correct_value: object, label: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(slider, dict):
        return [f"{label}: closestSlider is required and must be an object"]

    mode = slider.get("mode")
    if mode not in MODES:
        errors.append(f"{label}: mode must be one of {sorted(MODES)} (legacy is not authorable)")

    low, high = _number(slider.get("min")), _number(slider.get("max"))
    if low is None:
        errors.append(f"{label}: min must be a finite number")
    if high is None:
        errors.append(f"{label}: max must be a finite number")
    if low is not None and high is not None and not low < high:
        errors.append(f"{label}: min must be strictly less than max")

    step = _number(slider.get("step"))
    if "step" in slider and (step is None or step <= 0):
        errors.append(f"{label}: step must be a positive finite number")
    if mode == "numeric-range" and step is None:
        errors.append(f"{label}: numeric-range requires a step")

    display = slider.get("displayFormat")
    if display is not None and display not in DISPLAY_FORMATS:
        errors.append(f"{label}: displayFormat must be one of {sorted(DISPLAY_FORMATS)}")
    if display == "calendar-year" and slider.get("unit"):
        errors.append(f"{label}: a calendar-year slider must carry no unit")
    if display == "calendar-year" and mode != "numeric-range":
        errors.append(f"{label}: calendar-year applies to numeric-range only")

    if mode == "between-anchors":
        for key in ("leftAnchor", "rightAnchor"):
            value = slider.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{label}: between-anchors requires a non-empty {key}")
        if slider.get("unit"):
            errors.append(f"{label}: between-anchors carries no unit")

    target = _number(correct_value)
    if target is None:
        errors.append(f"{label}: correctValue must be a finite number")
    elif low is not None and high is not None:
        if not low <= target <= high:
            errors.append(f"{label}: correctValue {target:g} is outside [{low:g}, {high:g}]")
        elif step is not None and step > 0:
            steps = (target - low) / step
            if abs(steps - round(steps)) > 1e-9:
                errors.append(
                    f"{label}: correctValue {target:g} is not reachable from min {low:g} by step {step:g}"
                )
    return errors


def validate(item: dict) -> list[str]:
    """Validate one authored ContentItem."""
    payload = item.get("answerPayload") or {}
    if payload.get("mode") not in (None, "closest"):
        return ["answerPayload.mode must be closest"]
    slider = (item.get("mechanicPayload") or {}).get("closestSlider")
    return validate_slider(slider, payload.get("correctValue", item.get("correctValue")), "item")


def validate_batch(batch: dict, source: dict | None = None) -> list[str]:
    """Validate an authored scale batch, optionally against its source worklist."""
    errors: list[str] = []
    items = batch.get("items")
    if not isinstance(items, list) or not items:
        return ["batch.items must be a non-empty list"]

    seen: set[str] = set()
    for index, entry in enumerate(items):
        item_id = entry.get("contentItemId")
        label = item_id or f"items[{index}]"
        if not item_id:
            errors.append(f"{label}: contentItemId is required")
        elif item_id in seen:
            errors.append(f"{label}: duplicate contentItemId")
        else:
            seen.add(item_id)
        if entry.get("holdForContentReview"):
            # Held items are carried through untouched, never authored.
            if entry.get("closestSlider"):
                errors.append(f"{label}: a held item must not be authored")
            continue
        errors.extend(
            validate_slider(entry.get("closestSlider"), entry.get("correctValue"), label)
        )

    if source is not None:
        by_id = {i["contentItemId"]: i for i in source.get("items", [])}
        missing = sorted(set(by_id) - seen)
        invented = sorted(seen - set(by_id))
        if missing:
            errors.append(f"source items missing from the authored batch: {missing}")
        if invented:
            errors.append(f"authored batch invented IDs not present in source: {invented}")
        for item_id in sorted(seen & set(by_id)):
            authored = next(i for i in items if i.get("contentItemId") == item_id)
            original = by_id[item_id]
            for field in ("prompt", "correctValue", "acceptedTolerance"):
                if field in authored and authored[field] != original.get(field):
                    errors.append(f"{item_id}: {field} drifted from source")
            if original.get("holdForContentReview") and not authored.get("holdForContentReview"):
                errors.append(f"{item_id}: content-review hold was dropped")
    return errors


def report_signals(batch: dict) -> list[str]:
    lines = []
    for entry in batch.get("items", []):
        slider, target = entry.get("closestSlider"), _number(entry.get("correctValue"))
        if isinstance(slider, dict) and target is not None:
            lines.append(f"  {entry.get('contentItemId')}: {midpoint_signal(slider, target)}")
    return lines


def main(paths: list[str]) -> int:
    if not paths:
        print(
            "usage: validate_closest.py <item.json|batch.json> [source.json]",
            file=sys.stderr,
        )
        return 2
    batch = json.loads(Path(paths[0]).read_text(encoding="utf-8"))
    source = json.loads(Path(paths[1]).read_text(encoding="utf-8")) if len(paths) > 1 else None

    if isinstance(batch, dict) and isinstance(batch.get("items"), list):
        errors = validate_batch(batch, source)
        signals = report_signals(batch)
    else:
        errors = validate(batch)
        signals = []

    if errors:
        print(f"FAIL {paths[0]}")
        for error in errors:
            print(f"- {error}")
    else:
        print(f"PASS {paths[0]}")
    if signals:
        print("midpoint signals (QA signal only, never a rejection):")
        print("\n".join(signals))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
