#!/usr/bin/env python3
"""Build the 2026-08-13 beta gap packs (102 items).

Outputs four pack files under ai/output/gap-packs-2026-08-13/:

  football-pack.json   18 items  (EPL/SAUDI/UCL: one-clue x3 + DI x3 each)
  anime-pack.json      23 items  (Naruto/OnePiece/AoT x6, Bleach x5)
  video-games-pack.json 16 items (COD/Overwatch/FIFA/GTA: one-clue x3 + top-5 x1)
  puzzles-pack.json    45 items  (5 scopes: one-clue x3 + RYO x3 + closest x3)

Items are authored in the canonical authoring shapes:
  one-clue   -> validate_one_clue.py (native answerPayload/mechanicPayload)
  DI         -> live three-segment-race native shape (backend readiness gate)
  top-5      -> validate_top_5.py (interactionPayload/resolutionPayload/trapReview)
  RYO/closest-> CONTENTITEM.schema.json generic authoring shape

The pusher converts each to the native backend POST body.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output" / "gap-packs-2026-08-13"


def clue(order: int, value: int, ar: str) -> dict:
    return {"order": order, "value": value, "text": {"ar": ar}}


def one_clue(item_id: str, scope: str, prompt_ar: str, answers: list[str],
             clues: list[str], source: str) -> dict:
    """Progressive-clues one-clue item (authoring shape)."""
    return {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["one-clue"],
        "patternId": "progressive-clues",
        "prompt": {"ar": prompt_ar},
        "answerMode": "one_clue",
        "answerPayload": {"mode": "match", "acceptedAnswers": answers},
        "mechanicPayload": {
            "clues": [clue(i + 1, 5 - i, text) for i, text in enumerate(clues)],
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "status": "ready",
        "metadata": {
            "sources": [source],
            "validationStatus": "ready",
            "runtimeContractStatus": "fully_playable",
            "runtimeBlocker": None,
        },
    }


def di(item_id: str, scope: str, answers: list[str], seg_a: str, seg_b: str,
       seg_c: str, source: str, prompt_ar: str = "من أنا؟") -> dict:
    """Three-segment-race distributed-information item (live native shape)."""
    return {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["distributed-information"],
        "patternId": "three-segment-race",
        "prompt": {"ar": prompt_ar},
        "answerMode": "distributed",
        "answerPayload": {"mode": "match", "acceptedAnswers": answers},
        "mechanicPayload": {
            "variant": "three-segment-race",
            "publicPrompt": {
                "ar": "من أنا؟ اجمعوا المعلومات التي معكم للوصول إلى الإجابة.",
            },
            "segments": [
                {"id": "A", "content": {"ar": seg_a}},
                {"id": "B", "content": {"ar": seg_b}},
                {"id": "C", "content": {"ar": seg_c}},
            ],
            "twoPlayerMergeOptions": [
                {"firstParticipantSegmentIds": ["A", "B"], "secondParticipantSegmentIds": ["C"]},
                {"firstParticipantSegmentIds": ["A", "C"], "secondParticipantSegmentIds": ["B"]},
                {"firstParticipantSegmentIds": ["B", "C"], "secondParticipantSegmentIds": ["A"]},
            ],
            "supportedTeamSizes": [2, 3],
            "authorSafetyConfirmation": True,
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "status": "ready",
        "metadata": {
            "sources": [source],
            "validationStatus": "ready",
            "runtimeContractStatus": "fully_playable",
            "runtimeBlocker": None,
        },
    }


def top5(item_id: str, scope: str, prompt_ar: str, title: str, ranking_basis: str,
         source_label: str, source_url: str, as_of_date: str, ranked: list[dict],
         traps: list[dict], trap_review: list[dict], source: str,
         tiebreaker: str | None = None) -> dict:
    """Top-5 keep-or-give item (authoring shape for validate_top_5.py)."""
    entries = [
        {"id": e["id"], "label": e["label"], "rank": e.get("rank"),
         **({"sourceValue": e["sourceValue"]} if "sourceValue" in e else {})}
        for e in ranked + traps
    ]
    interaction = {
        "variant": "keep-or-give",
        "title": title,
        "rankingBasis": ranking_basis,
        "sourceLabel": source_label,
        "sourceUrl": source_url,
        "asOfDate": as_of_date,
        "entries": entries,
        "teamCount": 2,
        "turnCount": 10,
        "turnDeadlineSeconds": 15,
        "actions": ["keep", "give"],
        "timeoutAction": "keep",
    }
    if tiebreaker:
        interaction["tiebreaker"] = tiebreaker
    return {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["top-5"],
        "patternId": "keep-or-give",
        "prompt": {"ar": prompt_ar},
        "answerMode": "top_5",
        "interactionPayload": interaction,
        "resolutionPayload": {
            "scoringRuleId": "top-5.result",
            "winnerScoreEventType": "top-5.win",
            "tieScoreEventType": None,
            "runtimeEventTypes": ["top5-card-decided", "top5-completed"],
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "metadata": {
            "sources": [source],
            "validationStatus": "ready",
            "trapReview": trap_review,
        },
    }


def ryo_mc(item_id: str, scope: str, prompt_ar: str, options: list[str],
           correct: int, source: str) -> dict:
    """Read-your-opponent multiple_choice item (generic authoring shape)."""
    return {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["read-your-opponent"],
        "patternId": "multiple-choice",
        "prompt": {"ar": prompt_ar},
        "answerMode": "multiple_choice",
        "interactionPayload": {
            "options": [
                {"id": f"opt-{i}", "label": label}
                for i, label in enumerate(options)
            ],
        },
        "resolutionPayload": {"correctOptionId": f"opt-{correct}"},
        "media": None,
        "isReusableAcrossSessions": False,
        "metadata": {"sources": [source], "validationStatus": "ready"},
    }


def closest(item_id: str, scope: str, prompt_ar: str, correct_value: float,
            tolerance: float, source: str) -> dict:
    """Closest-estimate item (generic authoring shape)."""
    return {
        "id": item_id,
        "scopeId": scope,
        "compatibleChallengeTypeIds": ["guess-your-teammate"],
        "patternId": "closest-estimate",
        "prompt": {"ar": prompt_ar},
        "answerMode": "closest",
        "interactionPayload": {},
        "resolutionPayload": {
            "correctValue": correct_value,
            "acceptedTolerance": tolerance,
        },
        "media": None,
        "isReusableAcrossSessions": False,
        "metadata": {"sources": [source], "validationStatus": "ready"},
    }


# ---------------------------------------------------------------------------
# FOOTBALL
# ---------------------------------------------------------------------------
SRC_WIKI = "en.wikipedia.org"
football_items: list[dict] = []

# --- Premier League: one-clue x3 ---
football_items.append(one_clue(
    "football-epl-one-clue-alan-shearer", "football.premier-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["آلان شيرر", "شيرر", "Alan Shearer"],
    ["لاعب كرة قدم إنجليزي تألق في تسعينيات القرن الماضي.",
     "لعب لنيوكاسل يونايتد معظم مسيرته الاحترافية.",
     "فاز بلقب هدّاف الدوري الإنجليزي الممتاز ثلاث مرات.",
     "قاد بلاكبيرن روفرز للفوز بلقب الدوري عام 1995.",
     "الهداف التاريخي للدوري الإنجليزي الممتاز برصيد 260 هدفاً."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-epl-one-clue-steven-gerrard", "football.premier-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["ستيفن جيرارد", "جيرارد", "Steven Gerrard"],
    ["لاعب خط وسط إنجليزي عُرف بقوته وتسديداته البعيدة.",
     "ارتدى قميص ليفربول طوال مسيرته الاحترافية.",
     "قاد فريقه للفوز بدوري أبطال أوروبا عام 2005.",
     "حمل شارة قيادة ليفربول لأكثر من عقد.",
     "يُعد من أعظم لاعبي ليفربول ورقمه الشهير 8."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-epl-one-clue-thierry-henry", "football.premier-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["تييري هنري", "هنري", "Thierry Henry"],
    ["مهاجم فرنسي برز في العقد الأول من الألفية.",
     "لعب لأرسنال وتألق في الدوري الإنجليزي.",
     "حصد لقب هدّاف الدوري الممتاز أربع مرات.",
     "قاد أرسنال لموسم دون هزيمة عام 2004.",
     "الهداف التاريخي لأرسنال برصيد 228 هدفاً."],
    SRC_WIKI))

# --- Premier League: DI x3 ---
football_items.append(di(
    "football-epl-di-manchester-united", "football.premier-league",
    ["مانشستر يونايتد", "مان يونايتد", "Manchester United"],
    "ملعبي يسمى أولد ترافورد.",
    "لُقّبت بالشياطين الحمر.",
    "درّبني السير أليكس فيرغسون لأكثر من عقدين.",
    SRC_WIKI))
football_items.append(di(
    "football-epl-di-liverpool", "football.premier-league",
    ["ليفربول", "Liverpool FC", "Liverpool"],
    "أُنشئت في مدينة ليفربول عام 1892.",
    "لُقّبت بالريدز وملعبي أنفيلد.",
    "فزت بلقب الدوري الإنجليزي عام 2020 بعد غياب ثلاثين عاماً.",
    SRC_WIKI))
football_items.append(di(
    "football-epl-di-chelsea", "football.premier-league",
    ["تشيلسي", "Chelsea"],
    "نادٍ من العاصمة لندن تأسس عام 1905.",
    "لُقّبت بالبلوز وملعبي ستامفورد بريدج.",
    "فزت بدوري أبطال أوروبا عامي 2012 و2021.",
    SRC_WIKI))

# --- Saudi League: one-clue x3 ---
football_items.append(one_clue(
    "football-saudi-one-clue-salem-al-dawsari", "football.saudi-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["سالم الدوسري", "الدوسري", "Salem Al-Dawsari"],
    ["لاعب سعودي يلعب في الدوري السعودي للمحترفين.",
     "ارتدى قميص الهلال منذ سنوات طويلة.",
     "سجّل هدفاً تاريخياً في كأس العالم 2022 أمام الأرجنتين.",
     "حصد جائزة أفضل لاعب في آسيا عام 2022.",
     "حمل الرقم 10 في المنتخب السعودي والهلال."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-saudi-one-clue-mohammed-noor", "football.saudi-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["محمد نور", "نور", "Mohammed Noor"],
    ["لاعب وسط سعودي اعتزل كرة القدم بعد مسيرة طويلة.",
     "ارتدى قميص الاتحاد معظم مشواره.",
     "لُقّب بجواهري.",
     "قاد الاتحاد للفوز بدوري أبطال آسيا مرتين متتاليتين.",
     "حصد جائزة أفضل لاعب آسيوي عام 2005."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-saudi-one-clue-cristiano-ronaldo", "football.saudi-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["كريستيانو رونالدو", "رونالدو", "Cristiano Ronaldo"],
    ["مهاجم برتغالي يلعب حالياً في دوري روشن السعودي.",
     "انضم إلى النصر عام 2023.",
     "فاز بالكرة الذهبية خمس مرات.",
     "الهداف التاريخي لدوري أبطال أوروبا.",
     "اشتهر بعبارته الشهيرة سووو."],
    SRC_WIKI))

# --- Saudi League: DI x3 ---
football_items.append(di(
    "football-saudi-di-al-hilal", "football.saudi-league",
    ["الهلال", "نادي الهلال", "Al-Hilal"],
    "تأسست في الرياض عام 1957.",
    "لُقّبت بالزعيم.",
    "الأكثر تتويجاً بلقب الدوري السعودي في التاريخ.",
    SRC_WIKI))
football_items.append(di(
    "football-saudi-di-al-ittihad", "football.saudi-league",
    ["الاتحاد", "نادي الاتحاد", "Al-Ittihad"],
    "نادٍ من جدة تأسس عام 1927.",
    "لُقّبت بالعميد.",
    "فزت بدوري أبطال آسيا مرتين عامي 2004 و2005.",
    SRC_WIKI))
football_items.append(di(
    "football-saudi-di-al-nassr", "football.saudi-league",
    ["النصر", "نادي النصر", "Al-Nassr"],
    "نادٍ من الرياض تأسس عام 1955.",
    "لُقّبت بالعالمي.",
    "انضم إليّ كريستيانو رونالدو عام 2023.",
    SRC_WIKI))

# --- Champions League: one-clue x3 ---
football_items.append(one_clue(
    "football-ucl-one-clue-real-madrid", "football.champions-league",
    "ما النادي الذي تصفه الأدلة؟",
    ["ريال مدريد", "Real Madrid"],
    ["نادٍ إسباني من العاصمة مدريد.",
     "يُلقب بالملكي.",
     "الأكثر تتويجاً بدوري أبطال أوروبا.",
     "ملعبه سانتياغو برنابيو.",
     "حقق لقب الأبطال 15 مرة حتى عام 2024."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-ucl-one-clue-zinedine-zidane", "football.champions-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["زين الدين زيدان", "زيدان", "Zinedine Zidane"],
    ["لاعب فرنسي من أصول جزائرية.",
     "سجّل هدفاً عالمياً في نهائي دوري الأبطال 2002.",
     "فاز بكأس العالم 1998 مع منتخب بلاده.",
     "درّب ريال مدريد وفاز بدوري الأبطال ثلاث مرات متتالية.",
     "لُقّب بالنجم الذي حمل الرقم 10."],
    SRC_WIKI))
football_items.append(one_clue(
    "football-ucl-one-clue-lionel-messi", "football.champions-league",
    "من هو اللاعب الذي تصفه الأدلة؟",
    ["ليونيل ميسي", "ميسي", "Lionel Messi"],
    ["مهاجم أرجنتيني يُلقب بالبرغوث.",
     "لعب لبرشلونة معظم مسيرته.",
     "فاز بدوري أبطال أوروبا أربع مرات مع برشلونة.",
     "حصد الكرة الذهبية ثماني مرات.",
     "قاد منتخب الأرجنتين للفوز بكأس العالم 2022."],
    SRC_WIKI))

# --- Champions League: DI x3 ---
football_items.append(di(
    "football-ucl-di-bayern-munich", "football.champions-league",
    ["بايرن ميونخ", "Bayern Munich"],
    "نادٍ ألماني من مدينة ميونخ.",
    "لُقّبت بالأسود الحمر.",
    "حققت الثلاثية التاريخية عامي 2013 و2020.",
    SRC_WIKI))
football_items.append(di(
    "football-ucl-di-barcelona", "football.champions-league",
    ["برشلونة", "Barcelona"],
    "نادٍ إسباني من إقليم كتالونيا.",
    "ملعبي كامب نو.",
    "فزت بدوري أبطال أوروبا خمس مرات.",
    SRC_WIKI))
football_items.append(di(
    "football-ucl-di-ac-milan", "football.champions-league",
    ["إيه سي ميلان", "ميلان", "AC Milan"],
    "نادٍ إيطالي من مدينة ميلانو.",
    "لُقّبت بالروسونيري.",
    "ثاني أكثر الأندية تتويجاً بدوري الأبطال برصيد 7 ألقاب.",
    SRC_WIKI))

# ---------------------------------------------------------------------------
# ANIME
# ---------------------------------------------------------------------------
anime_items: list[dict] = []
SRC_ANIME = "anime.fandom.com"

# --- Naruto: one-clue x3 ---
anime_items.append(one_clue(
    "anime-naruto-one-clue-kakashi", "anime.naruto",
    "من هو النينجا الذي تصفه الأدلة؟",
    ["كاكاشي هاتاكي", "كاكاشي", "Kakashi Hatake"],
    ["نينجا من قرية الأوراق المخفية.",
     "معلم الفريق السابع.",
     "يُلقب بالنينجا الناسخ.",
     "يمتلك عين الشارينغان.",
     "يقرأ كتاباً شهيراً دائماً في يده."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-naruto-one-clue-sasuke", "anime.naruto",
    "من هو النينجا الذي تصفه الأدلة؟",
    ["ساسكي أوتشيها", "ساسكي", "Sasuke Uchiha"],
    ["شخصية من عالم النينجا.",
     "من عشيرة الأوتشيها.",
     "يسعى للانتقام من أخيه.",
     "يمتلك عين الشارينغان المتطورة.",
     "صديق ناروتو ومنافسه."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-naruto-one-clue-jiraiya", "anime.naruto",
    "من هو النينجا الذي تصفه الأدلة؟",
    ["جيرايا", "Jiraiya"],
    ["نينجا أسطوري من قرية الأوراق.",
     "أحد النينجا الثلاثة الأسطوريين.",
     "معلم ناروتو.",
     "علّم ناروتو تقنية الراسينغان.",
     "لُقّب بالحكيم الخالد."],
    SRC_ANIME))

# --- Naruto: DI x3 ---
anime_items.append(di(
    "anime-naruto-di-sakura", "anime.naruto",
    ["ساكورا هارونو", "ساكورا", "Sakura Haruno"],
    "شخصية أنمي من قرية الأوراق.",
    "عضوة في الفريق السابع.",
    "تلميذة تسونادي سيدة الشفاء.",
    SRC_ANIME))
anime_items.append(di(
    "anime-naruto-di-naruto", "anime.naruto",
    ["ناروتو أوزوماكي", "ناروتو", "Naruto Uzumaki"],
    "شخصية أنمي شابة.",
    "حلمه أن يصبح هوكاجي.",
    "يحمل بداخله الثعلب ذو الذيول التسعة.",
    SRC_ANIME))
anime_items.append(di(
    "anime-naruto-di-minato", "anime.naruto",
    ["ميناتو ناميكازي", "ميناتو", "Minato Namikaze"],
    "والد ناروتو.",
    "الرابع هوكاجي.",
    "لُقّب بالبرق الأصفر.",
    SRC_ANIME))

# --- One Piece: one-clue x3 ---
anime_items.append(one_clue(
    "anime-onepiece-one-clue-luffy", "anime.one-piece",
    "من هو القرصان الذي تصفه الأدلة؟",
    ["مونكي دي لوفي", "لوفي", "Monkey D. Luffy"],
    ["شخصية أنمي شاب من طاقم قراصنة.",
     "يرتدي قبعة قش.",
     "أكل فاكهة شيطانية تمنحه قوة مطاطية.",
     "حلمه أن يصبح ملك القراصنة.",
     "قائد طاقم قراصنة قبعة القش."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-onepiece-one-clue-zoro", "anime.one-piece",
    "من هو القرصان الذي تصفه الأدلة؟",
    ["رورونوا زورو", "زورو", "Roronoa Zoro"],
    ["شخصية أنمي من طاقم قراصنة.",
     "يرتدي ثلاثة سيوف.",
     "لقبه صائد القراصنة.",
     "شعره أخضر.",
     "يحلم بأن يكون أعظم سياف في العالم."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-onepiece-one-clue-nico-robin", "anime.one-piece",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["نيكو روبن", "روبن", "Nico Robin"],
    ["شخصية أنمي من طاقم قراصنة.",
     "أكلت فاكهة الشيطان هانا هانا.",
     "عالِمة آثار.",
     "قادرة على إظهار أطرافها في أي مكان.",
     "تحلم بقراءة التاريخ الحقيقي."],
    SRC_ANIME))

# --- One Piece: DI x3 ---
anime_items.append(di(
    "anime-onepiece-di-sanji", "anime.one-piece",
    ["سانجي", "Sanji"],
    "شخصية أنمي من طاقم قبعة القش.",
    "طباخ الطاقم.",
    "يقاتل برجليه ولا يستخدم يديه.",
    SRC_ANIME))
anime_items.append(di(
    "anime-onepiece-di-nami", "anime.one-piece",
    ["نامي", "Nami"],
    "شخصية أنمي من طاقم قبعة القش.",
    "ملاحة الطاقم.",
    "تحلم برسم خريطة العالم كله.",
    SRC_ANIME))
anime_items.append(di(
    "anime-onepiece-di-ace", "anime.one-piece",
    ["بورتغاس دي إيس", "إيس", "Portgas D. Ace"],
    "شخصية أنمي من عالم ون بيس.",
    "الأخ الأكبر بالتبني للوفي.",
    "قائد طاقم القراصنة القتالية وله قوة نار المشتعل.",
    SRC_ANIME))

# --- Attack on Titan: one-clue x3 ---
anime_items.append(one_clue(
    "anime-aot-one-clue-eren", "anime.attack-on-titan",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["إيرين ييغر", "إيرين", "Eren Yeager"],
    ["شخصية أنمي شاب.",
     "يعيش داخل أسوار تحمي البشرية.",
     "يمتلك قدرة التحول إلى عملاق.",
     "حلمه الوصول إلى الحرية.",
     "عملاقه يُلقب بعملاق التأسيس."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-aot-one-clue-mikasa", "anime.attack-on-titan",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["ميكاسا آكرمان", "ميكاسا", "Mikasa Ackerman"],
    ["شخصية أنمي فتاة.",
     "من عشيرة آكرمان.",
     "تحمي إيرين منذ الطفولة.",
     "ترتدي وشاحاً أحمر.",
     "تُعتبر أقوى جندية في البشرية."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-aot-one-clue-levi", "anime.attack-on-titan",
    "من هو الجندي الذي تصفه الأدلة؟",
    ["ليفاي آكرمان", "ليفاي", "Levi Ackerman"],
    ["جندي من فيلق الاستطلاع.",
     "قائد فرقة العمليات الخاصة.",
     "لُقّب بأقوى جندي في البشرية.",
     "قصير القامة.",
     "يستخدم أداة القتال ببراعة."],
    SRC_ANIME))

# --- Attack on Titan: DI x3 ---
anime_items.append(di(
    "anime-aot-di-armin", "anime.attack-on-titan",
    ["أرمين أرليرت", "أرمين", "Armin Arlert"],
    "شخصية أنمي من داخل الأسوار.",
    "صديق الطفولة لإيرين وميكاسا.",
    "عُرف بذكائه الاستراتيجي.",
    SRC_ANIME))
anime_items.append(di(
    "anime-aot-di-colossal-titan", "anime.attack-on-titan",
    ["العملاق الهائل", "Colossal Titan"],
    "عملاق ضخم في عالم الأنمي.",
    "اخترق الجدار الأول عام 845.",
    "حامله بيرثولت هوفر ثم أرمين.",
    SRC_ANIME))
anime_items.append(di(
    "anime-aot-di-survey-corps", "anime.attack-on-titan",
    ["فيلق الاستطلاع", "Survey Corps"],
    "تنظيم عسكري داخل الأسوار.",
    "شعارهم الأجنحة الحرة.",
    "مهمتهم الخروج خارج الجدران لدراسة العمالقة.",
    SRC_ANIME))

# --- Bleach: one-clue x2 + DI x3 ---
anime_items.append(one_clue(
    "anime-bleach-one-clue-ichigo", "anime.bleach",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["إيتشيغو كوروساكي", "إيتشيغو", "Ichigo Kurosaki"],
    ["شخصية أنمي شاب.",
     "حصل على قوى شينيغامي.",
     "يحمل زانباكتو اسمه زانغيتسو.",
     "شعره برتقالي اللون.",
     "بطل سلسلة بليتش."],
    SRC_ANIME))
anime_items.append(one_clue(
    "anime-bleach-one-clue-rukia", "anime.bleach",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["روكيا كوتشيكي", "روكيا", "Rukia Kuchiki"],
    ["شخصية أنمي فتاة.",
     "شينيغامي من فرقة الحماية.",
     "نقلت قواها إلى إيتشيغو.",
     "صغيرة القامة.",
     "تنتسب لعائلة كوتشيكي النبيلة."],
    SRC_ANIME))
anime_items.append(di(
    "anime-bleach-di-zangetsu", "anime.bleach",
    ["زانغيتسو", "Zangetsu"],
    "سيف روحي في عالم الأنمي.",
    "سلاح إيتشيغو.",
    "له روح تظهر في عالمه الداخلي.",
    SRC_ANIME))
anime_items.append(di(
    "anime-bleach-di-soul-society", "anime.bleach",
    ["مجتمع الأرواح", "Soul Society"],
    "عالم في أنمي بليتش.",
    "موطن الشينيغامي.",
    "يضم 13 فرقة حماية.",
    SRC_ANIME))
anime_items.append(di(
    "anime-bleach-di-hollow", "anime.bleach",
    ["الهولو", "Hollow"],
    "كائن روحاني في عالم بليتش.",
    "يرتدي قناعاً أبيض.",
    "يتغذى على الأرواح.",
    SRC_ANIME))

# ---------------------------------------------------------------------------
# VIDEO GAMES
# ---------------------------------------------------------------------------
video_items: list[dict] = []

# --- Call of Duty: one-clue x3 ---
video_items.append(one_clue(
    "vg-cod-one-clue-captain-price", "video-games.call-of-duty",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["كابتن برايس", "جون برايس", "Captain Price"],
    ["شخصية من سلسلة ألعاب قتال.",
     "جندي بريطاني.",
     "يرتدي قبعة صغيرة.",
     "قائد فرقة ساس.",
     "يظهر في سلسلة كول أوف ديوتي مودرن وارفير."],
    "callofduty.fandom.com"))
video_items.append(one_clue(
    "vg-cod-one-clue-ghost", "video-games.call-of-duty",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["غوست", "Ghost"],
    ["شخصية من سلسلة ألعاب قتال.",
     "يرتدي قناعاً أبيض.",
     "من فرقة 141.",
     "عُرف بصوته الهادئ.",
     "قُتل على يد شيفرد في مودرن وارفير 2."],
    "callofduty.fandom.com"))
video_items.append(one_clue(
    "vg-cod-one-clue-soap", "video-games.call-of-duty",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["سوب", "Soap", "Soap MacTavish"],
    ["شخصية من سلسلة ألعاب القتال الحديثة.",
     "جندي اسكتلندي انضم لفرقة خاصة.",
     "لقبه معناه في العربية الصابون.",
     "شريك كابتن برايس المقرّب.",
     "عضو مؤسس في فرقة 141."],
    "callofduty.fandom.com"))

# --- Call of Duty: top-5 ---
video_items.append(top5(
    "vg-cod-top5-best-selling", "video-games.call-of-duty",
    "أي من ألعاب كول أوف ديوتي هذه حققت أعلى المبيعات التاريخية؟",
    "أكثر ألعاب كول أوف ديوتي مبيعاً",
    "إجمالي المبيعات التقديرية منذ الإصدار",
    "ShaneTheGamer (استشهد بإحصائيات ستاتيستا وملفات قضائية)",
    "https://www.shanethegamer.com/research/call-of-duty-sales-statistics/",
    "2026-07-02",
    ranked=[
        {"id": "bo3", "label": "بلاك أوبس 3", "rank": 1, "sourceValue": 43},
        {"id": "bo-2010", "label": "بلاك أوبس (2010)", "rank": 2, "sourceValue": 30},
        {"id": "mw-2019", "label": "مودرن وارفير 2019", "rank": 3, "sourceValue": 30},
        {"id": "bo6", "label": "بلاك أوبس 6", "rank": 4, "sourceValue": 29},
        {"id": "mw2-2009", "label": "مودرن وارفير 2 (2009)", "rank": 5, "sourceValue": 28},
    ],
    traps=[
        {"id": "bo2", "label": "بلاك أوبس 2", "rank": None},
        {"id": "ghosts", "label": "غوستس", "rank": None},
        {"id": "cold-war", "label": "كولد وور", "rank": None},
        {"id": "ww2", "label": "الحرب العالمية الثانية", "rank": None},
        {"id": "advanced-warfare", "label": "أدفانسد وارفير", "rank": None},
    ],
    trap_review=[
        {"candidateId": "bo2", "cutoffDistance": 1,
         "plausibility": "سلسلة بلاك أوبس من أكثر السلاسل مبيعاً لكن الإصدار الأصلي يتفوق.", "tooEasy": False},
        {"candidateId": "ghosts", "cutoffDistance": 2,
         "plausibility": "إصدار شائع باسمه لكن مبيعاته أقل من القائمة العليا.", "tooEasy": False},
        {"candidateId": "cold-war", "cutoffDistance": 2,
         "plausibility": "حديث نسبياً وقد يبدو كبيراً لكنه خارج المراكز الخمسة.", "tooEasy": False},
        {"candidateId": "ww2", "cutoffDistance": 3,
         "plausibility": "عنوان بارز في ذاكرة اللاعبين رغم أن مبيعاته أدنى.", "tooEasy": False},
        {"candidateId": "advanced-warfare", "cutoffDistance": 3,
         "plausibility": "إصدار معروف لكنه من الأقل مبيعاً في العقد الماضي.", "tooEasy": False},
    ],
    source="shanethegamer.com/research/call-of-duty-sales-statistics",
    tiebreaker="تم كسر التعادل عند 30 مليون وفق ترتيب المصدر: بلاك أوبس (2010) يتقدم على مودرن وارفير 2019."))

# --- Overwatch: one-clue x3 ---
video_items.append(one_clue(
    "vg-ow-one-clue-tracer", "video-games.overwatch",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["تريسر", "Tracer"],
    ["شخصية من لعبة تصويب جماعية.",
     "بطلة من بطولات أوفرواتش.",
     "تتحكم بالزمن.",
     "تستخدم مسدسين.",
     "أقدم شخصيات اللعبة ورمزها."],
    "overwatch.fandom.com"))
video_items.append(one_clue(
    "vg-ow-one-clue-reinhardt", "video-games.overwatch",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["راينهارت", "Reinhardt"],
    ["شخصية من لعبة تصويب جماعية.",
     "من فئة الدبابات في أوفرواتش.",
     "يحمل درعاً ضخماً.",
     "يستخدم مطرقة صاروخية.",
     "ألماني من فرسان كروسادير."],
    "overwatch.fandom.com"))
video_items.append(one_clue(
    "vg-ow-one-clue-mercy", "video-games.overwatch",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["ميرسي", "Mercy"],
    ["شخصية من لعبة تصويب جماعية.",
     "معالِجة في فريق أوفرواتش.",
     "تستخدم عصا الشفاء.",
     "قادرة على إحياء زملائها.",
     "اسمها الحقيقي أنجيلا زيغلر."],
    "overwatch.fandom.com"))

# --- Overwatch: top-5 ---
video_items.append(top5(
    "vg-ow-top5-most-picked", "video-games.overwatch",
    "أي من أبطال أوفرواتش هذه حقق أعلى نسبة اختيار في الوضع التنافسي؟",
    "الأبطال الأكثر اختياراً في أوفرواتش (تنافسي)",
    "نسبة الاختيار Pick Rate في الوضع التنافسي",
    "Blizzard (صفحة معدلات أوفرواتش الرسمية)",
    "https://overwatch.blizzard.com/en-us/rates/",
    "2026-08-12",
    ranked=[
        {"id": "ana", "label": "آنا", "rank": 1, "sourceValue": 26.2},
        {"id": "kiriko", "label": "كيريكو", "rank": 2, "sourceValue": 22.8},
        {"id": "mercy", "label": "ميرسي", "rank": 3, "sourceValue": 22.5},
        {"id": "juno", "label": "جونو", "rank": 4, "sourceValue": 21.6},
        {"id": "moira", "label": "مويرا", "rank": 5, "sourceValue": 21.1},
    ],
    traps=[
        {"id": "mizuki", "label": "ميزوكي", "rank": None, "sourceValue": 15.5},
        {"id": "jetpack-cat", "label": "جيت باك كات", "rank": None, "sourceValue": 15.1},
        {"id": "genji", "label": "جينجي", "rank": None, "sourceValue": 14.4},
        {"id": "cassidy", "label": "كاسيدي", "rank": None, "sourceValue": 14.2},
        {"id": "shion", "label": "شيون", "rank": None, "sourceValue": 14.0},
    ],
    trap_review=[
        {"candidateId": "mizuki", "cutoffDistance": 1,
         "plausibility": "بطل دعم شائع حديثاً ويقترب من القائمة العليا.", "tooEasy": False},
        {"candidateId": "jetpack-cat", "cutoffDistance": 1,
         "plausibility": "بطل محبوب لكنه لا يتصدر نسب الاختيار.", "tooEasy": False},
        {"candidateId": "genji", "cutoffDistance": 2,
         "plausibility": "أيقونة اللعبة لدى الجماهير رغم أن اختياره أدنى من الدعم.", "tooEasy": False},
        {"candidateId": "cassidy", "cutoffDistance": 2,
         "plausibility": "بطل ضرر معروف لكنه بعيد عن المراكز الخمسة.", "tooEasy": False},
        {"candidateId": "shion", "cutoffDistance": 2,
         "plausibility": "بطل جديد ذو حضور لكنه خارج القمة.", "tooEasy": False},
    ],
    source="overwatch.blizzard.com/en-us/rates"))

# --- FIFA: one-clue x3 ---
video_items.append(one_clue(
    "vg-fifa-one-clue-ronaldinho", "video-games.fifa",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["رونالدينيو", "Ronaldinho"],
    ["لاعب كرة قدم برازيلي معتزل.",
     "لعب لبرشلونة وميلان.",
     "فاز بالكرة الذهبية عام 2005.",
     "ظهر على غلاف سلسلة فيفا.",
     "اشتهر بابتسامته ومهاراته."],
    "en.wikipedia.org"))
video_items.append(one_clue(
    "vg-fifa-one-clue-ultimate-team", "video-games.fifa",
    "ما هو الوضع الذي تصفه الأدلة؟",
    ["ألتيميت تيم", "FUT", "Ultimate Team"],
    ["وضع لعب في سلسلة ألعاب فيفا.",
     "يتيح بناء فريق من البطاقات.",
     "يشتهر ببناء التشكيلات من البطاقات.",
     "يتميز ببطاقات اللاعبين الخاصة.",
     "يُعد مصدر الدخل الرئيسي للشركة."],
    "en.wikipedia.org"))
video_items.append(one_clue(
    "vg-fifa-one-clue-career-mode", "video-games.fifa",
    "ما هو الوضع الذي تصفه الأدلة؟",
    ["الوضع المهني", "Career Mode"],
    ["وضع لعب في سلسلة ألعاب فيفا.",
     "تدير فيه نادياً على مدار مواسم.",
     "يتضمن انتقالات اللاعبين.",
     "تطوير لاعبي الأكاديمية.",
     "يشتهر بتجربة إدارة الأندية."],
    "en.wikipedia.org"))

# --- FIFA: top-5 ---
video_items.append(top5(
    "vg-fifa-top5-best-selling", "video-games.fifa",
    "أي من ألعاب فيفا هذه حققت أعلى المبيعات التاريخية؟",
    "أكثر ألعاب فيفا مبيعاً",
    "إجمالي المبيعات التقديرية منذ الإصدار",
    "قائمة ميريستيشن لأكثر ألعاب فيفا مبيعاً",
    "https://en.as.com/meristation/news/the-best-selling-fifa-in-ea-sports-history-n/",
    "2026-07-02",
    ranked=[
        {"id": "fifa18", "label": "فيفا 18", "rank": 1, "sourceValue": 26.4},
        {"id": "fifa19", "label": "فيفا 19", "rank": 2, "sourceValue": 20},
        {"id": "fifa11", "label": "فيفا 11", "rank": 3, "sourceValue": 16},
        {"id": "fifa13", "label": "فيفا 13", "rank": 4, "sourceValue": 14.5},
        {"id": "fifa14", "label": "فيفا 14", "rank": 5, "sourceValue": 14},
    ],
    traps=[
        {"id": "fifa15", "label": "فيفا 15", "rank": None, "sourceValue": 14},
        {"id": "fifa17", "label": "فيفا 17", "rank": None, "sourceValue": 13},
        {"id": "fifa16", "label": "فيفا 16", "rank": None, "sourceValue": 11},
        {"id": "fifa23", "label": "فيفا 23", "rank": None, "sourceValue": 10.3},
        {"id": "fifa12", "label": "فيفا 12", "rank": None, "sourceValue": 10},
    ],
    trap_review=[
        {"candidateId": "fifa15", "cutoffDistance": 1,
         "plausibility": "يتساوى تقريباً مع فيفا 14 وقد يبدو الأعلى لمن يعتمد الذاكرة.", "tooEasy": False},
        {"candidateId": "fifa17", "cutoffDistance": 1,
         "plausibility": "إصدار محبوب لكنه خارج الخمسة الأوائل.", "tooEasy": False},
        {"candidateId": "fifa16", "cutoffDistance": 2,
         "plausibility": "شائع في وقته لكن مبيعاته أقل من القائمة العليا.", "tooEasy": False},
        {"candidateId": "fifa23", "cutoffDistance": 2,
         "plausibility": "أحدث إصدارات الاسم وقد يظنه البعض الأكثر مبيعاً.", "tooEasy": False},
        {"candidateId": "fifa12", "cutoffDistance": 2,
         "plausibility": "ناجح لكنه لا يصل لمستوى القمة.", "tooEasy": False},
    ],
    source="en.as.com/meristation/news/the-best-selling-fifa-in-ea-sports-history",
    tiebreaker="فيفا 15 تتساوى مع فيفا 14 عند 14 مليون تقريباً؛ رُتبت فيفا 14 أولاً وفق ترتيب المصدر لتقدم إصدارها."))

# --- GTA: one-clue x3 ---
video_items.append(one_clue(
    "vg-gta-one-clue-cj", "video-games.gta",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["كارل جونسون", "Carl Johnson"],
    ["شخصية من سلسلة ألعاب العالم المفتوح.",
     "بطل لعبة سان أندرياس.",
     "عاد إلى لوس سانتوس.",
     "من عائلة غروف ستريت.",
     "يعود لحي غروف ستريت ليستعيد مجده."],
    "gta.fandom.com"))
video_items.append(one_clue(
    "vg-gta-one-clue-trevor", "video-games.gta",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["تريفور فيليبس", "تريفور", "Trevor Philips"],
    ["شخصية من سلسلة ألعاب العالم المفتوح.",
     "أحد الأبطال الثلاثة في GTA 5.",
     "يعيش في صحراء ساندي شورز.",
     "صديق مايكل القديم.",
     "شخصيته غير متوقعة ومندفعة."],
    "gta.fandom.com"))
video_items.append(one_clue(
    "vg-gta-one-clue-michael", "video-games.gta",
    "من هي الشخصية التي تصفها الأدلة؟",
    ["مايكل دي سانتا", "مايكل", "Michael De Santa"],
    ["شخصية من سلسلة ألعاب العالم المفتوح.",
     "أحد الأبطال الثلاثة في GTA 5.",
     "متقاعد من الحياة الإجرامية.",
     "يخضع لبرنامج حماية الشهود.",
     "يعيش في روكفورد هيلز مع عائلته."],
    "gta.fandom.com"))

# --- GTA: top-5 ---
video_items.append(top5(
    "vg-gta-top5-best-selling", "video-games.gta",
    "أي من ألعاب غراند ثفت أوتو هذه حققت أعلى المبيعات التاريخية؟",
    "أكثر ألعاب غراند ثفت أوتو مبيعاً",
    "إجمالي المبيعات الرسمية من Take-Two Interactive",
    "ShaneTheGamer / Take-Two (نتائج السنة المالية)",
    "https://www.shanethegamer.com/research/gta-sales/",
    "2026-02-11",
    ranked=[
        {"id": "gta5", "label": "GTA V", "rank": 1, "sourceValue": 225},
        {"id": "sa", "label": "سان أندرياس", "rank": 2, "sourceValue": 27.5},
        {"id": "gta4", "label": "GTA IV", "rank": 3, "sourceValue": 25},
        {"id": "vc", "label": "فايس سيتي", "rank": 4, "sourceValue": 17.5},
        {"id": "gta3", "label": "GTA III", "rank": 5, "sourceValue": 14.5},
    ],
    traps=[
        {"id": "lcs", "label": "ليبرتي سيتي ستوريز", "rank": None},
        {"id": "vcs", "label": "فايس سيتي ستوريز", "rank": None},
        {"id": "ctw", "label": "تشاينا تاون وورز", "rank": None},
        {"id": "eflc", "label": "إيبيسودس فروم ليبرتي سيتي", "rank": None},
        {"id": "online", "label": "جي تي إيه أونلاين", "rank": None},
    ],
    trap_review=[
        {"candidateId": "lcs", "cutoffDistance": 1,
         "plausibility": "إصدار محمول مشهور لكنه لا يتفوق على الأجزاء الرئيسية.", "tooEasy": False},
        {"candidateId": "vcs", "cutoffDistance": 1,
         "plausibility": "من إصدارات المحمول الناجحة لكنه خارج القمة.", "tooEasy": False},
        {"candidateId": "ctw", "cutoffDistance": 2,
         "plausibility": "مشهور ببعدين لكن مبيعاته محدودة.", "tooEasy": False},
        {"candidateId": "eflc", "cutoffDistance": 2,
         "plausibility": "حزمة توسعة قد تُحسب عن طريق الخطأ.", "tooEasy": False},
        {"candidateId": "online", "cutoffDistance": 2,
         "plausibility": "خدمة جماعية لا تُعد لعبة مستقلة بالمبيعات.", "tooEasy": False},
    ],
    source="shanethegamer.com/research/gta-sales"))

# ---------------------------------------------------------------------------
# PUZZLES
# ---------------------------------------------------------------------------
puzzle_items: list[dict] = []
SRC_PUZZLE = "puzzles-community"

def puzzle_scope(slug: str) -> str:
    return f"puzzles.{slug}"

for slug in ("numbers-arithmetic", "logic-deduction", "letters-words",
             "symbols-codes", "general-knowledge"):
    scope = puzzle_scope(slug)
    stem = slug

    if slug == "numbers-arithmetic":
        oc = [
            ("puzzles-numbers-oc-pi", ["باي", "Pi"],
             ["عدد رياضي شهير.",
              "يبدأ بأرقام 3.14.",
              "يمثل نسبة محيط الدائرة لقطرها.",
              "أرقامه لا نهائية.",
              "يُرمز له بحرف يوناني."]),
            ("puzzles-numbers-oc-zero", ["الصفر", "Zero"],
             ["عدد صحيح ليس موجباً ولا سالباً.",
              "يُستخدم لتمثيل اللاشيء.",
              "غيّر تاريخ الرياضيات.",
              "أدخله العرب إلى أوروبا.",
              "عند ضرب أي عدد فيه تكون النتيجة لا شيء."]),
            ("puzzles-numbers-oc-fibonacci", ["فيبوناتشي", "متتالية فيبوناتشي", "Fibonacci"],
             ["تسلسل أرقام شهير.",
              "يبدأ بـ 0 و1.",
              "كل حد يساوي مجموع سابقتيه.",
              "يظهر في الطبيعة.",
              "سُمي على اسم عالم رياضيات إيطالي."]),
        ]
        for iid, answers, clues in oc:
            puzzle_items.append(one_clue(iid, scope, "ما الذي تصفه الأدلة؟", answers, clues, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-numbers-ryo-mult", scope,
                                   "كم يساوي ناتج 7 × 8؟",
                                   ["54", "56", "64", "48"], 1, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-numbers-ryo-prime", scope,
                                   "ما الرقم الأولي بين هذه الأعداد؟",
                                   ["21", "27", "23", "25"], 2, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-numbers-ryo-triangle", scope,
                                   "كم عدد أضلاع المثلث؟",
                                   ["3", "4", "5", "6"], 0, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-numbers-closest-year", scope,
                                    "خمّن عدد أيام السنة الميلادية.", 365, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-numbers-closest-square", scope,
                                    "خمّن ناتج 12 × 12.", 144, 2, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-numbers-closest-minute", scope,
                                    "خمّن عدد ثواني الدقيقة الواحدة.", 60, 1, SRC_PUZZLE))

    elif slug == "logic-deduction":
        oc = [
            ("puzzles-logic-oc-holmes", ["شيرلوك هولمز", "Sherlock Holmes"],
             ["شخصية أدبية خيالية.",
              "محقق مشهور.",
              "يعيش في شارع بيكر.",
              "رفيقه الدكتور واطسون.",
              "يستخدم الاستنتاج في حل الجرائم."]),
            ("puzzles-logic-oc-aristotle", ["أرسطو", "Aristotle"],
             ["فيلسوف يوناني قديم.",
              "تلميذ أفلاطون.",
              "معلم الإسكندر الأكبر.",
              "أسس علم المنطق.",
              "مؤلف كتاب أورغانون."]),
            ("puzzles-logic-oc-liar", ["مفارقة الكذاب", "Liar paradox"],
             ["جملة تتناقض مع نفسها.",
              "تقول هذه الجملة كاذبة.",
              "تُستخدم في دراسة المنطق.",
              "من أشهر المفارقات الذاتية المرجعية.",
              "نسبها الإغريق إلى فيلسوف كريتي."]),
        ]
        for iid, answers, clues in oc:
            puzzle_items.append(one_clue(iid, scope, "ما الذي تصفه الأدلة؟", answers, clues, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-logic-ryo-deduce", scope,
                                   "إذا كان كل الطلاب مجتهدين، وأحمد طالب، فما الاستنتاج الصحيح؟",
                                   ["أحمد مجتهد", "أحمد كسول", "لا يمكن الاستنتاج", "كل المجتهدين طلاب"],
                                   0, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-logic-ryo-cat", scope,
                                   "إذا كانت كل القطط حيوانات، فماذا نستنتج عن قطة سلمى؟",
                                   ["قطة سلمى حيوان", "سلمى قطة", "سلمى حيوان", "لا شيء"],
                                   0, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-logic-ryo-number", scope,
                                   "إذا كان العدد أكبر من 5 وأقل من 7، فما هو؟",
                                   ["5", "6", "7", "8"], 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-logic-closest-alphabet", scope,
                                    "خمّن عدد حروف الأبجدية العربية.", 28, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-logic-closest-hexagon", scope,
                                    "خمّن عدد أضلاع الشكل السداسي.", 6, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-logic-closest-continents", scope,
                                    "خمّن عدد القارات في العالم.", 7, 1, SRC_PUZZLE))

    elif slug == "letters-words":
        oc = [
            ("puzzles-letters-oc-alif", ["الألف", "حرف الألف", "Alif"],
             ["أول حرف في الأبجدية العربية.",
              "يُرسم عمودياً.",
              "أكثر الحروف تكراراً في اللغة العربية.",
              "يُكتب مفرداً أو متصلاً.",
              "يُستخدم للتعريف في بداية الأسماء."]),
            ("puzzles-letters-oc-hamza", ["الهمزة", "Hamza"],
             ["علامة إملائية في اللغة العربية.",
              "تُرسم على الألف أو الواو أو الياء.",
              "تبدو كعين صغيرة.",
              "تظهر في أول الكلمة أو وسطها أو آخرها.",
              "تُكتب فوق الألف في بداية كلمات كثيرة."]),
            ("puzzles-letters-oc-tanween", ["التنوين", "Tanween"],
             ["علامة تلحق آخر الكلمة.",
              "تُنطق كنون ساكنة.",
              "أنواعها فتح وضم وكسر.",
              "تُرسم بعلامتين فوق أو تحت الحرف.",
              "نحو كتاباً وكتابٌ وكتابٍ."]),
        ]
        for iid, answers, clues in oc:
            puzzle_items.append(one_clue(iid, scope, "ما الذي تصفه الأدلة؟", answers, clues, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-letters-ryo-madrasa", scope,
                                   "كم عدد حروف كلمة مدرسة؟",
                                   ["4", "5", "6", "7"], 1, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-letters-ryo-next-dal", scope,
                                   "ما الحرف الذي يلي حرف الدال في الأبجدية؟",
                                   ["الجيم", "الذال", "الراء", "السين"], 1, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-letters-ryo-wasl", scope,
                                   "ما الكلمة التي تبدأ بهمزة وصل؟",
                                   ["استقبال", "أحمد", "إيمان", "أكوان"], 0, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-letters-closest-computer", scope,
                                    "خمّن عدد حروف كلمة كمبيوتر.", 7, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-letters-closest-istiqbal", scope,
                                    "خمّن عدد حروف كلمة استقبال.", 7, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-letters-closest-madrasa", scope,
                                    "خمّن عدد حروف كلمة مدرسة.", 5, 1, SRC_PUZZLE))

    elif slug == "symbols-codes":
        oc = [
            ("puzzles-symbols-oc-morse", ["شفرة مورس", "مورس", "Morse code"],
             ["نظام اتصال قديم.",
              "يعتمد على النقاط والشرطات.",
              "اخترعه رائد التلغراف الأمريكي.",
              "يُستخدم في التلغراف.",
              "إشارة الاستغاثة فيه هي SOS."]),
            ("puzzles-symbols-oc-at", ["أتاب", "At sign"],
             ["رمز يستخدم في الحاسوب.",
              "يفصل اسم المستخدم عن النطاق.",
              "يُعرف في بعض اللهجات باسم القرد.",
              "يظهر في عناوين البريد الإلكتروني.",
              "يُكتب قبل اسم الموقع في العنوان."]),
            ("puzzles-symbols-oc-plus", ["زائد", "علامة الجمع", "Plus"],
             ["علامة حسابية شائعة.",
              "تعني الإضافة.",
              "تُستخدم لجمع الأعداد.",
              "ترمز للأرقام الموجبة.",
              "تُستخدم في العد والجمع."]),
        ]
        for iid, answers, clues in oc:
            puzzle_items.append(one_clue(iid, scope, "ما الذي تصفه الأدلة؟", answers, clues, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-symbols-ryo-plus", scope,
                                   "ما الرمز المستخدم للجمع في الرياضيات؟",
                                   ["+", "-", "×", "÷"], 0, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-symbols-ryo-less", scope,
                                   "ما الرمز الذي يعني أصغر من؟",
                                   ["<", ">", "=", "≥"], 0, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-symbols-ryo-email", scope,
                                   "ما الرمز المستخدم في عناوين البريد الإلكتروني؟",
                                   ["@", "#", "&", "%"], 0, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-symbols-closest-rainbow", scope,
                                    "خمّن عدد ألوان قوس قزح.", 7, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-symbols-closest-sos", scope,
                                    "خمّن عدد الرموز في إشارة SOS بشفرة مورس.", 9, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-symbols-closest-eu-flag", scope,
                                    "خمّن عدد نجوم علم الاتحاد الأوروبي.", 12, 1, SRC_PUZZLE))

    elif slug == "general-knowledge":
        oc = [
            ("puzzles-gk-oc-earth", ["الأرض", "كوكب الأرض", "Earth"],
             ["كوكبنا الذي نعيش عليه.",
              "ثالث كواكب المجموعة الشمسية.",
              "يغطي الماء نحو 71% من سطحه.",
              "يدور حول الشمس في عام.",
              "يُلقب بالكوكب الأزرق."]),
            ("puzzles-gk-oc-electricity", ["الكهرباء", "Electricity"],
             ["شكل من أشكال الطاقة.",
              "تنتقل عبر الأسلاك.",
              "تشغل الأجهزة المنزلية.",
              "وحدة قياسها الفولت.",
              "تومض بها أضواء المنازل."]),
            ("puzzles-gk-oc-arabic", ["العربية", "اللغة العربية", "Arabic"],
             ["لغة سامية قديمة.",
              "لغة القرآن الكريم.",
              "تُكتب من اليمين إلى اليسار.",
              "يتحدثها ملايين البشر.",
              "إحدى اللغات الرسمية للأمم المتحدة."]),
        ]
        for iid, answers, clues in oc:
            puzzle_items.append(one_clue(iid, scope, "ما الذي تصفه الأدلة؟", answers, clues, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-gk-ryo-ocean", scope,
                                   "ما أكبر محيط في العالم؟",
                                   ["المحيط الهادئ", "الأطلسي", "الهندي", "المتجمد الشمالي"],
                                   0, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-gk-ryo-continents", scope,
                                   "كم عدد قارات العالم؟",
                                   ["5", "6", "7", "8"], 2, SRC_PUZZLE))
        puzzle_items.append(ryo_mc("puzzles-gk-ryo-red-planet", scope,
                                   "ما الكوكب المعروف بالكوكب الأحمر؟",
                                   ["الزهرة", "المريخ", "المشتري", "عطارد"], 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-gk-closest-population", scope,
                                    "خمّن عدد سكان الأرض تقريباً بالمليارات.", 8, 1, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-gk-closest-bones", scope,
                                    "خمّن عدد عظام جسم الإنسان البالغ.", 206, 10, SRC_PUZZLE))
        puzzle_items.append(closest("puzzles-gk-closest-spectrum", scope,
                                    "خمّن عدد ألوان الطيف المرئي.", 7, 1, SRC_PUZZLE))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    packs = {
        "football-pack.json": football_items,
        "anime-pack.json": anime_items,
        "video-games-pack.json": video_items,
        "puzzles-pack.json": puzzle_items,
    }
    total = 0
    for name, items in packs.items():
        total += len(items)
        path = OUT / name
        path.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2),
                        encoding="utf-8")
        print(f"wrote {path} ({len(items)} items)")
    print(f"TOTAL {total} items")


if __name__ == "__main__":
    main()
