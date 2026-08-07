#!/usr/bin/env python3
"""Build the Top-5 keep-or-give development packs for the Football World:
Saudi Pro League, Premier League (1992-era), Champions League.

Each pack holds exactly 3 ContentItems. Every item uses the canonical
keep-or-give shape (10 entries / 5 unique ranks 1-5 / 5 traps with rank null),
the dedicated top-5 patterns schema, Arabic bilingual prompts, non-reusable, and
metadata.validationStatus "draft". Traps are the sixth-through-tenth real
rankings from the source table; authored poison-deck decoys are dropped.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output"
GENERATED = "2026-08-08"

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
# Each deck: (scope, list of (suffix, label_ar), top [(team, value)] x10 with
#  the fifth entry as the keep-or-give boundary, basis, prompt) -> the first
#  five entries become ranked ranks 1-5, the next five become traps.

# ---- SAUDI PRO LEAGUE (worldfootball co1169, as-of 2026/27 start) ---------
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

# (top [(team, value)] x10, basis_ar, basis_en, prompt_ar, prompt_en)
SA_PTS = {
    "top": [("hilal", 1264), ("nassr", 1062), ("ittihad", 998), ("ahli", 933), ("shabab", 911),
            ("ettifaq", 671), ("fateh", 632), ("taawoun", 630), ("raed", 511), ("wehda", 441)],
    "rank_en": "total points (3 for a win, 1 for a draw)",
    "rank_ar": "مجموع النقاط",
    "prompt_ar": "من حيث مجموع النقاط (3 للفوز و1 للتعادل) في الترتيب التاريخي العام للدوري عبر جميع المواسم؟",
    "prompt_en": "by total points (3 for a win, 1 for a draw) in the all-time league standings across all seasons?",
}
SA_GOALS = {
    "top": [("hilal", 1210), ("nassr", 1071), ("ittihad", 1017), ("ahli", 963), ("shabab", 881),
            ("fateh", 679), ("ettifaq", 674), ("taawoun", 670), ("raed", 580), ("wehda", 514)],
    "rank_en": "goals scored (goals for)",
    "rank_ar": "عدد الأهداف المسجّلة",
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها عبر جميع مواسم الدوري حتى بداية موسم 2026/27؟",
    "prompt_en": "by the number of goals it has scored across all league seasons through 2026/27?",
}
SA_WINS = {
    "top": [("hilal", 385), ("nassr", 314), ("ittihad", 290), ("ahli", 269), ("shabab", 256),
            ("ettifaq", 181), ("fateh", 169), ("taawoun", 167), ("raed", 134), ("wehda", 122)],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "prompt_ar": "من حيث عدد المباريات التي فاز بها عبر جميع مواسم الدوري حتى بداية موسم 2026/27؟",
    "prompt_en": "by the number of matches it has won across all league seasons through 2026/27?",
}

# ---- PREMIER LEAGUE (1992-era only; Wikipedia all-time PL table, 2025-26) ---
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
}
PL_PTS = {
    "top": [("mun", 2614), ("ars", 2473), ("liv", 2402), ("che", 2366), ("tot", 1992),
            ("mci", 1958), ("eve", 1747), ("new", 1656), ("avl", 1618), ("whu", 1393)],
    "rank_en": "total points",
    "rank_ar": "مجموع النقاط",
    "prompt_ar": "من حيث مجموع النقاط في الترتيب التاريخي العام للدوري الإنجليزي الممتاز منذ تأسيسه عام 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by total points in the Premier League all-time table since it began in 1992, through the 2025/26 season?",
}
PL_GOALS = {
    "top": [("mun", 2413), ("ars", 2336), ("liv", 2331), ("che", 2210), ("tot", 2000),
            ("mci", 1997), ("eve", 1654), ("new", 1651), ("avl", 1506), ("whu", 1429)],
    "rank_en": "goals scored",
    "rank_ar": "عدد الأهداف المسجّلة",
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها في الدوري الإنجليزي الممتاز منذ 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of goals it has scored in the Premier League since 1992, through the 2025/26 season?",
}
PL_WINS = {
    "top": [("mun", 775), ("ars", 719), ("liv", 694), ("che", 681), ("mci", 573),
            ("tot", 561), ("eve", 463), ("new", 453), ("avl", 430), ("whu", 381)],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "prompt_ar": "من حيث عدد المباريات التي فاز بها في الدوري الإنجليزي الممتاز منذ 1992 حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has won in the Premier League since 1992, through the 2025/26 season?",
}

# ---- CHAMPIONS LEAGUE (worldfootball co19 all-time table, 2025/26) --------
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
}
CL_GOALS = {
    "top": [("rma", 1132), ("bay", 885), ("bar", 745), ("mun", 520), ("juv", 499),
            ("liv", 474), ("ben", 465), ("mil", 442), ("por", 387), ("ars", 382)],
    "rank_en": "goals scored",
    "rank_ar": "عدد الأهداف المسجّلة",
    "prompt_ar": "من حيث عدد الأهداف التي سجّلها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of goals it has scored across all Champions League seasons through 2025/26?",
}
CL_WINS = {
    "top": [("rma", 309), ("bay", 250), ("bar", 212), ("juv", 159), ("mun", 153),
            ("liv", 143), ("mil", 132), ("ben", 124), ("por", 120), ("ars", 113)],
    "rank_en": "wins",
    "rank_ar": "عدد الانتصارات",
    "prompt_ar": "من حيث عدد المباريات التي فاز بها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has won across all Champions League seasons through 2025/26?",
}
CL_APPS = {
    "top": [("rma", 515), ("bay", 416), ("bar", 367), ("juv", 317), ("mun", 289),
            ("ben", 288), ("mil", 275), ("por", 265), ("liv", 252), ("int", 228)],
    "rank_en": "matches played",
    "rank_ar": "عدد المباريات التي لعبها",
    "prompt_ar": "من حيث عدد المباريات التي خاضها عبر جميع مواسم دوري أبطال أوروبا حتى نهاية موسم 2025/26؟",
    "prompt_en": "by the number of matches it has played across all Champions League seasons through 2025/26?",
}


def build_deck(prefix, scope, teams, url, label, asof, deck, suffix, season_ar):
    """deck is a dict with top (10 (code, value) pairs), rank_*, prompt_*."""
    item_id = f"{prefix}-alltime-{suffix}"
    ranked, traps = deck["top"][:5], deck["top"][5:]
    entries = []
    for i, (code, val) in enumerate(deck["top"]):
        entries.append({
            "id": f"{item_id}-{code}",
            "label": teams[code],
            "sourceValue": val,
            "rank": i + 1 if i < 5 else None,
        })
    boundary = ranked[-1][1]
    season_phrase_ar = f"حتى نهاية موسم {season_ar}"
    season_phrase_en = f"through the {season_ar} season"

    trap_review = []
    for code, val in traps:
        lbl = teams[code]
        dist = boundary - val
        if dist >= 100:
            plaus_ar = (f"{lbl} نادٍ معروف لكنّ رصيده التاريخي في الترتيب الكلّي بعيد (بفارق "
                        f"{dist}) عن حافة المركز الخامس؛ جهل أغلب الجمهور بأرقامه الدقيقة "
                        f"يجعل قرارَ حفظه أو إرساله غامضاً.")
        elif dist >= 20:
            plaus_ar = (f"{lbl} اسم مألوف وجدير بأي قائمة، لكنه خارج الخمسة بفارق {dist} فقط؛ "
                        f"هذا التباعد المتوسط يبقي ظهوره بين الكبار مقنعاً في ذهن لاعب لا يحفظ الأرقام.")
        else:
            plaus_ar = (f"{lbl} على بُعد {dist} فقط من حافة المركز الخامس، ما يجعله الخداع الأكثر "
                        f"إغراءً — كثير من اللاعبين سيحفظونه خطأً بثقته العالية.")
        trap_review.append({
            "candidateId": f"{item_id}-{code}",
            "cutoffDistance": dist,
            "plausibility": plaus_ar,
            "tooEasy": False,
        })

    item = {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["top-5"],
        "patternId": "keep-or-give",
        "prompt": {
            "ar": f"أيٌّ من هذه الأندية يقع ضمن المراكز الخمسة الأولى {deck['prompt_ar']}",
            "en": f"Which of these clubs belongs within the top five of the all-time table {deck['prompt_en']}",
        },
        "answerMode": "top_5",
        "interactionPayload": {
            "variant": "keep-or-give",
            "title": f"أفضل 5 أندية في تاريخ {label_title(scope)} ({deck['rank_ar']})",
            "rankingBasis": f"الترتيب التاريخي العام حسب {deck['rank_ar']} ({deck['rank_en']}) عبر جميع المواسم {season_phrase_ar}.",
            "sourceLabel": label,
            "sourceUrl": url,
            "asOfDate": asof,
            "entries": entries,
            "teamCount": 2,
            "turnCount": 10,
            "turnDeadlineSeconds": 15,
            "actions": ["keep", "give"],
            "timeoutAction": "keep",
        },
        "resolutionPayload": {
            "scoringRuleId": "top-5.result",
            "winnerScoreEventType": "top-5.win",
            "tieScoreEventType": None,
            "runtimeEventTypes": ["top5-card-decided", "top5-completed"],
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "metadata": {
            "sources": [url],
            "validationStatus": "draft",
            "explanation": f"All-time {scope} {deck['rank_en']} ranking ({deck['rank_ar']}), via {label}, as-of {asof}. All 10 {deck['rank_en']} values are unique; no tiebreaker needed.",
            "trapReview": trap_review,
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
        "challengeType": "top-5",
        "patternId": "keep-or-give",
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
    write(build_pack("football-saudi-top5-keep-or-give-development-pack", sa))
    write(build_pack("football-premier-top5-keep-or-give-development-pack", pl))
    write(build_pack("football-champions-top5-keep-or-give-development-pack", cl))


if __name__ == "__main__":
    main()
