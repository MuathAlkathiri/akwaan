#!/usr/bin/env python3
"""Promote the approved Anime Combo production batch (R1.1) to the Admin API (:3002).

Follows the exact canonical content-management workflow used by
push_gap_packs_2026_08_13.py: login as admin, POST each ContentItem through
/admin/content-items, then read /admin/content-items/:id/readiness and require
blockers == [] before counting the item as delivered. No raw Mongo writes.

Combo items are native World Content already: answerPayload.mode=match +
mechanicPayload.comboStage. scopeId slugs and the "combo" challenge-type slug
are mapped to their runtime ObjectIds, mirroring the gap-pack push.

A stable content fingerprint is persisted in the valid `metadata.source` field
so --skip-existing recognises a re-pushed batch and never duplicates.

Usage:
    push_combo_anime_production_2026_08_20.py [--dry-run] [--skip-existing]
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import requests

BASE = "http://localhost:3002"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

# Runtime ObjectIds (verified against the running lammah-quiz replica set).
WORLD_RUNTIME_ID = "6a6e54159e10fe3b881da006"  # انمي
COMBO_CT_RUNTIME_ID = "6a85c821d89e8ec0d55ed529"  # combo
SCOPE_RUNTIME_IDS = {
    "anime.naruto": "6a7112f94d411d708f981a5c",
    "anime.one-piece": "6a72618d4c19c862fcb4c4d6",
    "anime.attack-on-titan": "6a7261944c19c862fcb4c508",
    "anime.bleach": "6a72619b4c19c862fcb4c53b",
}

BATCH = Path(
    __file__).resolve().parents[1] / "output/combo-anime-production-batch-2026-08-20/source-questions.json"


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


def combo_fingerprint(item: dict, scope_runtime_id: str) -> str:
    """Canonical semantic fingerprint for one Combo item, independent of the
    runtime-generated _id, so re-pushing the same authored item is recognised
    in the DB by exact match on metadata.source."""
    canonical = {
        "kind": "combo",
        "scopeId": scope_runtime_id,
        "compatibleChallengeTypeId": COMBO_CT_RUNTIME_ID,
        "prompt": item["prompt"]["ar"],
        "answers": item["answerPayload"]["acceptedAnswers"],
        "stage": item["mechanicPayload"]["comboStage"],
        "reusable": item["isReusableAcrossSessions"],
    }
    raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True)
    return "combo-anime:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def fetch_existing_sources(token: str) -> set:
    """metadata.source values already present for the Anime Combo challenge type."""
    result: set = set()
    code, body = api(
        "GET",
        f"/admin/content-items?worldId={WORLD_RUNTIME_ID}&challengeTypeId={COMBO_CT_RUNTIME_ID}",
        token,
    )
    if code != 200:
        return result
    for it in body.get("data") or []:
        meta = it.get("metadata") if isinstance(it.get("metadata"), dict) else {}
        if meta.get("source"):
            result.add(meta["source"])
    return result


def to_payload(item: dict) -> dict:
    scope_id = SCOPE_RUNTIME_IDS[item["scopeId"]]
    return {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [COMBO_CT_RUNTIME_ID],
        "prompt": {"ar": item["prompt"]["ar"]},
        "answerPayload": item["answerPayload"],
        "mechanicPayload": item["mechanicPayload"],
        "isReusableAcrossSessions": item["isReusableAcrossSessions"],
        "status": item["status"],
        # metadata.source carries the stable fingerprint; the review fields are
        # source-side only and intentionally not sent to the runtime.
        "metadata": {
            "source": None,  # filled per-item below
            "notes": "Approved Anime Combo production batch R1.1 — promoted 2026-08-20",
            "tags": ["combo", "production", "anime"],
        },
    }


def main() -> None:
    dry = "--dry-run" in sys.argv
    skip_existing = "--skip-existing" in sys.argv
    if not BATCH.exists():
        print(f"batch not found: {BATCH}")
        sys.exit(2)

    data = json.loads(BATCH.read_text(encoding="utf-8"))
    if data.get("revision") != "R1.1":
        print(f"unexpected revision: {data.get('revision')} (expected R1.1)")
        sys.exit(2)
    items = data["questions"]

    token = login()
    print("login ok")

    existing = fetch_existing_sources(token) if (dry or skip_existing) else set()
    print(f"existing combo sources in runtime: {len(existing)}")

    stats = {"ok": 0, "fail": 0, "skip": 0, "total": 0}
    for item in items:
        stats["total"] += 1
        iid = item["id"]
        scope_runtime = SCOPE_RUNTIME_IDS.get(item["scopeId"])
        fp = combo_fingerprint(item, scope_runtime)
        if skip_existing and fp in existing:
            stats["skip"] += 1
            print(f"  SKIP {iid} (already present)")
            continue
        payload = to_payload(item)
        payload["metadata"]["source"] = fp
        if dry:
            print(f"  DRY  {iid} scope={item['scopeId']} stage={item['mechanicPayload']['comboStage']} -> NEW")
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
            print(f"  OK   {iid} -> {new_id} (ready)")

    print(f"\n=== RESULT {stats['ok']} ok / {stats['skip']} skip / {stats['fail']} fail / {stats['total']} total ===")
    if dry:
        print("  dry-run preflight: no writes performed")
    sys.exit(1 if stats["fail"] else 0)


if __name__ == "__main__":
    main()