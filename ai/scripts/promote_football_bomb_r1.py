#!/usr/bin/env python3
"""Promote the approved Football Bomb Question Craft Batch (R1) to the Admin API.

Follows the canonical content promotion workflow:
1. Login as admin
2. POST each ContentItem through /admin/content-items
3. Check /admin/content-items/:id/readiness (blockers == [])
4. Idempotency: skip if already present by unique fingerprint / metadata.source
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import requests

BASE = os.environ.get("AKWAAN_API_URL", "http://localhost:3002")
LOGIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@test.com"),
    "password": os.environ.get("ADMIN_PASSWORD", "strongPassword@123")
}

WORLD_RUNTIME_ID = "6a6e46a747bc63bdaf2e3800"  # Football World
BOMB_CT_RUNTIME_ID = "6a86276c215dc4d4bed0cfe0"  # Bomb ChallengeType

SCOPE_RUNTIME_IDS = {
    "premier-league": "6a70fff7940f1eb4e015e304",
    "champions-league": "6a71000a940f1eb4e015e369",
    "world-cup": "6a70ee5f0f201ac138fa4fba",
}

BATCH = Path(__file__).resolve().parent / "data/bomb-football-question-craft-r1.source.json"


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
    media_val = ""
    if item.get("media", {}).get("type") == "image":
        media_val = item["media"]["assets"][0]["url"]
    canonical = {
        "kind": "bomb",
        "scopeId": scope_runtime_id,
        "compatibleChallengeTypeId": BOMB_CT_RUNTIME_ID,
        "prompt": item["prompt"]["ar"],
        "answers": item["answerPayload"]["acceptedAnswers"],
        "media": media_val,
        "sourceTag": "bomb-football-question-craft-r1",
    }
    raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True)
    return "bomb-football-question-craft-r1:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def fetch_existing_sources(token: str) -> dict[str, str]:
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
    scope_id = item["scopeId"]
    payload = {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [BOMB_CT_RUNTIME_ID],
        "prompt": {"ar": item["prompt"]["ar"]},
        "answerPayload": item["answerPayload"],
        "isReusableAcrossSessions": item.get("isReusableAcrossSessions", False),
        "status": "ready",
        "metadata": {
            "source": fingerprint,
            "notes": "Approved Football Bomb Question Craft Batch R1 — promoted 2026-08-24",
            "tags": ["bomb", "production", "football", "question-craft-r1"],
        },
    }
    if item.get("media", {}).get("type") == "image":
        payload["media"] = {
            "type": "image",
            "assets": item["media"]["assets"]
        }
    else:
        payload["media"] = {
            "type": "none",
            "assets": []
        }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote Football Bomb Question Craft R1")
    parser.add_argument("--dry-run", action="store_true", help="Perform preflight dry run without writes")
    parser.add_argument("--skip-existing", action="store_true", default=True, help="Skip already promoted items")
    args = parser.parse_args()

    if not BATCH.exists():
        print(f"batch not found: {BATCH}")
        sys.exit(2)

    data = json.loads(BATCH.read_text(encoding="utf-8"))
    items = data["questions"]

    token = login()
    print(f"login ok to {BASE}")

    existing = fetch_existing_sources(token)
    print(f"existing bomb items in runtime: {len(existing)}")

    stats = {"ok": 0, "fail": 0, "skip": 0, "total": 0, "inserted_ids": []}
    for item in items:
        stats["total"] += 1
        iid = item["id"]
        scope_runtime = item["scopeId"]
        fp = bomb_fingerprint(item, scope_runtime)

        if fp in existing:
            existing_id = existing[fp]
            stats["skip"] += 1
            print(f"  SKIP {iid} (already present as {existing_id})")
            stats["inserted_ids"].append({"authoredId": iid, "runtimeId": existing_id, "status": "existing"})
            continue

        payload = to_payload(item, fp)

        if args.dry_run:
            modality = item.get("modality", "text")
            print(f"  DRY  {iid} scope={item.get('scopeSlug', scope_runtime)} modality={modality} -> NEW")
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
    if args.dry_run:
        print("  dry-run preflight: no writes performed")
    else:
        print(json.dumps(stats["inserted_ids"], indent=2))
    sys.exit(1 if stats["fail"] else 0)


if __name__ == "__main__":
    main()
