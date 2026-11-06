"""Record a Human Product decision on an authored item durably.

Every decision is appended to the concept history.  A REJECTED or
INVALID_TEST_SAMPLE decision is also recorded in the Scope's ``EXEMPLARS.md``
as a canonical ``AKWAAN_EXEMPLAR_META`` block, so that:

- the exemplar parser and validator recognise it, with its status, and it can
  never become a positive generation exemplar (only targeted APPROVED blocks
  can);
- the rejected question is written as a quoted (``>``) line, which is what
  the engine's duplicate screen extracts from the Scope's exemplar text.

Recording is idempotent: the same source item recorded again with the same
status changes nothing.  A different status for the same item, or an
exemplar id that is already taken, is refused rather than overwritten.  World
and Scope come from the item's ``_authoringContext`` or from ``--world`` and
``--scope``; a rejection that cannot name its Scope is refused, never skipped.
This script never records an approval in ``EXEMPLARS.md``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from exemplar_metadata import (
    ID_RE,
    MAX_SOURCE_REF,
    REUSE_POLICY,
    ExemplarMetadataError,
    parse_exemplar_metadata,
    resolve_exemplar_document,
)

HISTORY = "ai/.opencode/authoring-concept-history.json"
MANIFEST = "ai/.opencode/authoring-manifest.json"
REJECTION_STATUSES = ("REJECTED", "INVALID_TEST_SAMPLE")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ITEM_LISTS = ("items", "questions", "contentItems")


class DecisionError(Exception):
    """A decision that cannot be recorded safely; nothing is written."""


def load_items(data: object) -> list[dict]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ITEM_LISTS:
            if isinstance(data.get(key), list):
                return [item for item in data[key] if isinstance(item, dict)]
        return [data]
    return []


def item_prompt(item: dict) -> str:
    presentation = item.get("presentation")
    if isinstance(presentation, dict) and isinstance(presentation.get("prompt"), str):
        return presentation["prompt"].strip()
    prompt = item.get("prompt")
    if isinstance(prompt, dict) and isinstance(prompt.get("ar"), str):
        return prompt["ar"].strip()
    if isinstance(prompt, str):
        return prompt.strip()
    return ""


def one_line(value: object) -> str:
    return " ".join(str(value or "").split())


def slug(value: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def exemplar_id(scope: str, status: str, item_id: str) -> str:
    kind = "rejected" if status == "REJECTED" else "invalid-test-sample"
    candidate = f"{slug(scope)}-{kind}-{slug(item_id)}"
    if not slug(item_id) or not ID_RE.fullmatch(candidate):
        raise DecisionError(
            f"item id {item_id!r} cannot form a canonical exemplar id"
        )
    return candidate


def render_block(meta: dict, status: str, subject: str, prompt: str, lesson: str) -> str:
    for label, text in (("subject", subject), ("prompt", prompt), ("lesson", lesson)):
        if "<!--" in text or "-->" in text:
            raise DecisionError(f"{label} contains an HTML comment marker")
    quoted = "\n".join(f"> {line.strip()}" for line in prompt.splitlines() if line.strip())
    lines = [
        f"<!-- AKWAAN_EXEMPLAR_META {json.dumps(meta, ensure_ascii=False, separators=(',', ':'))} -->",
        f"### {status} by Human Product review: {subject}",
        "",
        quoted,
        "",
        f"- Concept: {subject}",
    ]
    if lesson:
        lines.append(f"- Lesson: {lesson}")
    lines.append("<!-- /AKWAAN_EXEMPLAR_META -->")
    return "\n".join(lines) + "\n"


def exemplars_destination(root: Path, manifest: dict, world: str, scope: str) -> Path:
    """The manifest's exemplarsPath for a known Scope, refused unless canonical.

    The path must resolve exactly to the Scope's own
    ``ai/.opencode/skills/worlds/<world>/scopes/<scope>/EXEMPLARS.md`` inside
    the authoring root; anything else (an unknown Scope, a mismatched World,
    an escaping or redirected path) is refused.
    """

    key = f"{world}/{scope}"
    entry = manifest.get("scopes", {}).get(key)
    if not SLUG_RE.fullmatch(world or "") or not SLUG_RE.fullmatch(scope or "") or entry is None:
        raise DecisionError(f"unknown World/Scope {world}/{scope}; pass --world and --scope")
    if entry.get("world") != world:
        raise DecisionError(f"manifest Scope {key} belongs to World {entry.get('world')!r}")
    declared = entry.get("exemplarsPath")
    expected = (root / "ai/.opencode/skills/worlds" / world / "scopes" / scope / "EXEMPLARS.md").resolve()
    if not isinstance(declared, str) or (root / declared).resolve() != expected:
        raise DecisionError(
            f"manifest exemplarsPath for {key} ({declared!r}) is not the canonical Scope location"
        )
    return expected


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def plan_exemplar(
    path: Path,
    current: str,
    *,
    scope: str,
    status: str,
    item_id: str,
    source_ref: str,
    subject: str,
    prompt: str,
    lesson: str,
    known_mechanics: list[str],
) -> str | None:
    """Return the new file text, or None when the decision is already recorded."""

    entries = parse_exemplar_metadata(current)
    new_id = exemplar_id(scope, status, item_id)
    for entry in entries:
        meta = entry.metadata
        if meta.source_ref == source_ref:
            if meta.status == status:
                return None
            raise DecisionError(
                f"{path}: {source_ref} is already recorded as {meta.status}; "
                f"refusing to record {status}"
            )
        if meta.exemplar_id == new_id:
            raise DecisionError(
                f"{path}: exemplar id {new_id!r} is already used by another entry"
            )
    if not prompt:
        raise DecisionError(f"item {item_id!r} has no prompt text to record")

    meta = {
        "version": 1,
        "id": new_id,
        "status": status,
        "reusePolicy": REUSE_POLICY,
        "sourceRef": source_ref,
    }
    block = render_block(meta, status, subject, prompt, lesson)
    base = current if current else f"# Scope Exemplars: {scope}\n"
    updated = base.rstrip("\n") + "\n\n" + block

    # The new block must parse, and no mechanic's positive exemplar view may
    # change: a rejection never becomes generation guidance.
    parse_exemplar_metadata(updated)
    for mechanic in known_mechanics:
        before = resolve_exemplar_document(current, mechanic_key=mechanic).approved_text
        after = resolve_exemplar_document(updated, mechanic_key=mechanic).approved_text
        if before != after:
            raise DecisionError(f"{path}: recording would change {mechanic} exemplars")
    return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Record Human Product concept decision durably.")
    parser.add_argument("--source", help="Path to .source.json containing the item(s)")
    parser.add_argument("--item-id", help="Specific item ID to record (optional if file has 1 item)")
    parser.add_argument("--status", required=True, choices=["APPROVED", "REJECTED", "INVALID_TEST_SAMPLE"], help="Human Product verdict")
    parser.add_argument("--reuse-policy", required=True, choices=["DO_NOT_REGENERATE", "REFERENCE_ONLY", "REUSABLE_PATTERN"], help="Reuse instruction for authoring agents")
    parser.add_argument("--lesson", help="Optional extracted taste lesson for EXEMPLARS.md", default="")
    parser.add_argument("--world", help="World key, when the item carries no _authoringContext")
    parser.add_argument("--scope", help="Scope key, when the item carries no _authoringContext")
    parser.add_argument("--root", default=".", help="Authoring root holding the manifest, history and Scope files")
    args = parser.parse_args(argv)

    if not args.source or not os.path.exists(args.source):
        print("Error: Must provide valid --source JSON.")
        return 1

    with open(args.source, "r", encoding="utf-8") as f:
        items = load_items(json.load(f))
    if args.item_id:
        items = [i for i in items if i.get("id") == args.item_id]
    if not items:
        print("Error: No matching items found.")
        return 1

    root = Path(args.root)
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    known_mechanics = sorted(manifest["mechanics"])
    history_path = root / HISTORY
    history = (
        json.loads(history_path.read_text(encoding="utf-8"))
        if history_path.exists()
        else {"concepts": []}
    )
    rejection = args.status in REJECTION_STATUSES
    pending_files: dict[Path, str] = {}
    new_records: list[dict] = []
    unchanged = 0

    try:
        if rejection and args.reuse_policy != REUSE_POLICY:
            raise DecisionError(
                f"a {args.status} decision must use reuse policy {REUSE_POLICY}"
            )
        for item in items:
            ctx = item.get("_authoringContext") or {}
            meta = item.get("metadata") or {}
            concept = meta.get("conceptKey") or {}
            item_id = str(item.get("id") or "").strip()

            if not concept:
                print(f"Warning: Item {item_id or '?'} lacks conceptKey metadata. Skipping.")
                continue

            world = ctx.get("worldKey") or args.world
            scope = ctx.get("scopeKey") or args.scope
            for label, from_ctx, from_arg in (("world", ctx.get("worldKey"), args.world), ("scope", ctx.get("scopeKey"), args.scope)):
                if from_ctx and from_arg and from_ctx != from_arg:
                    raise DecisionError(f"item {item_id}: --{label} {from_arg} contradicts _authoringContext {from_ctx}")

            record = {
                "worldKey": world or "unknown",
                "scopeKey": scope or "unknown",
                "mechanicKey": ctx.get("mechanicKey", "unknown"),
                "conceptKey": concept,
                "humanProductStatus": args.status,
                "reusePolicy": args.reuse_policy,
                "sourceArtifact": args.source,
            }
            if item_id:
                record["itemId"] = item_id
            if args.lesson:
                record["lesson"] = args.lesson

            if rejection:
                if not item_id:
                    raise DecisionError("a rejected item needs an id")
                path = exemplars_destination(root, manifest, world, scope)
                source_ref = f"{args.source}#{item_id}"
                if len(source_ref) > MAX_SOURCE_REF:
                    raise DecisionError(f"item {item_id}: sourceRef exceeds {MAX_SOURCE_REF} characters")
                current = pending_files.get(path)
                if current is None:
                    current = path.read_text(encoding="utf-8") if path.exists() else ""
                updated = plan_exemplar(
                    path,
                    current,
                    scope=scope,
                    status=args.status,
                    item_id=item_id,
                    source_ref=source_ref,
                    subject=one_line(concept.get("subject") or item_id),
                    prompt=item_prompt(item),
                    lesson=one_line(args.lesson),
                    known_mechanics=known_mechanics,
                )
                if updated is not None:
                    pending_files[path] = updated

            same_item = [
                existing
                for existing in history.get("concepts", []) + new_records
                if item_id
                and existing.get("itemId") == item_id
                and existing.get("sourceArtifact") == args.source
            ]
            if any(e.get("humanProductStatus") != args.status for e in same_item):
                raise DecisionError(
                    f"item {item_id} from {args.source} already has a different recorded decision"
                )
            if same_item:
                unchanged += 1
            else:
                new_records.append(record)
    except (DecisionError, ExemplarMetadataError) as exc:
        print(f"Error: {exc}. Nothing was recorded.")
        return 1

    for path, text in pending_files.items():
        write_atomic(path, text)
    if new_records:
        history.setdefault("concepts", []).extend(new_records)
        try:
            # Same serialization the history file already uses (single-line JSON).
            write_atomic(history_path, json.dumps(history))
        except OSError as exc:
            # EXEMPLARS.md is already written and stays recorded. Re-running
            # the same command is safe: the exemplar step is then a no-op and
            # the missing history record is added once.
            print(
                f"Error: concept history not updated ({exc}); "
                f"{len(pending_files)} EXEMPLARS.md file(s) were written. "
                "Re-run the same command to complete the record."
            )
            return 1

    print(
        f"Recorded {len(new_records)} decision(s) to canonical concept history; "
        f"{len(pending_files)} EXEMPLARS.md file(s) updated; "
        f"{unchanged} already recorded."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
