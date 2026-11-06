"""Strict parser and generation-safe view for Scope EXEMPLARS.md metadata.

Only explicit metadata markers are authoritative.  Markdown headings, prose,
emoji and tables cannot grant an exemplar generation eligibility.  The parser
also exposes the original source unchanged so historical screening can retain
its evidence while the generation view is restricted to APPROVED blocks that
explicitly target the mechanic being generated.

``APPROVED`` is the engine's eligibility marker, not the Reference Library's
Gold standard, and the provenance fields record an approval rather than verify
one.  Final Gold approval is the Product Owner's.  Mirrors
``backend/src/modules/content-engine/application/exemplar-metadata.ts``.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
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
# Manifest mechanic keys are lowercase words joined by "-" or "_".
MECHANIC_RE = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
MAX_APPROVED_BY = 120
MAX_SOURCE_REF = 200
MARKER_RE = re.compile(r"<!--(.*?)-->", re.DOTALL)

# Why an APPROVED entry did not reach a generation prompt.
UNTARGETED_EXCLUDED = "EXEMPLAR_UNTARGETED_EXCLUDED"
MECHANIC_EXCLUDED = "EXEMPLAR_MECHANIC_EXCLUDED"


@dataclass(frozen=True)
class ExemplarMetadata:
    version: int
    exemplar_id: str
    status: str
    reuse_policy: str
    routing_note: str | None = None
    # Canonical manifest mechanic keys this exemplar may teach.  ``None`` on
    # legacy entries, which are then never eligible: untargeted is never "all".
    mechanics: tuple[str, ...] | None = None
    # Recorded approval provenance: author-written, not workflow-verified.
    approved_by: str | None = None
    approved_at: str | None = None
    source_ref: str | None = None


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

    allowed = {
        "version",
        "id",
        "status",
        "reusePolicy",
        "routingNote",
        "mechanics",
        "approvedBy",
        "approvedAt",
        "sourceRef",
    }
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
    mechanics: tuple[str, ...] | None = None
    if "mechanics" in value:
        raw_mechanics = value["mechanics"]
        if not isinstance(raw_mechanics, list) or not raw_mechanics:
            # An empty list must never be read as "every mechanic".
            raise ExemplarMetadataError(
                f"line {line}: mechanics must be a non-empty list of canonical mechanic keys"
            )
        for mechanic in raw_mechanics:
            if not isinstance(mechanic, str) or not MECHANIC_RE.fullmatch(mechanic):
                raise ExemplarMetadataError(
                    f"line {line}: malformed mechanic key {json.dumps(mechanic)}"
                )
        if len(set(raw_mechanics)) != len(raw_mechanics):
            raise ExemplarMetadataError(
                f"line {line}: mechanics must not repeat a key"
            )
        mechanics = tuple(raw_mechanics)

    has_approver = "approvedBy" in value
    has_date = "approvedAt" in value
    if (has_approver or has_date) and status != "APPROVED":
        raise ExemplarMetadataError(
            f"line {line}: approvedBy/approvedAt are only valid on APPROVED entries"
        )
    if has_approver != has_date:
        raise ExemplarMetadataError(
            f"line {line}: approvedBy and approvedAt must be recorded together"
        )
    approved_by = approved_at = None
    if has_approver:
        problem = _single_line_problem(value["approvedBy"], MAX_APPROVED_BY)
        if problem:
            raise ExemplarMetadataError(f"line {line}: approvedBy must be {problem}")
        if not _is_calendar_date(value["approvedAt"]):
            raise ExemplarMetadataError(
                f"line {line}: approvedAt must be a calendar date YYYY-MM-DD"
            )
        approved_by, approved_at = value["approvedBy"], value["approvedAt"]

    source_ref = None
    if "sourceRef" in value:
        problem = _single_line_problem(value["sourceRef"], MAX_SOURCE_REF)
        if problem:
            raise ExemplarMetadataError(f"line {line}: sourceRef must be {problem}")
        source_ref = value["sourceRef"]

    return ExemplarMetadata(
        version=GRAMMAR_VERSION,
        exemplar_id=exemplar_id,
        status=status,
        reuse_policy=REUSE_POLICY,
        routing_note=note,
        mechanics=mechanics,
        approved_by=approved_by,
        approved_at=approved_at,
        source_ref=source_ref,
    )


def _is_calendar_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    match = DATE_RE.fullmatch(value)
    if not match:
        return False
    try:
        date(*(int(part) for part in match.groups()))
    except ValueError:
        return False
    return True


def _single_line_problem(value: Any, maximum: int) -> str | None:
    """A trimmed, single-line, bounded string — or why it is not one."""

    if not isinstance(value, str) or not value.strip():
        return "a non-empty string"
    if value != value.strip():
        return "without surrounding whitespace"
    if "\r" in value or "\n" in value:
        return "a single line"
    if len(value) > maximum:
        return f"at most {maximum} characters"
    return None


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


def resolve_exemplar_document(
    text: str,
    *,
    mechanic_key: str,
    known_mechanics: Iterable[str] | None = None,
) -> ExemplarDocument:
    """Return the generation-safe view for one mechanic plus the raw source.

    An entry reaches ``approved_text`` only when it is APPROVED, has content
    and explicitly lists ``mechanic_key`` in ``mechanics``.  Legacy APPROVED
    entries without ``mechanics`` are excluded and reported, never treated as
    eligible for every mechanic.  ``historical_text`` is always the untouched
    source so duplicate screening still sees every entry.  When
    ``known_mechanics`` is given, a target outside it raises
    :class:`ExemplarMetadataError`, as does a malformed marker, so callers can
    fail closed for that generation request.
    """

    entries, content_ranges = _parse(text)
    if known_mechanics is not None:
        known = set(known_mechanics)
        for entry in entries:
            for mechanic in entry.metadata.mechanics or ():
                if mechanic not in known:
                    raise ExemplarMetadataError(
                        f"line {entry.start_line}: unknown mechanic {mechanic} "
                        "(use a canonical manifest key)"
                    )
    eligible = [
        entry
        for entry in entries
        if entry.metadata.status == "APPROVED" and entry.content
    ]
    untargeted = [e for e in eligible if e.metadata.mechanics is None]
    other_mechanic = [
        e
        for e in eligible
        if e.metadata.mechanics is not None
        and mechanic_key not in e.metadata.mechanics
    ]
    approved = [
        e.source_block
        for e in eligible
        if e.metadata.mechanics is not None and mechanic_key in e.metadata.mechanics
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
    if untargeted:
        diagnostics.append(
            f"{UNTARGETED_EXCLUDED}: "
            + ",".join(e.metadata.exemplar_id for e in untargeted)
        )
    if other_mechanic:
        diagnostics.append(
            f"{MECHANIC_EXCLUDED}: "
            + ",".join(e.metadata.exemplar_id for e in other_mechanic)
        )
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
