import json
import sys
import requests

BASE = "http://localhost:3000"
LOGIN = {"email": "admin@test.com", "password": "strongPassword@123"}

WORLD_CUP_SCOPE = "6a70f97cdfbf25db50410672"
TOP_10_CHALLENGE_TYPE = "6a71107b0cfcf2052be32ed7"

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
    cands = inter["candidates"]

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
        "compatibleChallengeTypeIds": [TOP_10_CHALLENGE_TYPE],
        "prompt": {"ar": item["prompt"]["ar"]},
        "answerPayload": {
            "mode": "top_10",
            "options": [
                {"id": c["id"], "label": {"ar": c["label"]}} for c in cands
            ],
        },
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
