import json
import glob
import os

history_path = "ai/.opencode/authoring-concept-history.json"
if os.path.exists(history_path):
    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)
else:
    history = {"concepts": []}

# Deduplicate based on subject + sourceArtifact + itemId
seen_signatures = set()
for c in history["concepts"]:
    subj = c.get("conceptKey", {}).get("subject")
    src = c.get("sourceArtifact")
    iid = c.get("itemId")
    if subj:
        seen_signatures.add((subj, src, iid))

def add_seen(subject, source, item_id):
    sig = (subject, source, item_id)
    if subject and sig not in seen_signatures:
        history["concepts"].append({
            "worldKey": "video-games",
            "scopeKey": "unknown",
            "conceptKey": {"subject": subject},
            "humanProductStatus": "SEEN",
            "reusePolicy": "DO_NOT_REGENERATE",
            "sourceArtifact": source,
            "itemId": item_id
        })
        seen_signatures.add(sig)

# Scan recent batches first for structured conceptKey
for file in glob.glob("ai/workbench/artifacts/*.source.json") + glob.glob("ai/scripts/data/*.source.json"):
    try:
        with open(file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for item in (data if isinstance(data, list) else [data]):
            subj = item.get("metadata", {}).get("conceptKey", {}).get("subject")
            item_id = item.get("id", "unknown")
            if subj:
                add_seen(subj, os.path.basename(file), item_id)
    except Exception:
        pass

# Legacy fallbacks explicitly noted
add_seen("genji-dragonblade-ultimate-voiceline", "legacy-seen-inference", "legacy-genji-01")

with open(history_path, "w", encoding="utf-8") as f:
    json.dump(history, f, indent=2, ensure_ascii=False)

print(f"Indexed SEEN concepts. Total concepts in history: {len(history['concepts'])}")
