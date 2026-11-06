#!/usr/bin/env python3
"""Validate explicit metadata markers in Scope EXEMPLARS.md files.

Mechanic targets are checked against the canonical authoring manifest's
mechanic keys (``--manifest``), the same check the generation resolver
applies.  APPROVED entries without ``mechanics`` are reported as
``untargetedApproved``: they parse, but no generation prompt receives them
until the Product Owner targets them.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from exemplar_metadata import ExemplarMetadataError, parse_exemplar_metadata

DEFAULT_MANIFEST = "ai/.opencode/authoring-manifest.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="EXEMPLARS.md paths")
    parser.add_argument(
        "--manifest",
        default=DEFAULT_MANIFEST,
        help="authoring manifest whose mechanic keys targets must use",
    )
    args = parser.parse_args()

    try:
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        known_mechanics = set(manifest["mechanics"])
    except (OSError, ValueError, KeyError) as exc:
        print(f"VALIDATION_FAILED {args.manifest}: cannot read mechanic keys: {exc}")
        return 1

    failed = False
    for raw_path in args.paths:
        path = Path(raw_path)
        try:
            entries = parse_exemplar_metadata(path.read_text(encoding="utf-8"))
        except (OSError, ExemplarMetadataError) as exc:
            failed = True
            print(f"VALIDATION_FAILED {path}: {exc}")
            continue
        unknown = [
            (entry.start_line, mechanic)
            for entry in entries
            for mechanic in entry.metadata.mechanics or ()
            if mechanic not in known_mechanics
        ]
        if unknown:
            failed = True
            for line, mechanic in unknown:
                print(
                    f"VALIDATION_FAILED {path}: line {line}: unknown mechanic "
                    f"{mechanic} (use a canonical manifest key)"
                )
            continue
        print(
            json.dumps(
                {
                    "path": str(path),
                    "entryCount": len(entries),
                    "untargetedApproved": [
                        entry.metadata.exemplar_id
                        for entry in entries
                        if entry.metadata.status == "APPROVED"
                        and entry.metadata.mechanics is None
                    ],
                    "entries": [
                        {
                            "id": entry.metadata.exemplar_id,
                            "status": entry.metadata.status,
                            "reusePolicy": entry.metadata.reuse_policy,
                            "routingNote": entry.metadata.routing_note,
                            "mechanics": (
                                list(entry.metadata.mechanics)
                                if entry.metadata.mechanics is not None
                                else None
                            ),
                            "approvedBy": entry.metadata.approved_by,
                            "approvedAt": entry.metadata.approved_at,
                            "sourceRef": entry.metadata.source_ref,
                            "startLine": entry.start_line,
                            "endLine": entry.end_line,
                        }
                        for entry in entries
                    ],
                },
                ensure_ascii=False,
            )
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
