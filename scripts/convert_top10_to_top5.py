#!/usr/bin/env python3
"""Convert retired Top-10 poison-deck packs to the canonical Top 5 contract.

Follows the production migrate-top10-to-top5 semantics: ranks 1-5 stay ranked
with ranks 1-5, ranks 6-10 become traps (rank null), authored decoys are
dropped, and the variant becomes keep-or-give with the canonical ten-card
runtime contract (teamCount 2, turnCount 10, 15s turns, keep/give actions).

Usage:
    convert_top10_to_top5.py <pack.json> [pack.json ...]

Each converted pack is written beside its source as <stem>.top5.json. Items
already in the canonical Top 5 shape pass through unchanged.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

KEEP_GIVE = {
    "variant": "keep-or-give",
    "teamCount": 2,
    "turnCount": 10,
    "turnDeadlineSeconds": 15,
    "actions": ["keep", "give"],
    "timeoutAction": "keep",
}


def conversion_note(legacy_pack: Path) -> str:
    return (
        f"Converted from legacy pack {legacy_pack.name} following "
        "migrate-top10-to-top5 semantics: ranks 1-5 stayed ranked, ranks 6-10 "
        "became traps, authored decoys were dropped."
    )


def trap_review(entries: list[dict]) -> list[dict]:
    ranked = [e for e in entries if e.get("rank") is not None]
    traps = [e for e in entries if e.get("rank") is None]
    boundary = next((e["sourceValue"] for e in ranked if e["rank"] == 5), None)
    review = []
    for trap in traps:
        value = trap.get("sourceValue")
        dist = None if value is None or boundary is None else boundary - value
        if dist is None or dist >= 100:
            plaus_ar = (f"{trap['label']} نادٍ معروف لكنّ رصيده التاريخي في الترتيب الكلّي بعيد "
                        f"عن حافة المركز الخامس؛ قرار حفظه أو إرساله غامض.")
        elif dist >= 20:
            plaus_ar = (f"{trap['label']} اسم مألوف وجدير بأي قائمة، لكنه خارج الخمسة بفارق {dist} "
                        f"فقط؛ ظهوره بين الكبار مقنع في ذهن لاعب لا يحفظ الأرقام.")
        else:
            plaus_ar = (f"{trap['label']} على بُعد {dist} فقط من حافة المركز الخامس، ما يجعله "
                        f"الخداع الأكثر إغراءً.")
        review.append({
            "candidateId": trap["id"],
            "cutoffDistance": dist if dist is not None else 1,
            "plausibility": plaus_ar,
            "tooEasy": False,
        })
    return review


def convert_item(item: dict, legacy_pack: Path) -> dict:
    inter = item.get("interactionPayload", {})
    reso = item.get("resolutionPayload", {})
    if inter.get("entries"):
        return item

    label_map = {c["id"]: c["label"] for c in inter.get("candidates", [])}
    value_map = {c["id"]: c.get("sourceValue") for c in inter.get("candidates", [])}
    ordered = sorted(reso.get("rankedEntries", []), key=lambda e: e["rank"])
    entries = []
    for e in ordered[:5]:
        entries.append({
            "id": e["candidateId"],
            "label": label_map.get(e["candidateId"], e["candidateId"]),
            "sourceValue": value_map.get(e["candidateId"]),
            "rank": e["rank"],
        })
    for e in ordered[5:]:
        entries.append({
            "id": e["candidateId"],
            "label": label_map.get(e["candidateId"], e["candidateId"]),
            "sourceValue": value_map.get(e["candidateId"]),
            "rank": None,
        })

    prompt_ar = item.get("prompt", {}).get("ar", "")
    prompt_en = item.get("prompt", {}).get("en", "")
    prompt_ar = prompt_ar.replace("المراكز العشرة الأولى", "المراكز الخمسة الأولى")
    prompt_en = prompt_en.replace("top ten", "top five")

    title = inter.get("title", "")
    title = title.replace("أفضل 10", "أفضل 5")

    metadata = dict(item.get("metadata", {}))
    metadata.pop("decoyReview", None)
    metadata["validationStatus"] = "draft"
    metadata["trapReview"] = trap_review(entries)
    metadata["explanation"] = (metadata.get("explanation") or "") + " " + conversion_note(legacy_pack)

    converted = {
        "id": item["id"],
        "scopeId": item["scopeId"],
        "compatibleChallengeTypeIds": ["top-5"],
        "patternId": "keep-or-give",
        "prompt": {"ar": prompt_ar, "en": prompt_en},
        "answerMode": "top_5",
        "interactionPayload": {
            "variant": KEEP_GIVE["variant"],
            "title": title,
            "rankingBasis": inter.get("rankingBasis", ""),
            "sourceLabel": inter.get("sourceLabel", ""),
            "sourceUrl": inter.get("sourceUrl", ""),
            "asOfDate": inter.get("asOfDate", ""),
            "entries": entries,
            "teamCount": KEEP_GIVE["teamCount"],
            "turnCount": KEEP_GIVE["turnCount"],
            "turnDeadlineSeconds": KEEP_GIVE["turnDeadlineSeconds"],
            "actions": list(KEEP_GIVE["actions"]),
            "timeoutAction": KEEP_GIVE["timeoutAction"],
        },
        "resolutionPayload": {
            "scoringRuleId": "top-5.result",
            "winnerScoreEventType": "top-5.win",
            "tieScoreEventType": None,
            "runtimeEventTypes": ["top5-card-decided", "top5-completed"],
        },
        "media": item.get("media"),
        "isReusableAcrossSessions": item.get("isReusableAcrossSessions", False),
        "metadata": metadata,
    }
    if inter.get("explanation"):
        converted["interactionPayload"]["explanation"] = inter["explanation"]
    if inter.get("tiebreaker"):
        converted["interactionPayload"]["tiebreaker"] = inter["tiebreaker"]
    return converted


def convert_pack(path: Path) -> int:
    pack = json.loads(path.read_text(encoding="utf-8"))
    packs_written = 0
    if isinstance(pack.get("items"), list):
        pack["items"] = [convert_item(item, path) for item in pack["items"]]
        pack["challengeType"] = "top-5"
        pack["patternId"] = "keep-or-give"
        out = path.with_name(path.stem + ".top5.json")
        out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        packs_written += 1
        print(f"WROTE {out.name} ({len(pack['items'])} items)")
    elif isinstance(pack.get("contentItemBatches"), list):
        for batch in pack["contentItemBatches"]:
            batch["contentItems"] = [convert_item(item, path) for item in batch.get("contentItems", [])]
            batch["challengeType"] = "top-5"
            batch["patternId"] = "keep-or-give"
        out = path.with_name(path.stem + ".top5.json")
        out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        packs_written += 1
        print(f"WROTE {out.name} ({sum(len(b.get('contentItems', [])) for b in pack['contentItemBatches'])} items)")
    else:
        print(f"SKIP {path.name}: no recognized item container")
    return packs_written


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: convert_top10_to_top5.py <pack.json> [...]", file=sys.stderr)
        return 2
    total = 0
    for raw in argv:
        total += convert_pack(Path(raw))
    print(f"converted {total} pack(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
