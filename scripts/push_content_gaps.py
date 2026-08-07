#!/usr/bin/env python3
"""Unified push for Akwaan ContentItem packs covering all enabled mechanics.

Mappings (backend IDs verified against /admin/challenge-types and
/admin/worlds/:id/challenge-configurations):

  scopes:
    football.world-cup         -> 6a70f97cdfbf25db50410672
    football.champions-league  -> 6a71000a940f1eb4e015e369
    football.premier-league    -> 6a70fff7940f1eb4e015e304
    football.saudi-league      -> 6a710001940f1eb4e015e336
    anime.attack-on-titan      -> 6a7261944c19c862fcb4c508
    anime.bleach               -> 6a72619b4c19c862fcb4c53b
    anime.naruto               -> 6a7112f94d411d708f981a5c
    anime.one-piece            -> 6a72618d4c19c862fcb4c4d6
    video-games.gta            -> 6a7261df4c19c862fcb4c6be
    video-games.overwatch      -> 6a7261c94c19c862fcb4c659
    video-games.fifa           -> 6a7261d54c19c862fcb4c68b
    video-games.call-of-duty   -> 6a71130a4d411d708f981aa1

  challenge types:
    read-your-opponent        -> 6a70eb25a360ae2c4f2dc51c  (ryo)
    who-among-us              -> 6a723f657d6c784779ea6bdc  (vote)
    guess-your-teammate       -> 6a723f4c7d6c784779ea6bba  (coop/closest)
    split-clue                -> 6a70fb0adfbf25db50410702  (signature/split)
    top-10                    -> 6a71107b0cfcf2052be32ed7  (signature/top_10)

Usage:
    push_content_gaps.py [--dry-run] [pack.json ...]
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
    "anime.attack-on-titan": "6a7261944c19c862fcb4c508",
    "anime.bleach": "6a72619b4c19c862fcb4c53b",
    "anime.naruto": "6a7112f94d411d708f981a5c",
    "anime.one-piece": "6a72618d4c19c862fcb4c4d6",
    "video-games.gta": "6a7261df4c19c862fcb4c6be",
    "video-games.overwatch": "6a7261c94c19c862fcb4c659",
    "video-games.fifa": "6a7261d54c19c862fcb4c68b",
    "video-games.call-of-duty": "6a71130a4d411d708f981aa1",
}

CHALLENGE_TYPE_IDS = {
    "read-your-opponent": "6a70eb25a360ae2c4f2dc51c",
    "who-among-us": "6a723f657d6c784779ea6bdc",
    "guess-your-teammate": "6a723f4c7d6c784779ea6bba",
    "split-clue": "6a70fb0adfbf25db50410702",
    "top-10": "6a71107b0cfcf2052be32ed7",
}

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


def gyt_payload(item):
    """Guess Your Teammate (coop 'مين اقرب'): numeric closest estimate."""
    rp = item["resolutionPayload"]
    return {
        "mode": "closest",
        "correctValue": rp["correctValue"],
        "acceptedTolerance": rp.get("acceptedTolerance", 0),
    }


def split_payload(item):
    """معلومات مقسّمة: per-seat private clues combined into one accepted answer."""
    ip = item["interactionPayload"]
    rp = item["resolutionPayload"]
    fragments = [
        {"seat": f["seat"], "clue": {"ar": f["clue"]}}
        for f in ip["fragments"]
    ]
    return {
        "mode": "split",
        "splitPayload": {"fragments": fragments},
        "acceptedAnswers": rp["acceptedAnswers"],
    }


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
    elif challenge_type == "split-clue":
        payload["answerPayload"] = split_payload(item)
    return payload


def pack_challenge_type(pack, items):
    if pack.get("challengeType"):
        return pack["challengeType"]
    if items:
        return items[0]["compatibleChallengeTypeIds"][0]
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    packs = args or []

    token = login()
    print("login ok")
    existing = list_existing(token)
    print(f"existing content items: {len(existing)}")

    stats = {"ok": 0, "skip": 0, "fail": 0, "total": 0}
    for p in packs:
        path = Path(p)
        if not path.is_absolute():
            path = OUT / path
        pack = json.loads(path.read_text(encoding="utf-8"))
        items = pack.get("items") or []
        challenge_type = pack_challenge_type(pack, items)
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
                print(f"  FAIL {item['id']} {code}: {json.dumps(body, ensure_ascii=False)[:400]}")

    print(f"\n=== RESULT {stats['ok']} ok / {stats['skip']} skip / {stats['fail']} fail / {stats['total']} total ===")


if __name__ == "__main__":
    main()
