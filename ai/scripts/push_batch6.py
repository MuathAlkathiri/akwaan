import json
import sys
import requests

BASE = "http://localhost:3000"
CATEGORY = "6a4ff130aa3ad4676be4311e"
TOKEN = open("/tmp/akwaan_token").read().strip()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

POINTS = {"easy": 200, "medium": 400, "hard": 600}


def api(method, path, **kwargs):
    r = requests.request(method, BASE + path, headers=HEADERS, timeout=120, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body


def create_json(q, status):
    payload = {
        "categoryId": CATEGORY,
        "category": CATEGORY,
        "question": q["question"],
        "answer": q["answer"],
        "acceptedAnswers": q["acceptedAnswers"],
        "explanation": q["rationale"],
        "difficulty": q["difficulty"],
        "points": POINTS[q["difficulty"]],
        "type": q["mediaType"],
        "status": status,
        "source": "manual",
        "gameMode": "trivia",
        "isFreeGameQuestion": True,
    }
    return payload


def create_image(q, path):
    with open(path, "rb") as f:
        files = {"image": (path.split("/")[-1], f, "image/png")}
        payload = json.dumps(create_json(q, "approved"), ensure_ascii=False)
        r = requests.post(
            BASE + "/questions",
            headers=HEADERS,
            data={"question": payload},
            files=files,
            timeout=120,
        )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]


def upload_media(qid, path, media_type):
    with open(path, "rb") as f:
        mime = "video/mp4" if media_type == "video" else "audio/mpeg"
        r = requests.post(
            BASE + f"/admin/questions/{qid}/audio/upload",
            headers=HEADERS,
            files={"audio": (path.split("/")[-1], f, mime)},
            timeout=120,
        )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]


def main():
    batch = json.load(open("output/naruto_batch6.json"))
    only = sys.argv[1] if len(sys.argv) > 1 else None
    results = []
    for q in batch:
        qid = q["id"]
        if only and q["mediaType"] != only:
            continue
        media = q["mediaType"]
        try:
            if media == "image":
                path = q["mediaSource"]
                code, body = create_image(q, path)
                results.append((qid, "image-create", code, body))
            elif media in ("video", "audio"):
                payload = create_json(q, "draft")
                code, body = api("POST", "/questions", json=payload)
                if code not in (200, 201):
                    results.append((qid, "create", code, body))
                    continue
                new_id = body.get("data", {}).get("_id") or body.get("data", {}).get("id")
                path = q["mediaSource"]
                ucode, ubody = upload_media(new_id, path, media)
                if ucode not in (200, 201):
                    results.append((qid, "upload", ucode, ubody))
                    continue
                acode, abody = api(
                    "PATCH", f"/questions/{new_id}", json={"status": "approved"}
                )
                results.append((qid, "create+upload+approve", acode, abody))
            else:  # text
                payload = create_json(q, "approved")
                code, body = api("POST", "/questions", json=payload)
                results.append((qid, "text-create", code, body))
        except Exception as e:
            results.append((qid, "exception", -1, str(e)))

    ok = 0
    for r in results:
        qid, step, code, body = r
        if code in (200, 201):
            ok += 1
            print(f"Q{qid:>2} OK [{step}]")
        else:
            print(f"Q{qid:>2} FAIL [{step}] {code}: {json.dumps(body, ensure_ascii=False)[:200]}")
    print(f"\n{ok}/{len(batch)} succeeded")


if __name__ == "__main__":
    sys.exit(0 if main() is None or True else 1)
