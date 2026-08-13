#!/usr/bin/env python3
"""Replace the three malformed Top 10 items with native Poison Deck items.

The script uses the admin HTTP API so DTO validation, domain policy, service,
repository, and schema behavior are exercised exactly like the admin UI.
It is dry-run by default and refuses to delete anything unless the three exact
legacy prompts are present and all three still lack a native mechanicPayload.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


INSTRUCTION = "احتفظ بالبطاقة أو أرسلها لخصمك، ثم اكشفوا الترتيب."
SOURCE_LABEL = "worldfootball.net — All-time table"


ITEMS: list[dict[str, Any]] = [
    {
        "scopeName": "كأس العالم",
        "prompt": "أيٌّ من هذه المنتخبات يقع ضمن المراكز العشرة الأولى في الترتيب التاريخي العام لكأس العالم بالاعتماد على مجموع النقاط (3 للفوز و1 للتعادل) عبر جميع النهائيات حتى نهاية نسخة 2026؟",
        "title": "الترتيب التاريخي لكأس العالم بالنقاط",
        "rankingBasis": "مجموع النقاط في الترتيب التاريخي العام لجميع نهائيات كأس العالم (3 نقاط للفوز و1 للتعادل) حتى نهاية نسخة 2026.",
        "sourceUrl": "https://www.worldfootball.net/competition/co139/fifa-world-cup/records-all-time-table/",
        "asOfDate": "2026-07-19",
        "candidates": [
            ("wc-pts-bra", "البرازيل"),
            ("wc-pts-ger", "ألمانيا"),
            ("wc-pts-arg", "الأرجنتين"),
            ("wc-pts-ita", "إيطاليا"),
            ("wc-pts-fra", "فرنسا"),
            ("wc-pts-eng", "إنجلترا"),
            ("wc-pts-esp", "إسبانيا"),
            ("wc-pts-ned", "هولندا"),
            ("wc-pts-uru", "أوروغواي"),
            ("wc-pts-bel", "بلجيكا"),
            ("wc-pts-mex", "المكسيك"),
            ("wc-pts-swe", "السويد"),
            ("wc-pts-por", "البرتغال"),
            ("wc-pts-sui", "سويسرا"),
        ],
    },
    {
        "scopeName": "كأس العالم",
        "prompt": "أيٌّ من هذه المنتخبات يقع ضمن المراكز العشرة الأولى من حيث عدد الأهداف التي سجّلها في جميع نهائيات كأس العالم حتى نهاية نسخة 2026؟",
        "title": "أكثر منتخبات كأس العالم تسجيلًا للأهداف",
        "rankingBasis": "عدد الأهداف المسجّلة (Goals For) في الترتيب التاريخي العام لجميع نهائيات كأس العالم حتى نهاية نسخة 2026.",
        "sourceUrl": "https://www.worldfootball.net/competition/co139/fifa-world-cup/records-all-time-table/",
        "asOfDate": "2026-07-19",
        "candidates": [
            ("wc-gol-bra", "البرازيل"),
            ("wc-gol-ger", "ألمانيا"),
            ("wc-gol-arg", "الأرجنتين"),
            ("wc-gol-fra", "فرنسا"),
            ("wc-gol-ita", "إيطاليا"),
            ("wc-gol-eng", "إنجلترا"),
            ("wc-gol-esp", "إسبانيا"),
            ("wc-gol-ned", "هولندا"),
            ("wc-gol-uru", "أوروغواي"),
            ("wc-gol-swe", "السويد"),
            ("wc-gol-bel", "بلجيكا"),
            ("wc-gol-mex", "المكسيك"),
            ("wc-gol-por", "البرتغال"),
            ("wc-gol-sui", "سويسرا"),
        ],
    },
    {
        "scopeName": "ابطال اوروبا",
        "prompt": "أيٌّ من هذه الأندية يقع ضمن المراكز العشرة الأولى في الترتيب التاريخي العام لدوري أبطال أوروبا بالاعتماد على مجموع النقاط (3 للفوز و1 للتعادل) عبر جميع المواسم حتى نهاية موسم 2025/26؟",
        "title": "الترتيب التاريخي لدوري أبطال أوروبا بالنقاط",
        "rankingBasis": "مجموع النقاط في الترتيب التاريخي العام لمسابقة كأس الأندية الأوروبية/دوري أبطال أوروبا (3 نقاط للفوز و1 للتعادل) عبر المواسم حتى نهاية موسم 2025/26.",
        "sourceUrl": "https://www.worldfootball.net/competition/co19/uefa-champions-league/records-all-time-table/",
        "asOfDate": "2026-06-01",
        "candidates": [
            ("cl-pts-rma", "ريال مدريد"),
            ("cl-pts-bay", "بايرن ميونخ"),
            ("cl-pts-bar", "برشلونة"),
            ("cl-pts-juv", "يوفنتوس"),
            ("cl-pts-mun", "مانشستر يونايتد"),
            ("cl-pts-liv", "ليفربول"),
            ("cl-pts-mil", "ميلان"),
            ("cl-pts-ben", "بنفيكا"),
            ("cl-pts-por", "بورتو"),
            ("cl-pts-int", "إنتر"),
            ("cl-pts-ars", "آرسنال"),
            ("cl-pts-che", "تشيلسي"),
            ("cl-pts-aja", "أياكس"),
            ("cl-pts-psg", "باريس سان جيرمان"),
        ],
    },
]


def load_env(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"Environment file does not exist: {path}")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class AdminApi:
    def __init__(self, base_url: str, token: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, body: Any | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed ({error.code}): {detail}") from error
        return payload.get("data", payload)


def login(api: AdminApi) -> None:
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD are required")
    response = api.request("POST", "/auth/login", {"email": email, "password": password})
    token = response.get("accessToken")
    if not token:
        raise RuntimeError("Admin login returned no access token")
    api.token = token


def mechanic_payload(item: dict[str, Any]) -> dict[str, Any]:
    candidates = [{"id": candidate_id, "label": label} for candidate_id, label in item["candidates"]]
    return {
        "variant": "poison-deck",
        "title": item["title"],
        "instruction": INSTRUCTION,
        "rankingBasis": item["rankingBasis"],
        "sourceLabel": SOURCE_LABEL,
        "sourceUrl": item["sourceUrl"],
        "asOfDate": item["asOfDate"],
        "candidates": candidates,
        "rankedAnswer": [
            {"candidateId": candidate["id"], "rank": index + 1}
            for index, candidate in enumerate(candidates[:10])
        ],
        "decoyCandidateIds": [candidate["id"] for candidate in candidates[10:]],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Delete and recreate the three records")
    parser.add_argument("--api-base", default="http://localhost:3000")
    parser.add_argument(
        "--env-file",
        type=Path,
        default=Path(__file__).resolve().parent / "backend" / ".env",
    )
    args = parser.parse_args()

    load_env(args.env_file)
    api = AdminApi(args.api_base)
    login(api)

    worlds = api.request("GET", "/admin/worlds")
    prompts = {item["prompt"] for item in ITEMS}
    matches: list[dict[str, Any]] = []
    matching_world_id: str | None = None
    for world in worlds:
        content = api.request("GET", f"/admin/content-items?worldId={world['id']}")
        world_matches = [item for item in content if item.get("prompt", {}).get("ar") in prompts]
        if world_matches:
            if matching_world_id and matching_world_id != world["id"]:
                raise RuntimeError("Target prompts are spread across multiple Worlds")
            matching_world_id = world["id"]
            matches.extend(world_matches)

    if len(matches) == 3 and all(
        (item.get("mechanicPayload") or {}).get("variant") == "poison-deck"
        for item in matches
    ):
        print("The three Top 10 records are already native Poison Deck items.")
        return 0
    if len(matches) != 3 or not all(
        item.get("mechanicPayload") is None
        and (item.get("answerPayload") or {}).get("mode") == "top_10"
        for item in matches
    ):
        raise RuntimeError(
            "Safety check failed: expected exactly three Top 10 targets with no mechanicPayload"
        )
    if not matching_world_id:
        raise RuntimeError("Could not resolve the targets' World")

    scopes = api.request("GET", f"/admin/worlds/{matching_world_id}/scopes")
    scope_by_name = {scope["name"]: scope["id"] for scope in scopes}
    required_scopes = {item["scopeName"] for item in ITEMS}
    missing_scopes = required_scopes.difference(scope_by_name)
    if missing_scopes:
        raise RuntimeError(f"Missing required Scope(s): {sorted(missing_scopes)}")

    top10_types = [
        challenge
        for challenge in api.request("GET", "/admin/challenge-types")
        if challenge.get("slug") == "top-10"
    ]
    if len(top10_types) != 1:
        raise RuntimeError(f"Expected one canonical top-10 ChallengeType, found {len(top10_types)}")
    top10_id = top10_types[0]["id"]

    print("Targets:")
    for target in matches:
        print(f"  {target['id']}  {target['prompt']['ar']}")
    if not args.apply:
        print("Dry run only. Re-run with --apply to replace these exact three records.")
        return 0

    for target in matches:
        api.request("DELETE", f"/admin/content-items/{target['id']}")

    created: list[dict[str, Any]] = []
    for item in ITEMS:
        created_item = api.request(
            "POST",
            "/admin/content-items",
            {
                "scopeId": scope_by_name[item["scopeName"]],
                "prompt": {"ar": item["prompt"]},
                "compatibleChallengeTypeIds": [top10_id],
                "answerPayload": {"mode": "top_10"},
                "mechanicPayload": mechanic_payload(item),
                "isReusableAcrossSessions": False,
                "status": "ready",
            },
        )
        created.append(created_item)

    required_keys = {
        "variant",
        "title",
        "instruction",
        "rankingBasis",
        "sourceLabel",
        "sourceUrl",
        "asOfDate",
        "candidates",
        "rankedAnswer",
        "decoyCandidateIds",
    }
    for item in created:
        payload = item.get("mechanicPayload") or {}
        if payload.get("variant") != "poison-deck" or not required_keys.issubset(payload):
            raise RuntimeError(f"Created item {item.get('id')} did not return the native payload")
    print("Created native Poison Deck items:")
    for item in created:
        print(f"  {item['id']}  {item['prompt']['ar']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, urllib.error.URLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
