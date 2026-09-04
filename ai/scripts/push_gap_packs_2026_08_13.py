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

from source_pack_selection import select_forward_items, selection_summary

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
    "series.game-of-thrones": "6a7662cf46f02091be9c96c5",
    "series.breaking-bad": "6a81f2037787a244d05f4933",
    "series.from": "6a81f2037787a244d05f4941",
    "series.series-mix": "6a81f2037787a244d05f494f",
    "puzzles.numbers-arithmetic": "6a7a224b4cfb4a6a8738d66e",
    "puzzles.logic-deduction": "6a7a22674cfb4a6a8738d6a5",
    "puzzles.letters-words": "6a7a229f4cfb4a6a8738d6dd",
    "puzzles.symbols-codes": "6a7a22ab4cfb4a6a8738d716",
    "puzzles.general-knowledge": "6a7a22e44cfb4a6a8738d750",
    "movies.harry-potter": "6a8203877787a244d05f89a0",
    "movies.marvel": "6a8203877787a244d05f89ae",
    "movies.disney-pixar": "6a8203877787a244d05f89bc",
    "movies.movies-mix": "6a8203877787a244d05f89ca",
    "music.saudi-music": "6a8203877787a244d05f89d8",
    "music.gulf-music": "6a8203877787a244d05f89e6",
    "music.arabic-music": "6a8203877787a244d05f89f4",
    "music.international-music": "6a8203877787a244d05f8a02",
    "saudi-arabia.cities-landmarks": "6a8220cf7787a244d06055f4",
    "saudi-arabia.saudi-history": "6a8220cf7787a244d0605602",
    "saudi-arabia.culture-heritage": "6a8220cf7787a244d0605610",
    "saudi-arabia.saudi-today": "6a8220cf7787a244d060561e",
    "world.countries-flags": "6a8220cf7787a244d060562c",
    "world.cities-landmarks": "6a8220cf7787a244d060563a",
    "world.geography": "6a8220cf7787a244d0605648",
    "world.peoples-cultures": "6a8220cf7787a244d0605656",
    "cars.japanese-cars": "6a8313aed1d78cb6e7454b39",
    "cars.german-cars": "6a8313aed1d78cb6e7454b47",
    "cars.supercars": "6a8313aed1d78cb6e7454b55",
    "cars.cars-mix": "6a8313aed1d78cb6e7454b63",
    "sports.formula-1": "6a8313aed1d78cb6e7454b71",
    "sports.ufc": "6a8313aed1d78cb6e7454b7f",
    "sports.wwe": "6a8313aed1d78cb6e7454b8d",
    "sports.nba": "6a8313aed1d78cb6e7454b9b",
    "general-knowledge.science": "6a831d4ad1d78cb6e7463cfc",
    "general-knowledge.history": "6a831d4bd1d78cb6e7463d0a",
    "general-knowledge.inventions-discoveries": "6a831d4bd1d78cb6e7463d18",
    "general-knowledge.human-body-nature": "6a831d4bd1d78cb6e7463d26",
}

CHALLENGE_TYPE_IDS = {
    "one-clue": "6a7b7f81e4ee832e7c085051",
    "distributed-information": "6a7381130ca5379e323e6fe7",
    "read-your-opponent": "6a70eb25a360ae2c4f2dc51c",
    "guess-your-teammate": "6a723f4c7d6c784779ea6bba",
    "top-5": "6a71107b0cfcf2052be32ed7",
}

DEFAULT_PACKS = []  # Historical Wave packs cleaned up; pass explicit pack paths.

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


def _norm_label(label) -> str:
    """Normalise a label that may be a plain string or {ar: ...} to its text."""
    if isinstance(label, dict):
        return str(label.get("ar") or label.get("en") or "")
    return str(label)


def _canonical_fields(item: dict, kind: str) -> dict:
    """Extract a shared semantic fingerprint independent of authoring/runtime shape.

    Both the authored pack (interactionPayload/resolutionPayload) and the runtime
    ContentItem (single answerPayload) reduce to the same canonical dict here, so
    a re-pushed authored item is recognised against the runtime DB by exact match.
    """
    ap = item.get("answerPayload") or {}
    if kind == "read-your-opponent":
        inter = item.get("interactionPayload") or {}
        opts = inter.get("options") or ap.get("options") or []
        if inter and "options" in inter and "correctOptionId" not in inter:
            correct = (item.get("resolutionPayload") or {}).get("correctOptionId")
        else:
            correct = ap.get("correctOptionId")
        return {
            "kind": "ryo",
            "prompt": item["prompt"]["ar"],
            "options": [{"id": o.get("id"), "label": _norm_label(o.get("label"))} for o in opts],
            "correct": correct,
        }
    if kind == "one-clue":
        return {
            "kind": "oc",
            "prompt": item["prompt"]["ar"],
            "answers": ap.get("acceptedAnswers") or [],
            "clues": [
                {"order": c.get("order"), "value": c.get("value"), "text": _norm_label((c.get("text") or {}).get("ar") if isinstance(c.get("text"), dict) else c.get("text"))}
                for c in ((item.get("mechanicPayload") or {}).get("clues") or [])
            ],
        }
    if kind == "distributed-information":
        return {"kind": "di", "prompt": item["prompt"]["ar"], "answer": ap}
    if kind == "top-5":
        return {"kind": "top5", "prompt": item["prompt"]["ar"], "answer": ap, "mechanic": item.get("mechanicPayload")}
    # guess-your-teammate / closest
    res = item.get("resolutionPayload") or {}
    return {
        "kind": "closest",
        "prompt": item["prompt"]["ar"],
        "value": res.get("correctValue", ap.get("correctValue")),
        "tolerance": res.get("acceptedTolerance", ap.get("acceptedTolerance")),
    }


def content_fingerprint(item: dict, kind: str) -> str:
    import hashlib
    canonical = _canonical_fields(item, kind)
    raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def runtime_fingerprint(it: dict) -> str:
    import hashlib
    # Runtime items store challenge-type ObjectIds, not authoring slugs.
    rt_ids = it.get("compatibleChallengeTypeIds") or []
    ct_id = rt_ids[0] if rt_ids else ""
    kind = {
        CHALLENGE_TYPE_IDS["read-your-opponent"]: "read-your-opponent",
        CHALLENGE_TYPE_IDS["one-clue"]: "one-clue",
        CHALLENGE_TYPE_IDS["distributed-information"]: "distributed-information",
        CHALLENGE_TYPE_IDS["top-5"]: "top-5",
        CHALLENGE_TYPE_IDS["guess-your-teammate"]: "guess-your-teammate",
    }.get(str(ct_id), "read-your-opponent")
    canonical = _canonical_fields(it, kind)
    raw = json.dumps(canonical, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def fetch_existing_fingerprints(token: str, scope_id: str) -> set:
    """Return the set of content fingerprints already present in a scope.

    Prefers a persisted `metadata.source` fingerprint when present, otherwise
    recomputes it from the stored payload. Exact match only.
    """
    result: set = set()
    code, body = api("GET", f"/admin/content-items?scopeId={scope_id}", token)
    if code != 200:
        return result
    for it in body.get("data") or []:
        meta = it.get("metadata") if isinstance(it.get("metadata"), dict) else {}
        stored = meta.get("source", "")
        if stored:
            result.add(stored)
        else:
            try:
                result.add(runtime_fingerprint(it))
            except Exception:
                continue
    return result


def to_backend(item: dict, kind: str) -> dict:
    scope_id = SCOPE_IDS[item["scopeId"]]
    ct_id = CHALLENGE_TYPE_IDS[kind]
    payload = {
        "scopeId": scope_id,
        "compatibleChallengeTypeIds": [ct_id],
        "prompt": {"ar": item["prompt"]["ar"]},
        "isReusableAcrossSessions": item["isReusableAcrossSessions"],
        # Carried from the source item, which `select_forward_items` has already
        # proven to be `ready`. Stamping the literal here is what let archived
        # records through as live content.
        "status": item["status"],
        # Stable content fingerprint persisted in the valid `source` metadata
        # field. Enables --skip-existing to recognise re-pushed authored items.
        "metadata": {"source": content_fingerprint(item, kind)},
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
    skip_existing = "--skip-existing" in sys.argv
    packs = args or DEFAULT_PACKS

    token = login()
    print("login ok")

    # Cache of existing fingerprints per runtime scope id.
    existing_by_scope: dict = {}

    def existing_fp(scope_id: str) -> set:
        if scope_id not in existing_by_scope:
            existing_by_scope[scope_id] = fetch_existing_fingerprints(token, scope_id)
        return existing_by_scope[scope_id]

    stats = {"ok": 0, "fail": 0, "skip": 0, "total": 0, "existing": 0, "would_dup": 0,
             "archived_excluded": 0, "draft_excluded": 0}
    for p in packs:
        path = Path(p)
        if not path.is_absolute():
            path = OUT / path
        pack = json.loads(path.read_text(encoding="utf-8"))
        # A final pack keeps replaced records beside their replacements, so the
        # forward set is a subset of `pack["items"]` — never the whole list.
        summary = selection_summary(pack, source=path.name)
        forward_items = select_forward_items(pack, source=path.name)
        stats["archived_excluded"] += summary["archived"]
        stats["draft_excluded"] += summary["draft"]
        print(
            f"\n=== {path.name} ({summary['forward']} forward of {summary['physical']} "
            f"physical; excluded {summary['archived']} archived, {summary['draft']} draft) ==="
        )
        for item in forward_items:
            kind = item_kind(item)
            stats["total"] += 1
            fp = content_fingerprint(item, kind)
            scope_id = SCOPE_IDS.get(item["scopeId"])
            if dry:
                if skip_existing and scope_id and fp in existing_fp(scope_id):
                    stats["would_dup"] += 1
                    print(f"  DRY  {item['id']} scope={item['scopeId']} kind={kind} -> EXISTING (would skip)")
                else:
                    stats["existing"] += 1
                    print(f"  DRY  {item['id']} scope={item['scopeId']} kind={kind} -> NEW")
                continue
            if skip_existing and scope_id and fp in existing_fp(scope_id):
                stats["skip"] += 1
                print(f"  SKIP {item['id']} scope={item['scopeId']} kind={kind} (already present)")
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
    print(f"  forward-selected={stats['total']}  archived-excluded={stats['archived_excluded']}"
          f"  draft-excluded={stats['draft_excluded']}")
    if dry:
        print(f"  dry-run preflight: would-insert={stats['existing']} would-skip(existing)={stats['would_dup']}")


if __name__ == "__main__":
    main()