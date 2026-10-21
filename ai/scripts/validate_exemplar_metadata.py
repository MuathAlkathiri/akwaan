#!/usr/bin/env python3
"""Validate explicit metadata markers in Scope EXEMPLARS.md files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from exemplar_metadata import ExemplarMetadataError, parse_exemplar_metadata


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="EXEMPLARS.md paths")
    args = parser.parse_args()

    failed = False
    for raw_path in args.paths:
        path = Path(raw_path)
        try:
            entries = parse_exemplar_metadata(path.read_text(encoding="utf-8"))
        except (OSError, ExemplarMetadataError) as exc:
            failed = True
            print(f"VALIDATION_FAILED {path}: {exc}")
            continue
        print(
            json.dumps(
                {
                    "path": str(path),
                    "entryCount": len(entries),
                    "entries": [
                        {
                            "id": entry.metadata.exemplar_id,
                            "status": entry.metadata.status,
                            "reusePolicy": entry.metadata.reuse_policy,
                            "routingNote": entry.metadata.routing_note,
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
