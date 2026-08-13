#!/usr/bin/env python3
"""Push the 2026-08-13 beta gap packs to the canonical admin API (:3002).

Handles all five enabled mechanics with per-item conversion:
  one-clue               -> native pass-through (answerPayload + mechanicPayload)
  distributed-information-> native three-segment-race pass-through
  top-5                  -> authoring interactionPayload -> native mechanicPayload
  read-your-opponent     -> multiple_choice -> answerPayload
  guess-your-teammate    -> closest -> answerPayload

After each POST it reads /admin/content-items/:id/readiness and requires
blockers == [] before counting the item as delivered.

Usage:
    push_gap_packs_2026_08_13.py [--dry-run] [pack.json ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

BASE = "http://localhost:3002"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

SCOPE_IDS = {
    "football.world-cup": "6a70f97cdfbf25db50410672",
    "football.champions-league": "6a71000a940f1eb4e015e369",
    "football.premier-league": "6a70fff7940f1eb4e015e304",
    "football.saudi-league": "6a710001940f1eb4e015e336",
    "anime.attack-on-titan": "6a7261944c19c862fcb4c508",
    "anime.bleach": "6a72619b4c19c862fcb4c53b",
    "anime.naruto": "6a7112f94d411d708f981a5c",
    "anime.one-piece": "6a72618d4c19c862fcb4c4d6",
    "video-games.gta": "6a7261df4c19c862fcb4c6be",
    "video-games.overwatch": "6a7261c94c19c862fcb4c659",
    "video-games.fifa": "6a7261d54c19c862fcb4c68b",
    "video-games.call-of-duty": "6a71130a4d411d708f981aa1",
    "puzzles.numbers-arithmetic": "6a7a224b4cfb4a6a8738d66e",
    "puzzles.logic-deduction": "6a7a22674cfb4a6a8738d6a5",
    "puzzles.letters-words": "6a7a229f4cfb4a6a8738d6dd",
    "puzzles.symbols-codes": "6a7a22ab4cfb4a6a8738d716",
    "puzzles.general-knowledge": "6a7a22e44cfb4a6a8738d750",
}

CHALLENGE_TYPE_IDS = {
    "one-clue": "6a7b7f81e4ee832e7c085051",
    "distributed-information": "6a7381130ca5379e323e6fe7",
    "read-your-opponent": "6a70eb25a360ae2c4f2dc51c",
    "guess-your-teammate": "6a723f4c7d6c784779ea6bba",
    "top-5": "6a71107b0cfcf2052be32ed7",
}

DEFAULT_PACKS = [
    "output/gap-packs-2026-08-13/football-pack.json",
    "output/gap-packs-2026-08-13/anime-pack.json",
    "output/gap-packs-2026-08-13/video-games-pack.json",
    "output/gap-packs-2026-08-13/puzzles-pack.json",
]

OUT = Path(__file__).resolve().parents[1]


def login():
    r = requests.post(BASE + "/auth/login", json=LOGIN, timeout=20)
    r.raise_for_status()
    return r.json()["accessToken"]


def api(method, path, token, **kwargs):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.request(method, BASE + path, headers=headers, timeout=120, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body


def item_kind(item: dict) -> str:
    ids = item.get("compatibleChallengeTypeIds", [])
    if "distributed-information" in ids:
        return "distributed-information"
    if "top-5" in ids:
        return "top-5"
    if "one-clue" in ids:
        return "one-clue"
    if "guess-your-teammate" in ids:
        return "guess-your-teammate"
    return "read-your-opponent"


def to_backend(item: dict, kind: str) -> dict:
    scope_id = SCOPE_IDS[item["scopeId"]]
    ct_id = CHALLENGE_TYPE_IDS[kind]
    payload = {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [ct_id],
        "prompt": {"ar": item["prompt"]["ar"]},
        "isReusableAcrossSessions": item["isReusableAcrossSessions"],
        "status": "ready",
    }
    if kind in ("one-clue", "distributed-information"):
        payload["answerPayload"] = item["answerPayload"]
        payload["mechanicPayload"] = item["mechanicPayload"]
    elif kind == "top-5":
        inter = item["interactionPayload"]
        entries = [
            {"id": e["id"], "label": e["label"], "rank": e.get("rank"),
             **({"sourceValue": e["sourceValue"]} if "sourceValue" in e else {})}
            for e in inter["entries"]
        ]
        payload["answerPayload"] = {"mode": "top_5"}
        payload["mechanicPayload"] = {
            "variant": "keep-or-give",
            "title": inter["title"],
            "instruction": "احتفظ بالبطاقة أو أرسلها لخصمك، ثم اكشفوا الترتيب.",
            "rankingBasis": inter["rankingBasis"],
            "sourceLabel": inter["sourceLabel"],
            "sourceUrl": inter.get("sourceUrl"),
            "asOfDate": inter.get("asOfDate"),
            "entries": entries,
        }
    elif kind == "read-your-opponent":
        ip = item["interactionPayload"]
        rp = item["resolutionPayload"]
        payload["answerPayload"] = {
            "mode": "multiple_choice",
            "options": [{"id": o["id"], "label": {"ar": o["label"]}} for o in ip["options"]],
            "correctOptionId": rp["correctOptionId"],
        }
    elif kind == "guess-your-teammate":
        rp = item["resolutionPayload"]
        payload["answerPayload"] = {
            "mode": "closest",
            "correctValue": rp["correctValue"],
            "acceptedTolerance": rp["acceptedTolerance"],
        }
    return payload


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    packs = args or DEFAULT_PACKS

    token = login()
    print("login ok")

    stats = {"ok": 0, "fail": 0, "skip": 0, "total": 0}
    for p in packs:
        path = Path(p)
        if not path.is_absolute():
            path = OUT / path
        pack = json.loads(path.read_text(encoding="utf-8"))
        print(f"\n=== {path.name} ({len(pack['items'])} items) ===")
        for item in pack["items"]:
            kind = item_kind(item)
            stats["total"] += 1
            if dry:
                print(f"  DRY  {item['id']} scope={item['scopeId']} kind={kind}")
                continue
            payload = to_backend(item, kind)
            code, body = api("POST", "/admin/content-items", token, json=payload)
            if code not in (200, 201):
                stats["fail"] += 1
                print(f"  FAIL {item['id']} {code}: {json.dumps(body, ensure_ascii=False)[:300]}")
                continue
            new_id = (body.get("data") or {}).get("id")
            rcode, rbody = api("GET", f"/admin/content-items/{new_id}/readiness", token)
            blockers = ((rbody.get("data") or {}).get("blockers")) if rcode == 200 else ["readiness_unavailable"]
            if blockers:
                stats["fail"] += 1
                print(f"  READY-FAIL {item['id']} -> {new_id}: {json.dumps(blockers, ensure_ascii=False)[:300]}")
            else:
                stats["ok"] += 1
                print(f"  OK   {item['id']} -> {new_id} (ready)")

    print(f"\n=== RESULT {stats['ok']} ok / {stats['skip']} skip / {stats['fail']} fail / {stats['total']} total ===")


if __name__ == "__main__":
    main()