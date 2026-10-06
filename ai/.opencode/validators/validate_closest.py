#!/usr/bin/env python3
"""Validate authored مين أقرب slider metadata beyond JSON Schema expressiveness.

Checks the mechanical half of the Closest contract only. Whether a range is
*domain-derived* — the question that actually decides authoring quality — is not
automatable and is deliberately left to human/product review; see
`ai/.opencode/validators/CLOSEST.md`.

Two shapes are accepted:
  * a single ContentItem carrying `mechanicPayload.closestSlider`
  * an authored batch: `{"items": [...]}` or `{"questions": [...]}` — the two
    shapes the repository's source packs already use

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


def batch_rows(batch: object) -> list | None:
    """The batch's records, under whichever key the pack uses.

    Candidate packs written to `ai/scripts/data` use `questions`, authored scale
    batches use `items`. `ai/scripts/source_pack_selection.py` already reads both
    through one gate; this mirrors it rather than forcing one shape on authors.
    """
    if not isinstance(batch, dict):
        return None
    for key in ("items", "questions"):
        if isinstance(batch.get(key), list):
            return batch[key]
    return None


def row_field(row: dict, name: str):
    """A compared field, wherever its shape keeps it.

    Authored batches hold `correctValue` and `acceptedTolerance` at the top
    level; candidate packs nest them under `answerPayload`. Comparing only one
    path is how the Celebrities rescue silently dropped nine targets while
    reporting success, so the drift check reads both.
    """
    if name in row:
        return row[name]
    return (row.get("answerPayload") or {}).get(name)


def row_id(row: dict) -> str | None:
    """A record's id, under whichever key its shape uses.

    Authored batches key records by `contentItemId`; the candidate packs in
    `ai/scripts/data` key them by `id`. Reading both is what lets one batch be
    cross-validated against the other.
    """
    return row.get("contentItemId") or row.get("id")


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
    items = batch_rows(batch)
    if not items:
        return ["batch must carry a non-empty `items` or `questions` list"]

    seen: set[str] = set()
    for index, entry in enumerate(items):
        item_id = row_id(entry)
        label = item_id or f"items[{index}]"
        if not item_id:
            errors.append(f"{label}: a contentItemId (or id) is required")
        elif item_id in seen:
            errors.append(f"{label}: duplicate contentItemId")
        else:
            seen.add(item_id)
        # Two outcomes legitimately carry no slider. A held item is parked for
        # content review, and `needsHumanAuthoring` is what the authoring
        # workflow tells an author to emit when an honest range cannot contain
        # the target — refusing it here would reject the very shape the released
        # workflow asks for. Neither may smuggle an authored slider through.
        if entry.get("holdForContentReview") or entry.get("needsHumanAuthoring"):
            if entry.get("closestSlider"):
                reason = "held" if entry.get("holdForContentReview") else "needs-human-authoring"
                errors.append(f"{label}: a {reason} item must not be authored")
            continue
        errors.extend(
            validate_slider(entry.get("closestSlider"), entry.get("correctValue"), label)
        )

    if source is not None:
        by_id = {row_id(i): i for i in (batch_rows(source) or []) if row_id(i)}
        missing = sorted(set(by_id) - seen)
        invented = sorted(seen - set(by_id))
        if missing:
            errors.append(f"source items missing from the authored batch: {missing}")
        if invented:
            errors.append(f"authored batch invented IDs not present in source: {invented}")
        for item_id in sorted(seen & set(by_id)):
            authored = next(i for i in items if row_id(i) == item_id)
            original = by_id[item_id]
            for field in ("prompt", "correctValue", "acceptedTolerance"):
                mine, theirs = row_field(authored, field), row_field(original, field)
                if mine is not None and mine != theirs:
                    errors.append(f"{item_id}: {field} drifted from source")
            if original.get("holdForContentReview") and not authored.get("holdForContentReview"):
                errors.append(f"{item_id}: content-review hold was dropped")
    return errors


def report_signals(batch: dict) -> list[str]:
    lines = []
    for entry in batch_rows(batch) or []:
        slider, target = entry.get("closestSlider"), _number(entry.get("correctValue"))
        if isinstance(slider, dict) and target is not None:
            lines.append(f"  {row_id(entry)}: {midpoint_signal(slider, target)}")
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

    if batch_rows(batch) is not None:
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
