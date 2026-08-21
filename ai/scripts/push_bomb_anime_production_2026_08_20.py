#!/usr/bin/env python3
"""Promote the approved Anime Bomb production batch (R2.2) to the Admin API (:3002).

Follows the exact canonical content-management workflow:
1. Login as admin
2. POST each ContentItem through /admin/content-items
3. Check /admin/content-items/:id/readiness and require blockers == []
4. Idempotency: skip if already present by unique fingerprint / metadata.source
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import requests

BASE = "http://localhost:3002"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

WORLD_RUNTIME_ID = "6a6e54159e10fe3b881da006"  # Anime World
BOMB_CT_RUNTIME_ID = "6a86276c215dc4d4bed0cfe0"  # Bomb ChallengeType
SCOPE_RUNTIME_IDS = {
    "anime.naruto": "6a7112f94d411d708f981a5c",
    "anime.one-piece": "6a72618d4c19c862fcb4c4d6",
    "anime.attack-on-titan": "6a7261944c19c862fcb4c508",
    "anime.bleach": "6a72619b4c19c862fcb4c53b",
}

BATCH = Path(__file__).resolve().parents[1] / "output/bomb-anime-production-section-1-2026-08-20/source-questions.json"


def login() -> str:
    r = requests.post(BASE + "/auth/login", json=LOGIN, timeout=20)
    r.raise_for_status()
    return r.json()["accessToken"]


def api(method: str, path: str, token: str, **kwargs):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.request(method, BASE + path, headers=headers, timeout=120, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body


def bomb_fingerprint(item: dict, scope_runtime_id: str) -> str:
    canonical = {
        "kind": "bomb",
        "scopeId": scope_runtime_id,
        "compatibleChallengeTypeId": BOMB_CT_RUNTIME_ID,
        "prompt": item["prompt"]["ar"],
        "answers": item["answerPayload"]["acceptedAnswers"],
        "imageUrl": item["media"]["assets"][0]["url"],
        "sourceTag": "bomb-anime-production-section-1-2026-08-20",
    }
    raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True)
    return "bomb-anime-production-section-1-2026-08-20:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def fetch_existing_sources(token: str) -> dict[str, str]:
    """Map metadata.source -> item id for existing Bomb items."""
    result: dict[str, str] = {}
    code, body = api(
        "GET",
        f"/admin/content-items?worldId={WORLD_RUNTIME_ID}&challengeTypeId={BOMB_CT_RUNTIME_ID}",
        token,
    )
    if code != 200:
        return result
    for it in body.get("data") or []:
        meta = it.get("metadata") if isinstance(it.get("metadata"), dict) else {}
        if meta.get("source"):
            result[meta["source"]] = it.get("id")
    return result


def to_payload(item: dict, fingerprint: str) -> dict:
    scope_id = SCOPE_RUNTIME_IDS[item["scopeId"]]
    return {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [BOMB_CT_RUNTIME_ID],
        "prompt": {"ar": item["prompt"]["ar"]},
        "answerPayload": item["answerPayload"],
        "media": item["media"],
        "isReusableAcrossSessions": item.get("isReusableAcrossSessions", False),
        "status": "ready",
        "metadata": {
            "source": fingerprint,
            "notes": "Approved Anime Bomb production batch Section 1 R2.2 — promoted 2026-08-20",
            "tags": ["bomb", "production", "anime"],
        },
    }


def main() -> None:
    dry = "--dry-run" in sys.argv
    skip_existing = "--skip-existing" in sys.argv
    if not BATCH.exists():
        print(f"batch not found: {BATCH}")
        sys.exit(2)

    data = json.loads(BATCH.read_text(encoding="utf-8"))
    items = data["questions"]

    token = login()
    print("login ok")

    existing = fetch_existing_sources(token)
    print(f"existing bomb items in runtime: {len(existing)}")

    stats = {"ok": 0, "fail": 0, "skip": 0, "total": 0, "inserted_ids": []}
    for item in items:
        stats["total"] += 1
        iid = item["id"]
        scope_runtime = SCOPE_RUNTIME_IDS.get(item["scopeId"])
        fp = bomb_fingerprint(item, scope_runtime)

        if fp in existing:
            existing_id = existing[fp]
            if skip_existing or dry:
                stats["skip"] += 1
                print(f"  SKIP {iid} (already present as {existing_id})")
                stats["inserted_ids"].append({"authoredId": iid, "runtimeId": existing_id, "status": "existing"})
                continue

        payload = to_payload(item, fp)

        if dry:
            print(f"  DRY  {iid} scope={item['scopeId']} -> NEW")
            continue

        code, body = api("POST", "/admin/content-items", token, json=payload)
        if code not in (200, 201):
            stats["fail"] += 1
            print(f"  FAIL {iid} {code}: {json.dumps(body, ensure_ascii=False)[:300]}")
            continue

        new_id = (body.get("data") or {}).get("id")
        rcode, rbody = api("GET", f"/admin/content-items/{new_id}/readiness", token)
        blockers = ((rbody.get("data") or {}).get("blockers")) if rcode == 200 else ["readiness_unavailable"]
        if blockers:
            stats["fail"] += 1
            print(f"  READY-FAIL {iid} -> {new_id}: {json.dumps(blockers, ensure_ascii=False)[:300]}")
        else:
            stats["ok"] += 1
            stats["inserted_ids"].append({"authoredId": iid, "runtimeId": new_id, "status": "created"})
            print(f"  OK   {iid} -> {new_id} (ready)")

    print(f"\n=== RESULT {stats['ok']} ok / {stats['skip']} skip / {stats['fail']} fail / {stats['total']} total ===")
    if dry:
        print("  dry-run preflight: no writes performed")
    else:
        print(json.dumps(stats["inserted_ids"], indent=2))
    sys.exit(1 if stats["fail"] else 0)


if __name__ == "__main__":
    main()
