import json
import sys
import requests

BASE = "http://localhost:3000"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

WORLD_CUP_SCOPE = "6a70f97cdfbf25db50410672"
TOP_5_CHALLENGE_TYPE = "6a71107b0cfcf2052be32ed7"

PACK = "output/football-top10-poison-development-pack-002.json"


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


def to_backend(item):
    inter = item["interactionPayload"]
    reso = item["resolutionPayload"]
    label_map = {c["id"]: c["label"] for c in inter["candidates"]}
    ordered = sorted(reso["rankedEntries"], key=lambda e: e["rank"])
    entries = [
        {"id": e["candidateId"], "label": label_map[e["candidateId"]], "rank": e["rank"]}
        for e in ordered[:5]
    ] + [
        {"id": e["candidateId"], "label": label_map[e["candidateId"]], "rank": None}
        for e in ordered[5:]
    ]
    compact_ranked = [
        {"candidateId": e["candidateId"], "rank": e["rank"]} for e in reso["rankedEntries"]
    ]
    notes = {
        "mode": item["answerMode"],
        "pattern": item["patternId"],
        "rankingBasis": inter["rankingBasis"],
        "sourceUrl": inter["sourceUrl"],
        "asOfDate": inter["asOfDate"],
        "canonicalScopeId": item["scopeId"],
        "rankedEntries": compact_ranked,
        "decoys": ";".join(reso["decoyCandidateIds"]),
        "revealOrder": reso["revealOrder"],
        "scoringRuleId": reso["scoringRuleId"],
    }
    note_json = json.dumps(notes, ensure_ascii=False, separators=(",", ":"))
    while len(note_json) > 950 and len(notes["rankingBasis"]) > 20:
        notes["rankingBasis"] = notes["rankingBasis"][:-8] + "…"
        note_json = json.dumps(notes, ensure_ascii=False, separators=(",", ":"))
    return {
        "scopeId": WORLD_CUP_SCOPE,
        "compatibleChallengeTypeIds": [TOP_5_CHALLENGE_TYPE],
        "prompt": {"ar": item["prompt"]["ar"]},
        "mechanicPayload": {
            "variant": "keep-or-give",
            "title": inter["title"],
            "instruction": "احتفظ بالبطاقة أو أرسلها لخصمك، ثم اكشفوا الترتيب.",
            "rankingBasis": inter["rankingBasis"],
            "sourceLabel": inter["sourceLabel"],
            "sourceUrl": inter.get("sourceUrl"),
            "asOfDate": inter.get("asOfDate"),
            "entries": entries,
        },
        "answerPayload": {"mode": "top_5"},
        "isReusableAcrossSessions": False,
        "status": "ready",
        "metadata": {"notes": note_json},
    }


def main():
    token = login()
    print("login ok")
    pack = json.load(open(PACK, encoding="utf-8"))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for item in pack["items"]:
        if only and item["id"] != only:
            continue
        payload = to_backend(item)
        code, body = api("POST", "/admin/content-items", token, json=payload)
        if code in (200, 201):
            new_id = (body.get("data") or {}).get("id")
            print(f"{item['id']} OK -> {new_id}")
        else:
            print(f"{item['id']} FAIL {code}: {json.dumps(body, ensure_ascii=False)[:300]}")


if __name__ == "__main__":
    main()
