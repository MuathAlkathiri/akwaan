#!/usr/bin/env python3
"""Push all generated Football World development packs to the Akwaan backend,
each ContentItem under its own Scope and mapped to the correct ChallengeType.

Mappings (backend IDs discovered at runtime; safe to hard-code):
  scopes:
    football.world-cup          -> 6a70f97cdfbf25db50410672
    football.champions-league   -> 6a71000a940f1eb4e015e369
    football.premier-league     -> 6a70fff7940f1eb4e015e304
    football.saudi-league       -> 6a710001940f1eb4e015e336
  challenge types:
    top-10              -> 6a71107b0cfcf2052be32ed7  (signature, mode top_10)
    read-your-opponent  -> 6a70eb25a360ae2c4f2dc51c  (ryo family)
    who-among-us        -> 6a723f657d6c784779ea6bdc  (relational, mode vote)
    guess-your-teammate -> 6a723f4c7d6c784779ea6bba  (coop family)

Usage:
    push_all_football.py [--dry-run] [pack.json ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

BASE = "http://localhost:3000"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

SCOPE_IDS = {
    "football.world-cup": "6a70f97cdfbf25db50410672",
    "football.champions-league": "6a71000a940f1eb4e015e369",
    "football.premier-league": "6a70fff7940f1eb4e015e304",
    "football.saudi-league": "6a710001940f1eb4e015e336",
}

CHALLENGE_TYPE_IDS = {
    "top-10": "6a71107b0cfcf2052be32ed7",
    "read-your-opponent": "6a70eb25a360ae2c4f2dc51c",
    "who-among-us": "6a723f657d6c784779ea6bdc",
    "guess-your-teammate": "6a723f4c7d6c784779ea6bba",
}

DEFAULT_PACKS = [
    "output/football-world-cup-read-your-opponent-002.json",
    "output/football-champions-league-read-your-opponent-002.json",
    "output/football-saudi-league-read-your-opponent.json",
    "output/football-premier-league-read-your-opponent.json",
    "output/football-world-cup-who-among-us.json",
    "output/football-champions-league-who-among-us.json",
    "output/football-saudi-league-who-among-us.json",
    "output/football-premier-league-who-among-us.json",
    "output/football-world-cup-guess-your-teammate.json",
    "output/football-champions-league-guess-your-teammate.json",
    "output/football-saudi-league-guess-your-teammate.json",
    "output/football-premier-league-guess-your-teammate.json",
    "output/football-saudi-top10-poison-development-pack.json",
    "output/football-premier-top10-poison-development-pack.json",
    "output/football-champions-top10-poison-development-pack.json",
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


def list_existing(token):
    """Return {(prompt_ar): backend_id} to avoid duplicate pushes."""
    seen = {}
    for limit in (200,):
        code, body = api("GET", "/admin/content-items", token)
        if code != 200:
            break
        data = body.get("data", [])
        for it in data or []:
            prompt = (it.get("prompt") or {}).get("ar", "")
            if prompt:
                seen[prompt] = it["id"]
        break
    return seen


def ryo_payload(item):
    """Read Your Opponent: multiple_choice or closest."""
    mode = item["answerMode"]
    ip = item["interactionPayload"]
    rp = item["resolutionPayload"]
    ap = {"mode": mode}
    if mode == "multiple_choice":
        ap["options"] = [{"id": o["id"], "label": {"ar": o["label"]}} for o in ip["options"]]
        ap["correctOptionId"] = rp["correctOptionId"]
    else:  # closest
        ap["correctValue"] = rp["correctValue"]
        ap["acceptedTolerance"] = rp["acceptedTolerance"]
    return ap


def wau_payload(item):
    """Who Among Us (relational): private roster vote tally."""
    return {"mode": "vote", "consensusRule": "majority"}


def gyt_payload(item):
    """Guess Your Teammate (coop): private answer + prediction equality."""
    return {"mode": "match", "consensusRule": "team_match"}


def top10_payload(item):
    """Top 10 poison deck: signature mechanic payload mirrors stored shape."""
    inter = item["interactionPayload"]
    reso = item["resolutionPayload"]
    return {
        "mode": "top_10",
        "mechanicPayload": {
            "variant": inter["variant"],
            "title": inter["title"],
            "instruction": "احتفظ بالبطاقة أو أرسلها لخصمك، ثم اكشفوا الترتيب.",
            "rankingBasis": inter["rankingBasis"],
            "sourceLabel": inter["sourceLabel"],
            "sourceUrl": inter["sourceUrl"],
            "asOfDate": inter["asOfDate"],
            "candidates": [
                {"id": c["id"], "label": c["label"]} for c in inter["candidates"]
            ],
            "rankedAnswer": [
                {"candidateId": e["candidateId"], "rank": e["rank"]}
                for e in reso["rankedEntries"]
            ],
            "decoyCandidateIds": reso["decoyCandidateIds"],
        },
    }


def to_backend(item, challenge_type):
    scope_id = SCOPE_IDS[item["scopeId"]]
    ct_id = CHALLENGE_TYPE_IDS[challenge_type]
    payload = {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [ct_id],
        "prompt": {"ar": item["prompt"]["ar"]},
        "isReusableAcrossSessions": item["isReusableAcrossSessions"],
        "status": "ready",
    }
    if challenge_type == "top-10":
        ap = top10_payload(item)
        payload["mechanicPayload"] = ap.pop("mechanicPayload")
        payload["answerPayload"] = ap
    elif challenge_type == "read-your-opponent":
        payload["answerPayload"] = ryo_payload(item)
    elif challenge_type == "who-among-us":
        payload["answerPayload"] = wau_payload(item)
    elif challenge_type == "guess-your-teammate":
        payload["answerPayload"] = gyt_payload(item)
    return payload


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    packs = args or DEFAULT_PACKS

    token = login()
    print("login ok")
    existing = list_existing(token)
    print(f"existing content items: {len(existing)}")

    stats = {"ok": 0, "skip": 0, "fail": 0, "total": 0}
    for p in packs:
        path = OUT / p
        pack = json.loads(path.read_text(encoding="utf-8"))
        items = pack.get("items") or [
            b for b in pack.get("contentItemBatches", []) for b in b.get("contentItems", [])
        ]
        challenge_type = (pack.get("challengeType") or items[0]["compatibleChallengeTypeIds"][0]) if items else None
        if not challenge_type and items:
            challenge_type = items[0]["compatibleChallengeTypeIds"][0]
        print(f"\n=== {path.name} -> {challenge_type} ===")
        for item in items:
            stats["total"] += 1
            prompt_ar = item["prompt"]["ar"]
            if prompt_ar in existing:
                print(f"  SKIP {item['id']} (already exists as {existing[prompt_ar]})")
                stats["skip"] += 1
                continue
            payload = to_backend(item, challenge_type)
            if dry:
                print(f"  DRY  {item['id']} scope={item['scopeId']} ct={challenge_type}")
                continue
            code, body = api("POST", "/admin/content-items", token, json=payload)
            if code in (200, 201):
                new_id = (body.get("data") or {}).get("id")
                existing[prompt_ar] = new_id
                stats["ok"] += 1
                print(f"  OK   {item['id']} -> {new_id}")
            else:
                stats["fail"] += 1
                print(f"  FAIL {item['id']} {code}: {json.dumps(body, ensure_ascii=False)[:300]}")

    print(f"\n=== RESULT {stats['ok']} ok / {stats['skip']} skip / {stats['fail']} fail / {stats['total']} total ===")


if __name__ == "__main__":
    main()