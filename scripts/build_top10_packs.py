#!/usr/bin/env python3
"""Build the three missing Top-10 poison-deck development packs for the
Football World: Saudi Pro League, Premier League (1992-era), Champions League.

Each pack holds exactly 3 ContentItems. Every item uses the canonical
poison-deck shape (14 candidates / 10 unique ranks / 4 decoys = positions
11-14 in the source table), the dedicated top-10 patterns schema, Arabic
bilingual prompts, non-reusable, and metadata.validationStatus "draft".
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output"
GENERATED = "2026-08-05"

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
# Each deck: (deck key, scope, item_base_id, list of (scope-suffix, label_ar,
# value), decoy (scope-suffix, value), cutoff distances, meta)  -> we build
# per-scope generators below because labels/suffixes differ.

# ---- SAUDI PRO LEAGUE (worldfootball co1169, as-of 2026/27 start) ---------
SA_PREFIX = "sa"
SA_SCOPE = "football.saudi-league"
SA_URL = "https://www.worldfootball.net/competition/co1169/saudi-arabia-saudi-pro-league/records-all-time-table/"
SA_LABEL = "worldfootball.net — الترتيب التاريخي العام لدوري المحترفين السعودي"
SA_ASOF = "2026-08-05"

SA_TEAMS = {
    "hilal": "الهلال",
    "nassr": "النصر",
    "ittihad": "الاتحاد",
    "ahli": "الأهلي",
    "shabab": "الشباب",
    "ettifaq": "الاتفاق",
    "fateh": "الفتح",
    "taawoun": "التعاون",
    "raed": "الرائد",
    "wehda": "الوحدة",
    "faisaly": "الفيصلي",
    "qadsiah": "القادسية",
    "fayha": "الفيحاء",
    "damac": "ضمك",
}

# (top10 [(team, value)], decoys [(team, value)], basis_ar_tail, basis_en,
#  prompt_tail_ar, prompt_tail_en, cutoff_map)
SA_PTS = {
    "top": ["hilal", "nassr", "ittihad", "ahli", "shabab", "ettifaq", "fateh", "taawoun", "raed", "wehda"],
    "topvals": [1264, 1062, 998, 933, 911, 671, 632, 630, 511, 441],
    "decoys": ["faisaly", "qadsiah", "fayha", "damac"],
    "decvals": [421, 382, 284, 256],
    "rank_en": "total points (3 for a win, 1 for a draw)",
    "rank_ar": "مجموع النقاط",
    "cutoff": {"faisaly": 20, "qadsiah": 59, "fayha": 157, "damac": 185},
    "prompt_ar": "من حيث مجموع النقاط (3 للفوز و1 للتعادل) في الترتيب التاريخي العام للدوري عبر جميع المواسم؟",
    "prompt_en": "by total points (3 for a win, 1 for a draw) in the all-time league standings across all seasons?",
}
SA_GOALS = {
    "top": ["hilal", "nassr", "ittihad", "ahli", "shabab", "fateh", "ettifaq", "taawoun", "raed", "wehda"],
    "topvals": [1210, 1071, 1017, 963, 881, 679, 674, 670, 580, 514],
    "decoys": ["faisaly", "qadsiah", "fayha", "damac"],
    "decvals": [451, 427, 270, 264],
    "rank_en": "goals scored (goals for)",
    "rank_ar": "عدد الأهداف المسجّلة",
    "cutoff": {"faisaly": 63, "qadsiah": 87, "fayha": 244, "damac": 250},
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها عبر جميع مواسم الدوري حتى بداية موسم 2026/27؟",
    "prompt_en": "by the number of goals it has scored across all league seasons through 2026/27?",
}
SA_WINS = {
    "top": ["hilal", "nassr", "ittihad", "ahli", "shabab", "ettifaq", "fateh", "taawoun", "raed", "wehda"],
    "topvals": [385, 314, 290, 269, 256, 181, 169, 167, 134, 122],
    "decoys": ["faisaly", "qadsiah", "fayha", "damac"],
    "decvals": [107, 98, 70, 64],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "cutoff": {"faisaly": 15, "qadsiah": 24, "fayha": 52, "damac": 58},
    "prompt_ar": "من حيث عدد المباريات التي فاز بها عبر جميع مواسم الدوري حتى بداية موسم 2026/27؟",
    "prompt_en": "by the number of matches it has won across all league seasons through 2026/27?",
}

# ---- PREMIER LEAGUE (1992-era only; Wikipedia all-time PL table, 2025-26) ---
PL_PREFIX = "pl"
PL_SCOPE = "football.premier-league"
PL_URL = "https://en.wikipedia.org/wiki/Premier_League_records_and_statistics"
PL_LABEL = "Wikipedia — الترتيب التاريخي العام للدوري الإنجليزي الممتاز (منذ 1992)"
PL_ASOF = "2026-05-24"

PL_TEAMS = {
    "mun": "مانشستر يونايتد",
    "ars": "آرسنال",
    "liv": "ليفربول",
    "che": "تشيلسي",
    "tot": "توتنهام",
    "mci": "مانشستر سيتي",
    "eve": "إيفرتون",
    "new": "نيوكاسل",
    "avl": "أستون فيلا",
    "whu": "وست هام",
    "sou": "ساوثهامبتون",
    "bla": "بلاكبيرن",
    "lee": "ليدز",
    "lei": "ليستر",
}
PL_PTS = {
    "top": ["mun", "ars", "liv", "che", "tot", "mci", "eve", "new", "avl", "whu"],
    "topvals": [2614, 2473, 2402, 2366, 1992, 1958, 1747, 1656, 1618, 1393],
    "decoys": ["sou", "bla", "lee", "lei"],
    "decvals": [1100, 970, 867, 846],
    "rank_en": "total points",
    "rank_ar": "مجموع النقاط",
    "cutoff": {"sou": 293, "bla": 423, "lee": 526, "lei": 547},
    "prompt_ar": "من حيث مجموع النقاط في الترتيب التاريخي العام للدوري الإنجليزي الممتاز منذ تأسيسه عام 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by total points in the Premier League all-time table since it began in 1992, through the 2025/26 season?",
}
PL_GOALS = {
    "top": ["mun", "ars", "liv", "che", "tot", "mci", "eve", "new", "avl", "whu"],
    "topvals": [2413, 2336, 2331, 2210, 2000, 1997, 1654, 1651, 1506, 1429],
    "decoys": ["sou", "bla", "lei", "lee"],
    "decvals": [1140, 927, 904, 842],
    "rank_en": "goals scored",
    "rank_ar": "عدد الأهداف المسجّلة",
    "cutoff": {"sou": 289, "bla": 502, "lei": 525, "lee": 587},
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها في الدوري الإنجليزي الممتاز منذ 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of goals it has scored in the Premier League since 1992, through the 2025/26 season?",
}
PL_WINS = {
    "top": ["mun", "ars", "liv", "che", "mci", "tot", "eve", "new", "avl", "whu"],
    "topvals": [775, 719, 694, 681, 573, 561, 463, 453, 430, 381],
    "decoys": ["sou", "bla", "lee", "lei"],
    "decvals": [282, 262, 234, 224],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "cutoff": {"sou": 99, "bla": 119, "lee": 147, "lei": 157},
    "prompt_ar": "من حيث عدد المباريات التي فاز بها في الدوري الإنجليزي الممتاز منذ 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has won in the Premier League since 1992, through the 2025/26 season?",
}

# ---- CHAMPIONS LEAGUE (worldfootball co19 all-time table, 2025/26) --------
# Note: cl-alltime-points already exists in pack-002; use goals / wins / apps.
CL_PREFIX = "cl"
CL_SCOPE = "football.champions-league"
CL_URL = "https://www.worldfootball.net/competition/co19/uefa-champions-league/records-all-time-table/"
CL_LABEL = "worldfootball.net — الترتيب التاريخي العام لدوري أبطال أوروبا"
CL_ASOF = "2026-06-01"

CL_TEAMS = {
    "rma": "ريال مدريد",
    "bay": "بايرن ميونخ",
    "bar": "برشلونة",
    "juv": "يوفنتوس",
    "mun": "مانشستر يونايتد",
    "liv": "ليفربول",
    "mil": "ميلان",
    "ben": "بنفيكا",
    "por": "بورتو",
    "ars": "آرسنال",
    "int": "إنتر",
    "che": "تشيلسي",
    "aja": "أياكس",
    "dor": "دورتموند",
    "psg": "باريس سان جيرمان",
}
CL_GOALS = {
    "top": ["rma", "bay", "bar", "mun", "juv", "liv", "ben", "mil", "por", "ars"],
    "topvals": [1132, 885, 745, 520, 499, 474, 465, 442, 387, 382],
    "decoys": ["psg", "che", "aja", "dor"],
    "decvals": [375, 353, 352, 347],
    "rank_en": "goals scored",
    "rank_ar": "عدد الأهداف المسجّلة",
    "cutoff": {"psg": 7, "che": 29, "aja": 30, "dor": 35},
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of goals it has scored across all Champions League seasons through 2025/26?",
}
CL_WINS = {
    "top": ["rma", "bay", "bar", "juv", "mun", "liv", "mil", "ben", "por", "ars"],
    "topvals": [309, 250, 212, 159, 153, 143, 132, 124, 120, 113],
    "decoys": ["int", "che", "aja", "psg"],
    "decvals": [112, 106, 102, 100],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "cutoff": {"int": 1, "che": 7, "aja": 11, "psg": 13},
    "prompt_ar": "من حيث عدد المباريات التي فاز بها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has won across all Champions League seasons through 2025/26?",
}
CL_APPS = {
    "top": ["rma", "bay", "bar", "juv", "mun", "ben", "mil", "por", "liv", "int"],
    "topvals": [515, 416, 367, 317, 289, 288, 275, 265, 252, 228],
    "decoys": ["ars", "aja", "che", "dor"],
    "decvals": [226, 223, 207, 201],
    "rank_en": "matches played",
    "rank_ar": "عدد المباريات التي لعبها",
    "cutoff": {"ars": 2, "aja": 5, "che": 21, "dor": 27},
    "prompt_ar": "من حيث عدد المباريات التي خاضها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has played across all Champions League seasons through 2025/26?",
}


def build_deck(prefix, scope, teams, url, label, asof, deck, suffix, season_ar):
    """deck is a dict with top/topvals/decoys/decvals/rank_en/rank_ar/cutoff/prompt_*."""
    item_id = f"{prefix}-alltime-{suffix}"
    candidates = []
    for code, val in zip(deck["top"], deck["topvals"]):
        candidates.append({"id": f"{item_id}-{code}", "label": teams[code], "sourceValue": val})
    for code, val in zip(deck["decoys"], deck["decvals"]):
        candidates.append({"id": f"{item_id}-{code}", "label": teams[code], "sourceValue": val})
    ranked = [{"candidateId": f"{item_id}-{code}", "rank": i + 1}
              for i, code in enumerate(deck["top"])]
    decoy_ids = [f"{item_id}-{code}" for code in deck["decoys"]]
    season_phrase_ar = f"حتى نهاية موسم {season_ar}"
    season_phrase_en = f"through the {season_ar} season"

    decoy_review = []
    for code in deck["decoys"]:
        lbl = teams[code]
        cdist = deck["cutoff"][code]
        if cdist >= 100:
            plaus_ar = (f"{lbl} نادٍ معروف لكنّ رصيده التاريخي في الترتيب الكلّي بعيد (بفارق "
                        f"{cdist}) عن حافة المركز العاشر؛ جهل أغلب الجمهور بأرقامه الدقيقة "
                        f"يجعل قرارَ حفظه أو دسّه غامضاً.")
        elif cdist >= 20:
            plaus_ar = (f"{lbl} اسم مألوف وجدير بأي قائمة، لكنه خارج العشرة بفارق {cdist} فقط؛ "
                        f"هذا التباعد المتوسط يبقي ظهوره بين الكبار مقنعاً في ذهن لاعب لا يحفظ الأرقام.")
        else:
            plaus_ar = (f"{lbl} على بُعد {cdist} فقط من حافة المركز العاشر، ما يجعله الخداع الأكثر "
                        f"إغراءً — كثير من اللاعبين سيحفظونه خطأً بثقته العالية.")
        decoy_review.append({
            "candidateId": f"{item_id}-{code}",
            "cutoffDistance": cdist,
            "plausibility": plaus_ar,
            "tooEasy": False,
        })

    item = {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["top-10"],
        "patternId": "poison-deck",
        "prompt": {
            "ar": f"أيٌّ من هذه الأندية يقع ضمن المراكز العشرة الأولى {deck['prompt_ar']}",
            "en": f"Which of these clubs belongs within the top ten of the all-time table {deck['prompt_en']}",
        },
        "answerMode": "top_10",
        "interactionPayload": {
            "variant": "poison-deck",
            "title": f"أفضل 10 أندية في تاريخ {label_title(scope)} ({deck['rank_ar']})",
            "rankingBasis": f"الترتيب التاريخي العام حسب {deck['rank_ar']} ({deck['rank_en']}) عبر جميع المواسم {season_phrase_ar}.",
            "sourceLabel": label,
            "sourceUrl": url,
            "asOfDate": asof,
            "candidates": candidates,
            "teamCount": 2,
            "turnCount": 14,
            "turnDeadlineSeconds": 6,
            "actions": ["KEEP", "POISON"],
            "timeoutAction": "KEEP",
        },
        "resolutionPayload": {
            "rankedEntries": ranked,
            "decoyCandidateIds": decoy_ids,
            "revealOrder": "rank_10_to_1_then_decoys",
            "validOwnedCardValue": 1,
            "decoyOwnedCardValue": -1,
            "poisonBonus": 0,
            "scoringRuleId": "top10.poison-deck.result",
            "winnerScoreEventType": "top10.poison-deck.win",
            "tieScoreEventType": None,
            "socialMetricIds": ["successfulPoison", "giftedValidCard", "selfKeptDecoy", "selfKeptValid"],
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "metadata": {
            "sources": [url],
            "validationStatus": "draft",
            "explanation": f"All-time {scope} {deck['rank_en']} ranking ({deck['rank_ar']}), via {label}, as-of {asof}. All 14 {deck['rank_en']} values are unique; no tiebreaker needed.",
            "decoyReview": decoy_review,
        },
    }
    return item


def label_title(scope):
    if scope.endswith("saudi-league"):
        return "دوري المحترفين السعودي"
    if scope.endswith("premier-league"):
        return "الدوري الإنجليزي الممتاز"
    if scope.endswith("champions-league"):
        return "دوري أبطال أوروبا"
    return "مسابقة"


def build_pack(pack_id, items):
    return {
        "packId": pack_id,
        "worldId": "football",
        "challengeType": "top-10",
        "patternId": "poison-deck",
        "language": "ar",
        "media": "text-only",
        "generatedAt": GENERATED,
        "status": "human_review",
        "items": items,
    }


def write(pack):
    out = OUT / f"{pack['packId']}.json"
    out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {out.name}")


def main():
    sa = [
        build_deck("sa", SA_SCOPE, SA_TEAMS, SA_URL, SA_LABEL, SA_ASOF, SA_PTS, "points", "2026/27"),
        build_deck("sa", SA_SCOPE, SA_TEAMS, SA_URL, SA_LABEL, SA_ASOF, SA_GOALS, "goals", "2026/27"),
        build_deck("sa", SA_SCOPE, SA_TEAMS, SA_URL, SA_LABEL, SA_ASOF, SA_WINS, "wins", "2026/27"),
    ]
    pl = [
        build_deck("pl", PL_SCOPE, PL_TEAMS, PL_URL, PL_LABEL, PL_ASOF, PL_PTS, "points", "2025/26"),
        build_deck("pl", PL_SCOPE, PL_TEAMS, PL_URL, PL_LABEL, PL_ASOF, PL_GOALS, "goals", "2025/26"),
        build_deck("pl", PL_SCOPE, PL_TEAMS, PL_URL, PL_LABEL, PL_ASOF, PL_WINS, "wins", "2025/26"),
    ]
    cl = [
        build_deck("cl", CL_SCOPE, CL_TEAMS, CL_URL, CL_LABEL, CL_ASOF, CL_GOALS, "goals", "2025/26"),
        build_deck("cl", CL_SCOPE, CL_TEAMS, CL_URL, CL_LABEL, CL_ASOF, CL_WINS, "wins", "2025/26"),
        build_deck("cl", CL_SCOPE, CL_TEAMS, CL_URL, CL_LABEL, CL_ASOF, CL_APPS, "apps", "2025/26"),
    ]
    write(build_pack("football-saudi-top10-poison-development-pack", sa))
    write(build_pack("football-premier-top10-poison-development-pack", pl))
    write(build_pack("football-champions-top10-poison-development-pack", cl))


if __name__ == "__main__":
    main()