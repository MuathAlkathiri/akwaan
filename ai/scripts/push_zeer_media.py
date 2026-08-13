import json
import requests

BASE = "http://localhost:3000"
CATEGORY = "6a6bba53cd32ac388851fd77"
TOKEN = open("/tmp/lammah_token").read().strip()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

POINTS = {"easy": 200, "medium": 400, "hard": 600}
MIME = {"image": "image/jpeg", "video": "video/mp4", "audio": "audio/mpeg"}


def api(method, path, **kwargs):
    r = requests.request(method, BASE + path, headers=HEADERS, timeout=300, **kwargs)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]


def payload(q):
    return {
        "categoryId": CATEGORY,
        "category": CATEGORY,
        "question": q["question"],
        "answer": q["answer"],
        "acceptedAnswers": q["acceptedAnswers"],
        "explanation": q["rationale"],
        "difficulty": q["difficulty"],
        "points": POINTS[q["difficulty"]],
        "type": q["mediaType"],
        "status": "approved",
        "source": "manual",
        "gameMode": "trivia",
        "isFreeGameQuestion": True,
    }


def create_image(q, path):
    with open(path, "rb") as f:
        files = {"image": (path.split("/")[-1], f, MIME["image"])}
        r = requests.post(
            BASE + "/questions",
            headers=HEADERS,
            data={"question": json.dumps(payload(q), ensure_ascii=False)},
            files=files,
            timeout=300,
        )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]


def create_then_upload(q, path):
    code, body = api("POST", "/questions", json=payload(q))
    if code not in (200, 201):
        return ("create", code, body)
    new_id = (body.get("data") or {}).get("_id") or (body.get("data") or {}).get("id")
    if not new_id:
        return ("create", code, body)
    with open(path, "rb") as f:
        ucode, ubody = None, None
        try:
            r = requests.post(
                BASE + f"/admin/questions/{new_id}/audio/upload",
                headers=HEADERS,
                files={"audio": (path.split("/")[-1], f, MIME[q["mediaType"]])},
                timeout=300,
            )
            ucode, ubody = r.status_code, r.json()
        except Exception as e:
            return ("upload-exc", -1, str(e))
    if ucode not in (200, 201):
        return ("upload", ucode, ubody)
    acode, abody = api("PATCH", f"/questions/{new_id}", json={"status": "approved"})
    return ("create+upload+approve", acode, abody)


def main():
    batch = json.load(open("output/zeer_batch2.json"))
    ok = 0
    for q in batch:
        path = q["mediaSource"]
        if q["mediaType"] == "image":
            step, code, body = "image-create", *create_image(q, path)
        else:
            step, code, body = create_then_upload(q, path)
        if code in (200, 201):
            ok += 1
            print(f"Q{q['id']:>2} OK [{step}]")
        else:
            print(
                f"Q{q['id']:>2} FAIL [{step}] {code}: "
                f"{json.dumps(body, ensure_ascii=False)[:300]}"
            )
    print(f"\n{ok}/{len(batch)} succeeded")


if __name__ == "__main__":
    main()
