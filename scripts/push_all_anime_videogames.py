#!/usr/bin/env python3
"""Push the Anime + Video Games development packs to the Akwaan backend.

Mappings (backend IDs verified against /admin/challenge-types and
/admin/worlds/:id/scopes):
  scopes:
    anime.naruto          -> 6a7112f94d411d708f981a5c
    anime.one-piece       -> 6a72618d4c19c862fcb4c4d6
    anime.attack-on-titan -> 6a7261944c19c862fcb4c508
    video-games.call-of-duty -> 6a71130a4d411d708f981aa1
  challenge types:
    read-your-opponent -> 6a70eb25a360ae2c4f2dc51c  (ryo family)
    who-among-us       -> 6a723f657d6c784779ea6bdc  (relational, mode vote)

Usage:
    push_all_anime_videogames.py [--dry-run] [pack.json ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

BASE = "http://localhost:3000"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

SCOPE_IDS = {
    "anime.naruto": "6a7112f94d411d708f981a5c",
    "anime.one-piece": "6a72618d4c19c862fcb4c4d6",
    "anime.attack-on-titan": "6a7261944c19c862fcb4c508",
    "video-games.call-of-duty": "6a71130a4d411d708f981aa1",
}

CHALLENGE_TYPE_IDS = {
    "read-your-opponent": "6a70eb25a360ae2c4f2dc51c",
    "who-among-us": "6a723f657d6c784779ea6bdc",
}

DEFAULT_PACKS = [
    "output/anime-videogames-packs-v1/anime-naruto-read-your-opponent-001.json",
    "output/anime-videogames-packs-v1/anime-naruto-who-among-us-001.json",
    "output/anime-videogames-packs-v1/anime-attack-on-titan-read-your-opponent-001.json",
    "output/anime-videogames-packs-v1/anime-attack-on-titan-who-among-us-001.json",
    "output/anime-videogames-packs-v1/anime-one-piece-read-your-opponent-001.json",
    "output/anime-videogames-packs-v1/anime-one-piece-who-among-us-001.json",
    "output/anime-videogames-packs-v1/video-games-call-of-duty-read-your-opponent-001.json",
    "output/anime-videogames-packs-v1/video-games-call-of-duty-who-among-us-001.json",
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
    code, body = api("GET", "/admin/content-items", token)
    if code == 200:
        for it in body.get("data", []) or []:
            prompt = (it.get("prompt") or {}).get("ar", "")
            if prompt:
                seen[prompt] = it["id"]
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
    if challenge_type == "read-your-opponent":
        payload["answerPayload"] = ryo_payload(item)
    elif challenge_type == "who-among-us":
        payload["answerPayload"] = wau_payload(item)
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
        items = pack.get("items") or []
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
