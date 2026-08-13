#!/usr/bin/env python3
"""Validate the 2026-08-13 beta gap packs, routing each item to its validator.

  one-clue items        -> validate_one_clue.validate()
  top-5 items           -> top-5.patterns schema + validate_top_5.validate()
  read-your-opponent /  -> CONTENTITEM.schema.json (generic authoring)
  guess-your-teammate
  distributed-information -> structural check only (live three-segment-race);
                           authoritative gate is backend readiness after push.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "output" / "gap-packs-2026-08-13"
GENERIC_SCHEMA = ROOT / ".opencode/validators/CONTENTITEM.schema.json"
TOP5_SCHEMA = ROOT / ".opencode/skills/challenge-types/top-5/top-5.patterns.schema.json"

sys.path.insert(0, str(ROOT / ".opencode/validators"))
import validate_one_clue as voc  # noqa: E402
import validate_schema_examples as vse  # noqa: E402
import validate_top_5 as vtt  # noqa: E402

PACKS = ["football-pack.json", "anime-pack.json",
         "video-games-pack.json", "puzzles-pack.json"]


def di_structural(item: dict) -> list[str]:
    errors: list[str] = []
    mp = item.get("mechanicPayload", {})
    if mp.get("variant") != "three-segment-race":
        errors.append("di: variant != three-segment-race")
    segs = mp.get("segments", [])
    if [s.get("id") for s in segs] != ["A", "B", "C"]:
        errors.append("di: segments must be A/B/C")
    if any(not ((s.get("content") or {}).get("ar", "").strip()) for s in segs):
        errors.append("di: segment content.ar missing")
    if len(mp.get("twoPlayerMergeOptions", [])) != 3:
        errors.append("di: twoPlayerMergeOptions must be 3 combos")
    if mp.get("supportedTeamSizes") != [2, 3]:
        errors.append("di: supportedTeamSizes must be [2,3]")
    if mp.get("authorSafetyConfirmation") is not True:
        errors.append("di: authorSafetyConfirmation must be true")
    ap = item.get("answerPayload", {})
    if ap.get("mode") != "match" or not isinstance(ap.get("acceptedAnswers"), list) or not ap["acceptedAnswers"]:
        errors.append("di: answerPayload must be match with acceptedAnswers")
    if item.get("isReusableAcrossSessions") is not False:
        errors.append("di: isReusableAcrossSessions must be false")
    return errors


def main() -> int:
    generic = json.loads(GENERIC_SCHEMA.read_text(encoding="utf-8"))
    t5schema = json.loads(TOP5_SCHEMA.read_text(encoding="utf-8"))
    failed = False
    counts = {"one-clue": 0, "top-5": 0, "ryo": 0, "closest": 0, "di": 0}
    for pack_name in PACKS:
        pack = json.loads((PACK_DIR / pack_name).read_text(encoding="utf-8"))
        for item in pack["items"]:
            ids = item.get("compatibleChallengeTypeIds", [])
            kind = "di" if "distributed-information" in ids else (
                "top-5" if "top-5" in ids else (
                    "one-clue" if "one-clue" in ids else (
                        "closest" if "guess-your-teammate" in ids else "ryo")))
            counts[kind] += 1
            label = f"{pack_name} :: {item.get('id')}"
            if kind == "one-clue":
                errors = voc.validate(item)
            elif kind == "top-5":
                errors = vse.validate(item, t5schema, t5schema) + vtt.validate(item)
            elif kind in ("ryo", "closest"):
                errors = vse.validate(item, generic, generic)
            else:  # di
                errors = di_structural(item)
            if errors:
                failed = True
                print(f"FAIL {label}")
                for err in errors:
                    print(f"  - {err}")
            else:
                print(f"PASS {label}")
    print(f"\ncounts: {counts}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())