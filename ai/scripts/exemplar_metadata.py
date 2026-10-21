"""Strict parser and generation-safe view for Scope EXEMPLARS.md metadata.

Only explicit metadata markers are authoritative.  Markdown headings, prose,
emoji and tables cannot grant an exemplar generation eligibility.  The parser
also exposes the original source unchanged so historical screening can retain
its evidence while the generation view is restricted to APPROVED blocks.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

GRAMMAR_VERSION = 1
REUSE_POLICY = "DO_NOT_REGENERATE"
STATUSES = {
    "APPROVED",
    "WITHHELD",
    "REJECTED",
    "RETIRED",
    "INVALID_TEST_SAMPLE",
}
ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
MARKER_RE = re.compile(r"<!--(.*?)-->", re.DOTALL)


@dataclass(frozen=True)
class ExemplarMetadata:
    version: int
    exemplar_id: str
    status: str
    reuse_policy: str
    routing_note: str | None = None


@dataclass(frozen=True)
class ExemplarEntry:
    metadata: ExemplarMetadata
    start_line: int
    end_line: int
    content: str = ""
    source_block: str = ""


@dataclass(frozen=True)
class ExemplarDocument:
    entries: list[ExemplarEntry]
    approved_text: str
    historical_text: str
    diagnostics: tuple[str, ...] = ()


class ExemplarMetadataError(ValueError):
    """Raised when a metadata marker is unknown, malformed or unbalanced."""


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _metadata(raw: str, line: int) -> ExemplarMetadata:
    prefix = "AKWAAN_EXEMPLAR_META"
    if not raw.startswith(prefix):
        raise ExemplarMetadataError(
            f"line {line}: unknown exemplar metadata marker"
        )
    payload = raw[len(prefix) :].strip()
    if not payload:
        raise ExemplarMetadataError(f"line {line}: missing metadata JSON")
    try:
        value: Any = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ExemplarMetadataError(
            f"line {line}: malformed metadata JSON: {exc.msg}"
        ) from exc
    if not isinstance(value, dict):
        raise ExemplarMetadataError(f"line {line}: metadata must be an object")

    allowed = {"version", "id", "status", "reusePolicy", "routingNote"}
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ExemplarMetadataError(
            f"line {line}: unknown metadata field(s): {', '.join(unknown)}"
        )
    if value.get("version") != GRAMMAR_VERSION:
        raise ExemplarMetadataError(
            f"line {line}: unsupported metadata version {value.get('version')!r}"
        )
    exemplar_id = value.get("id")
    if not isinstance(exemplar_id, str) or not ID_RE.fullmatch(exemplar_id):
        raise ExemplarMetadataError(
            f"line {line}: id must be lowercase kebab-case"
        )
    status = value.get("status")
    if status not in STATUSES:
        raise ExemplarMetadataError(
            f"line {line}: unknown review status {status!r}"
        )
    if value.get("reusePolicy") != REUSE_POLICY:
        raise ExemplarMetadataError(
            f"line {line}: reusePolicy must be {REUSE_POLICY!r}"
        )
    note = value.get("routingNote")
    if note is not None and (not isinstance(note, str) or not note.strip()):
        raise ExemplarMetadataError(
            f"line {line}: routingNote must be a non-empty string when present"
        )
    return ExemplarMetadata(
        version=GRAMMAR_VERSION,
        exemplar_id=exemplar_id,
        status=status,
        reuse_policy=REUSE_POLICY,
        routing_note=note,
    )


def _looks_like_unclassified_entry(line: str) -> bool:
    """Conservative legacy-entry detection; ordinary prose stays non-authoritative."""

    return bool(
        re.match(r"^\s*###\s+\d+[.)]\s+", line)
        or re.match(r"^\s*-\s*Domain:\s*\S", line, re.IGNORECASE)
    )


def _parse(text: str) -> tuple[list[ExemplarEntry], list[tuple[int, int]]]:
    """Parse only explicit markers; ordinary Markdown is never authoritative."""

    entries: list[ExemplarEntry] = []
    active: tuple[ExemplarMetadata, int, int, int] | None = None
    seen: set[str] = set()
    ranges: list[tuple[int, int]] = []

    for match in MARKER_RE.finditer(text):
        raw = " ".join(match.group(1).strip().split())
        line = _line_number(text, match.start())
        if raw.startswith("AKWAAN_EXEMPLAR_META"):
            if active is not None:
                raise ExemplarMetadataError(
                    f"line {line}: nested exemplar metadata marker"
                )
            metadata = _metadata(match.group(1).strip(), line)
            if metadata.exemplar_id in seen:
                raise ExemplarMetadataError(
                    f"line {line}: duplicate exemplar id {metadata.exemplar_id!r}"
                )
            seen.add(metadata.exemplar_id)
            active = (metadata, line, match.start(), match.end())
        elif raw == "/AKWAAN_EXEMPLAR_META":
            if active is None:
                raise ExemplarMetadataError(
                    f"line {line}: closing marker without an opening marker"
                )
            metadata, start_line, block_start, content_start = active
            content = text[content_start : match.start()].strip()
            entries.append(
                ExemplarEntry(
                    metadata=metadata,
                    start_line=start_line,
                    end_line=line,
                    content=content,
                    source_block=text[block_start : match.end()],
                )
            )
            ranges.append((content_start, match.start()))
            active = None

    if active is not None:
        _, start_line, _, _ = active
        raise ExemplarMetadataError(
            f"line {start_line}: missing closing exemplar metadata marker"
        )
    return entries, ranges


def parse_exemplar_metadata(text: str) -> list[ExemplarEntry]:
    """Parse only explicit markers; ordinary Markdown is never authoritative."""

    return _parse(text)[0]


def resolve_exemplar_document(text: str) -> ExemplarDocument:
    """Return approved guidance plus the untouched historical source.

    Legacy example-shaped material without an explicit marker is reported and
    excluded.  It is intentionally not guessed as APPROVED.  A malformed
    marker still raises :class:`ExemplarMetadataError`, allowing callers to
    fail closed for that generation request.
    """

    entries, content_ranges = _parse(text)
    approved = [
        entry.source_block
        for entry in entries
        if entry.metadata.status == "APPROVED" and entry.content
    ]

    unclassified_lines: list[int] = []
    offset = 0
    for index, line in enumerate(text.splitlines(keepends=True), start=1):
        inside_marked_content = any(
            start <= offset < end for start, end in content_ranges
        )
        if not inside_marked_content and _looks_like_unclassified_entry(line):
            unclassified_lines.append(index)
        offset += len(line)

    diagnostics: list[str] = []
    if unclassified_lines:
        diagnostics.append(
            "EXEMPLAR_STATUS_UNCLASSIFIED: "
            + ",".join(str(line) for line in unclassified_lines)
        )

    return ExemplarDocument(
        entries=entries,
        approved_text="\n\n".join(approved),
        historical_text=text,
        diagnostics=tuple(diagnostics),
    )
