#!/usr/bin/env python3
"""Validate authored Moving XO (إكس أو المتحرك) puzzles before promotion.

Moving XO plays an ordinary ContentItem — there is no `mechanicPayload` and no
bespoke schema, so most of what matters here is *not* schema-shaped. What this
checks is the half the backend cannot:

  * **Puzzle Family.** Families live in the authoring Knowledge layer, in each
    Scope's `SCOPE.md`, and deliberately not as a database field. So the family
    table — which modes a family may answer in, and whether it needs media —
    is enforceable here and nowhere else.
  * **The asymmetric surfaces.** The shared screen renders the prompt and the
    media; the answering phone renders neither, only text controls. An item
    whose answers are pictures is unplayable, and nothing in its JSON says so.

The backend's `ContentItemCompatibilityPolicy` is the gate that actually stops
a bad item reaching READY. This validator runs earlier, on authored packs, so an
author finds out before a promotion rather than after one.

What it does not check: whether a puzzle is *fair*, *unambiguous* or solvable in
fifteen seconds. Those are human review — see
`ai/.opencode/knowledge/architecture/MOVING-XO.md`.

Two shapes are accepted, matching the sibling validators:
  * a single authored item
  * a batch: `{"items": [...]}` or `{"questions": [...]}`
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

# The shared Arabic normalizer, mirrored once for the whole validator suite.
from validate_one_clue import normalize

ANSWER_MODES = {"multiple_choice", "match"}

#: The six forward Puzzles Scopes and their Puzzle Families, transcribed from
#: each Scope's own `SCOPE.md`. `media` is that family's policy:
#:   required   — the image *is* the puzzle; a resolved asset is mandatory
#:   optional   — the family plays either way
#:   family-led — the Scope is mixed; the author's chosen framing decides
#:   none       — a text-native family; media would only distract
FAMILIES: dict[str, dict[str, dict]] = {
    "observation-illusions": {
        "hidden-detail": {"media": "required", "modes": {"multiple_choice"}},
        "illusion-perception": {"media": "required", "modes": {"multiple_choice"}},
        "visual-count": {"media": "required", "modes": {"multiple_choice"}},
    },
    "wordplay-letters": {
        "anagram-rearrange": {"media": "none", "modes": {"multiple_choice", "match"}},
        "letter-operation": {"media": "none", "modes": {"multiple_choice", "match"}},
        "hidden-word": {"media": "optional", "modes": {"multiple_choice"}},
    },
    "numbers-estimation": {
        "quantity-intuition": {"media": "optional", "modes": {"multiple_choice"}},
        "proportion-estimate": {"media": "optional", "modes": {"multiple_choice"}},
        "numeric-pattern": {"media": "none", "modes": {"multiple_choice"}},
    },
    "assembly-rotation": {
        "net-fold": {"media": "required", "modes": {"multiple_choice"}},
        "silhouette-match": {"media": "required", "modes": {"multiple_choice"}},
        "view-projection": {"media": "required", "modes": {"multiple_choice"}},
    },
    "paths-motion": {
        "path-trace": {"media": "required", "modes": {"multiple_choice"}},
        "mechanism-outcome": {"media": "required", "modes": {"multiple_choice"}},
    },
    "spot-the-error": {
        "intruder-element": {"media": "family-led", "modes": {"multiple_choice"}},
        "order-violation": {"media": "family-led", "modes": {"multiple_choice", "match"}},
    },
}

#: Scopes whose own boundary makes the image the puzzle. Mirrors
#: `VISUAL_PUZZLE_SCOPE_SLUGS` in the backend; the backend enforces at Scope
#: level because no family identifier is persisted, this validator can be
#: stricter because the family is right there in the pack.
VISUAL_SCOPES = {"observation-illusions", "assembly-rotation", "paths-motion"}

#: The nine retired Scopes, named so the failure explains itself instead of
#: saying only "unknown". The twenty-one local smoke fixtures sit on these.
RETIRED_SCOPES = {
    "general-knowledge",
    "letters-words",
    "numbers-arithmetic",
    "logic-deduction",
    "shapes-patterns",
    "symbols-codes",
    "patterns-sequences",
    "lateral-thinking",
    "visual-puzzles",
}

#: A prompt long enough to be worth a second look against the 15-second budget.
#: A signal, never a rejection — length is a proxy for reading time, not proof.
PROMPT_SIGNAL_CHARS = 140

IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif")


def has_digit(value: str) -> bool:
    """True if any character is a decimal digit in any script.

    Matches the backend's `\\p{Nd}` check. The shared normalizer folds letters —
    the alef family, ة/ه, ى/ي, diacritics, a leading ال — but not digits, so ٧
    and 7 stay different strings and a typed numeric answer is a coin flip on
    which keyboard the player has.
    """
    return any(unicodedata.category(ch) == "Nd" for ch in value or "")


def text_of(value: object) -> str:
    """A localized field's Arabic text, however the pack spells it."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("ar", "text", "value"):
            if isinstance(value.get(key), str):
                return value[key]
    return ""


def batch_rows(batch: object) -> list | None:
    """The batch's records, under whichever key the pack uses.

    Candidate packs written to `ai/scripts/data` use `questions`, authored
    batches use `items`. Mirrors `validate_closest.batch_rows` rather than
    forcing one shape on authors.
    """
    if not isinstance(batch, dict):
        return None
    for key in ("items", "questions"):
        if isinstance(batch.get(key), list):
            return batch[key]
    return None


def row_id(row: dict) -> str | None:
    return row.get("contentItemId") or row.get("id")


def field(row: dict, name: str):
    """A field, whether the pack keeps it flat or under `answerPayload`."""
    if name in row:
        return row[name]
    payload = row.get("answerPayload")
    return payload.get(name) if isinstance(payload, dict) else None


def scope_slug(row: dict) -> str:
    value = row.get("scope") or row.get("scopeSlug") or ""
    if isinstance(value, dict):
        value = value.get("slug", "")
    return str(value).strip()


def media_assets(row: dict) -> list:
    media = row.get("media")
    if not isinstance(media, dict):
        return []
    assets = media.get("assets")
    return assets if isinstance(assets, list) else []


def resolved_assets(row: dict) -> list:
    """Assets that actually point at something a host could play.

    A declared `media.type: image` with an empty asset list is an intention, and
    a host cannot play an intention.
    """
    return [
        asset
        for asset in media_assets(row)
        if isinstance(asset, dict) and str(asset.get("url") or asset.get("path") or "").strip()
    ]


def media_type(row: dict) -> str:
    media = row.get("media")
    return str(media.get("type") or "").strip() if isinstance(media, dict) else ""


#: Keys a pack may use to say which mechanic a row is written for.
MECHANIC_KEYS = ("mechanic", "targetMechanic", "challengeType", "challengeTypeSlug")

MOVING_XO = "moving-xo"


def targets_moving_xo(row: dict) -> bool | None:
    """Is this row written for Moving XO? `None` means the row does not say.

    A Puzzles pack is not automatically a Moving XO pack. The authored packs in
    `ai/workbench/artifacts` mix Moving XO, Bomb, RYO and Closest rows in one
    file, distinguishable only by an id convention that is not a contract. So:

      * an explicit declaration is believed, in either direction
      * an undeclared row is left to the caller, which states the pack's
        mechanic rather than having this validator guess

    Guessing is how a Closest row ends up reported as a broken Moving XO item,
    which is noise that trains authors to ignore the validator.
    """
    ids = row.get("compatibleChallengeTypeIds") or row.get("compatibleChallengeTypes")
    if isinstance(ids, list) and ids:
        return any(str(value).strip().split(".")[-1] == MOVING_XO for value in ids)
    for key in MECHANIC_KEYS:
        if row.get(key):
            return str(row[key]).strip().split(".")[-1] == MOVING_XO
    return None


def pack_targets_moving_xo(batch: dict) -> bool | None:
    """The same question asked of the pack as a whole, via its metadata."""
    metadata = batch.get("metadata") if isinstance(batch, dict) else None
    source = metadata if isinstance(metadata, dict) else batch
    if isinstance(source, dict):
        for key in MECHANIC_KEYS:
            if source.get(key):
                return str(source[key]).strip().split(".")[-1] == MOVING_XO
    return None


def validate_scope_and_family(row: dict, label: str) -> tuple[list[str], dict | None]:
    """Resolve the item's Scope and Family, or say precisely what is wrong."""
    errors: list[str] = []
    slug = scope_slug(row)
    if not slug:
        return [f"{label}: a forward Puzzles Scope slug is required"], None
    if slug in RETIRED_SCOPES:
        return [
            f"{label}: scope '{slug}' is retired and cannot carry Moving XO content"
        ], None
    if slug not in FAMILIES:
        return [f"{label}: scope '{slug}' is not one of the six forward Puzzles Scopes"], None

    family = str(row.get("family") or row.get("puzzleFamily") or "").strip()
    if not family:
        errors.append(
            f"{label}: a puzzleFamily is required — see the family table in "
            f"ai/.opencode/skills/worlds/puzzles/scopes/{slug}/SCOPE.md"
        )
        return errors, None
    if family not in FAMILIES[slug]:
        errors.append(
            f"{label}: family '{family}' does not belong to scope '{slug}' "
            f"(expected one of {sorted(FAMILIES[slug])})"
        )
        return errors, None
    return errors, FAMILIES[slug][family]


def validate_answer(row: dict, profile: dict | None, label: str) -> list[str]:
    errors: list[str] = []
    mode = str(field(row, "mode") or field(row, "answerMode") or "").strip()

    if mode not in ANSWER_MODES:
        return [
            f"{label}: answer mode '{mode or 'missing'}' is unplayable in Moving XO "
            f"(expected {sorted(ANSWER_MODES)})"
        ]
    if profile and mode not in profile["modes"]:
        errors.append(
            f"{label}: this family may not answer in '{mode}' "
            f"(expected {sorted(profile['modes'])})"
        )

    if mode == "multiple_choice":
        options = field(row, "options")
        if not isinstance(options, list) or len(options) < 2:
            return errors + [f"{label}: multiple_choice needs at least two options"]
        labels = [text_of(option.get("label") if isinstance(option, dict) else option) for option in options]
        for index, text in enumerate(labels):
            if not text.strip():
                errors.append(f"{label}: option {index} has no text")
            elif text.strip().lower().endswith(IMAGE_SUFFIXES) or text.strip().startswith(
                ("http://", "https://")
            ):
                # The answering phone renders text controls only. An image
                # option is not a styling problem; it is an unanswerable item.
                errors.append(
                    f"{label}: option {index} looks like an image or URL — the answering "
                    f"phone renders text choices only"
                )
        seen: set[str] = set()
        for text in labels:
            key = normalize(text)
            if key and key in seen:
                errors.append(f"{label}: two options read the same after normalization: '{text}'")
            seen.add(key)
        correct = field(row, "correctOptionId")
        ids = [option.get("id") for option in options if isinstance(option, dict)]
        if correct is not None and correct not in ids:
            errors.append(f"{label}: correctOptionId '{correct}' is not one of the options")
        return errors

    accepted = field(row, "acceptedAnswers")
    if not isinstance(accepted, list) or not accepted:
        return errors + [f"{label}: match needs at least one accepted answer"]
    seen = set()
    for answer in accepted:
        text = text_of(answer).strip()
        if not text:
            errors.append(f"{label}: an accepted answer is empty")
            continue
        if has_digit(text):
            # Authoring rule, not a normalizer change: the normalizer is shared
            # by every mechanic and is not Moving XO's to widen.
            errors.append(
                f"{label}: accepted answer '{text}' contains digits, which the Arabic "
                f"normalizer does not fold — use multiple_choice for numeric answers"
            )
        if len(text.split()) > 2:
            errors.append(
                f"{label}: accepted answer '{text}' is too long to type in fifteen seconds — "
                f"match is for short single words"
            )
        key = normalize(text)
        if key in seen:
            errors.append(
                f"{label}: accepted answer '{text}' is already covered by normalization"
            )
        seen.add(key)
    return errors


def validate_media(row: dict, slug: str, profile: dict | None, label: str) -> list[str]:
    errors: list[str] = []
    declared = media_type(row)
    resolved = resolved_assets(row)
    policy = profile["media"] if profile else ("required" if slug in VISUAL_SCOPES else "optional")

    if policy == "required" and not resolved:
        errors.append(
            f"{label}: this family's image *is* the puzzle — a resolved media asset is "
            f"required before READY"
        )
    if declared and declared != "none" and not resolved:
        errors.append(
            f"{label}: media.type '{declared}' is declared with no resolved asset"
        )
    if policy == "none" and resolved:
        errors.append(
            f"{label}: this family is text-native and should carry no media"
        )
    return errors


def validate(row: object, label: str = "item") -> list[str]:
    """Every error for one authored Moving XO item."""
    if not isinstance(row, dict):
        return [f"{label}: expected an object"]

    errors, profile = validate_scope_and_family(row, label)
    if not text_of(row.get("prompt")).strip():
        errors.append(f"{label}: a prompt is required — it is what the shared screen shows")
    errors.extend(validate_answer(row, profile, label))
    errors.extend(validate_media(row, scope_slug(row), profile, label))
    return errors


def partition(batch: dict, assume_moving_xo: bool | None = None) -> tuple[list, list, list]:
    """Split a pack into (in scope, other mechanics, undeclared).

    `assume_moving_xo` is the caller's statement about an undeclared pack —
    from `--mechanic`, from the pack metadata, or left unanswered.
    """
    rows = batch_rows(batch) or []
    if assume_moving_xo is None:
        assume_moving_xo = pack_targets_moving_xo(batch)

    mine, theirs, unknown = [], [], []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            mine.append((index, row))
            continue
        target = targets_moving_xo(row)
        if target is True:
            mine.append((index, row))
        elif target is False:
            theirs.append((index, row))
        elif assume_moving_xo:
            mine.append((index, row))
        else:
            unknown.append((index, row))
    return mine, theirs, unknown


def validate_batch(batch: dict, assume_moving_xo: bool | None = None) -> list[str]:
    errors: list[str] = []
    if not batch_rows(batch):
        return ["batch must carry a non-empty `items` or `questions` list"]

    mine, _, _ = partition(batch, assume_moving_xo)
    seen: set[str] = set()
    prompts: dict[str, str] = {}
    for index, row in mine:
        item_id = row_id(row) if isinstance(row, dict) else None
        label = item_id or f"items[{index}]"
        if item_id:
            if item_id in seen:
                errors.append(f"{label}: duplicate contentItemId")
            seen.add(item_id)
        errors.extend(validate(row, label))
        if isinstance(row, dict):
            key = normalize(text_of(row.get("prompt")))
            if key and key in prompts:
                errors.append(f"{label}: prompt repeats {prompts[key]}")
            elif key:
                prompts[key] = label
    return errors


def signals(batch: dict, assume_moving_xo: bool | None = None) -> list[str]:
    """Review signals. Never a rejection — a validator cannot judge fairness."""
    lines: list[str] = []
    mine, _, _ = partition(batch, assume_moving_xo)
    for index, row in mine:
        if not isinstance(row, dict):
            continue
        label = row_id(row) or f"items[{index}]"
        prompt = text_of(row.get("prompt")).strip()
        if len(prompt) > PROMPT_SIGNAL_CHARS:
            lines.append(
                f"  {label}: prompt is {len(prompt)} characters — read it against the "
                f"fifteen-second budget, across the room"
            )
        slug = scope_slug(row)
        family = str(row.get("family") or row.get("puzzleFamily") or "")
        profile = FAMILIES.get(slug, {}).get(family)
        if profile and profile["media"] == "family-led" and not resolved_assets(row):
            lines.append(
                f"  {label}: '{family}' is family-led on media — confirm this framing "
                f"really works as text"
            )
    return lines


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate authored Moving XO puzzles.")
    parser.add_argument("path", help="an authored item or batch, as JSON")
    parser.add_argument(
        "--mechanic",
        help=(
            "the mechanic an undeclared pack is written for. Rows that name their own "
            "mechanic always win; this only decides rows that stay silent."
        ),
    )
    args = parser.parse_args(argv)

    payload = json.loads(Path(args.path).read_text(encoding="utf-8"))
    assume = None if args.mechanic is None else args.mechanic.strip() == MOVING_XO

    if batch_rows(payload) is None:
        payload = {"items": [payload]}
        if assume is None:
            # A single authored item handed to this validator is a Moving XO
            # item by the act of handing it over.
            assume = True

    mine, theirs, unknown = partition(payload, assume)
    errors = validate_batch(payload, assume) if mine else []
    review = signals(payload, assume)

    if errors:
        print(f"FAIL {args.path}")
        for error in errors:
            print(f"- {error}")
    elif mine:
        print(f"PASS {args.path} ({len(mine)} Moving XO item(s))")
    else:
        print(f"SKIP {args.path} — no Moving XO rows to check")

    # Never silent about what was not checked: a validator that quietly ignores
    # rows reads exactly like one that approved them.
    if theirs:
        print(f"not checked — written for another mechanic: {len(theirs)} row(s)")
    if unknown:
        print(
            f"not checked — {len(unknown)} row(s) do not say which mechanic they are for. "
            f"Re-run with --mechanic moving-xo if this pack is Moving XO."
        )
    if review:
        print("review signals (never a rejection):")
        print("\n".join(review))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
