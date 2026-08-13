import json
import requests

BASE = "http://localhost:3000"
CATEGORY = "6a6bba53cd32ac388851fd77"
TOKEN = open("/tmp/lammah_token").read().strip()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

POINTS = {"easy": 200, "medium": 400, "hard": 600}


def api(method, path, **kwargs):
    r = requests.request(method, BASE + path, headers=HEADERS, timeout=120, **kwargs)
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body


def main():
    batch = json.load(open("output/zeer_batch1.json"))
    results = []
    for q in batch:
        payload = {
            "categoryId": CATEGORY,
            "category": CATEGORY,
            "question": q["question"],
            "answer": q["answer"],
            "acceptedAnswers": q["acceptedAnswers"],
            "explanation": q["rationale"],
            "difficulty": q["difficulty"],
            "points": POINTS[q["difficulty"]],
            "type": "text",
            "status": "approved",
            "source": "manual",
            "gameMode": "trivia",
            "isFreeGameQuestion": True,
        }
        try:
            code, body = api("POST", "/questions", json=payload)
            results.append((q["id"], code, body))
        except Exception as e:
            results.append((q["id"], -1, str(e)))

    ok = 0
    for qid, code, body in results:
        if code in (200, 201):
            ok += 1
            print(f"Q{qid:>2} OK")
        else:
            print(f"Q{qid:>2} FAIL {code}: {json.dumps(body, ensure_ascii=False)[:200]}")
    print(f"\n{ok}/{len(batch)} succeeded")


if __name__ == "__main__":
    main()
