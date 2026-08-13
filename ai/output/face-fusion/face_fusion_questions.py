#!/usr/bin/env python3
"""
Face Fusion — Football Question Definitions (Provider-Independent).

Four reviewed face-fusion questions with generation status set to
``pending_provider``.  No image is generated here.  The definitions
are ready to be passed to any registered ``FaceFusionImageProvider``
when a real backend is connected.

Usage
-----
    from face_fusion_questions import QUESTIONS
    for q in QUESTIONS:
        print(q["question"], q["playerA"], q["playerB"])
"""

from __future__ import annotations

import json
import os
from typing import Any

# ─── Question Definitions ──────────────────────────────────────────────

QUESTIONS: list[dict[str, Any]] = [
    # ── Easy 1 ──────────────────────────────────────────────────────────
    {
        "question": "من هم هذول اللاعبين؟",
        "playerA": "Cristiano Ronaldo",
        "playerB": "Mohamed Salah",
        "answer": "كريستيانو رونالدو ومحمد صلاح",
        "acceptedAnswers": [
            "كريستيانو رونالدو ومحمد صلاح",
            "محمد صلاح وكريستيانو رونالدو",
            "رونالدو وصلاح",
            "صلاح ورونالدو",
            "Cristiano Ronaldo and Mohamed Salah",
            "Mohamed Salah and Cristiano Ronaldo",
        ],
        "difficulty": "easy",
        "imagePrompt": (
            "Single photorealistic front-facing portrait of a male footballer "
            "who looks like a real person that never existed. The face naturally "
            "fuses Cristiano Ronaldo and Mohamed Salah into one believable "
            "identity. Ronaldo contributes the strong chiseled jawline, defined "
            "cheekbones, structured forehead, and intense focused eyebrows. "
            "Salah contributes the warm brown eyes, fuller rounded beard, "
            "natural darker skin tone, and soft hair texture. One face, one nose, "
            "one mouth, one pair of eyes, one jawline. Short dark neatly styled "
            "hair. Neutral confident expression. Looking directly at camera. "
            "Centered chest-up composition. Ultra photorealistic with visible "
            "skin pores, natural skin texture, and soft studio lighting. "
            "Plain blurred background. No accessories, no sunglasses, no hat, "
            "no text, no watermark, no logo. The viewer should immediately "
            "recognise both players in this single synthetic face."
        ),
        "negativePrompt": (
            "split face, half and half, two faces, double exposure, "
            "transparency, overlay, ghosting, morph filter artifacts, "
            "duplicated features, two noses, two mouths, four eyes, "
            "unbalanced blend, one person dominating, distorted proportions, "
            "asymmetrical face, unrealistic skin, waxy skin, plastic look, "
            "mannequin, jersey, football kit, logo, text, watermark, "
            "sunglasses, hat, side profile, blurry, low resolution, "
            "cartoon, illustration, 3D render, digital art"
        ),
        "explanation": (
            "Pairing the two most globally recognised footballers of this "
            "generation. Ronaldo's sharp Mediterranean-Portuguese features "
            "contrast with Salah's warmer Egyptian features, creating a "
            "balanced fusion where neither dominates. The GOAT debate makes "
            "this pair instantly enjoyable for all football fans."
        ),
        "generationStatus": "pending_provider",
    },
    # ── Easy 2 ──────────────────────────────────────────────────────────
    {
        "question": "من هم هذول اللاعبين؟",
        "playerA": "Neymar Jr.",
        "playerB": "Kylian Mbappé",
        "answer": "نيمار وكيليان مبابي",
        "acceptedAnswers": [
            "نيمار وكيليان مبابي",
            "كيليان مبابي ونيمار",
            "نيمار ومبابي",
            "مبابي ونيمار",
            "Neymar and Kylian Mbappé",
            "Kylian Mbappé and Neymar",
        ],
        "difficulty": "easy",
        "imagePrompt": (
            "Single photorealistic front-facing portrait of a male footballer "
            "who looks like a real person that never existed. The face naturally "
            "fuses Neymar Jr. and Kylian Mbappé into one believable identity. "
            "Neymar contributes the expressive almond-shaped eyes, slightly "
            "smaller nose, and subtle playful mouth expression. Mbappé contributes "
            "the sharper angular jawline, higher cheekbones, and athletic facial "
            "structure. One face, one nose, one mouth, one pair of eyes, one "
            "jawline. Short dark hair with a subtle fade. Calm confident "
            "expression with a slight natural smile. Looking directly at camera. "
            "Centered chest-up composition. Ultra photorealistic with visible "
            "skin pores, natural skin texture, and soft studio lighting. "
            "Plain blurred background. No accessories, no sunglasses, no hat, "
            "no text, no watermark, no logo."
        ),
        "negativePrompt": (
            "split face, half and half, two faces, double exposure, "
            "transparency, overlay, ghosting, morph filter artifacts, "
            "duplicated features, two noses, two mouths, four eyes, "
            "unbalanced blend, one person dominating, distorted proportions, "
            "asymmetrical face, unrealistic skin, waxy skin, plastic look, "
            "mannequin, jersey, football kit, logo, text, watermark, "
            "sunglasses, hat, side profile, blurry, low resolution, "
            "cartoon, illustration, 3D render, digital art"
        ),
        "explanation": (
            "The former PSG superstar duo. Neymar's expressive Brazilian "
            "features and Mbappé's sharp French athletic look create a "
            "compelling fusion. Their history as teammates at PSG makes "
            "this pairing instantly recognisable and enjoyable for football "
            "fans following European football."
        ),
        "generationStatus": "pending_provider",
    },
    # ── Medium ──────────────────────────────────────────────────────────
    {
        "question": "من هم هذول اللاعبين؟",
        "playerA": "Ronaldinho",
        "playerB": "Zlatan Ibrahimović",
        "answer": "رونالدينيو وزلطان إبراهيموفيتش",
        "acceptedAnswers": [
            "رونالدينيو وزلطان إبراهيموفيتش",
            "زلطان إبراهيموفيتش ورونالدينيو",
            "رونالدينيو وإبراهيموفيتش",
            "إبراهيموفيتش ورونالدينيو",
            "Ronaldinho and Zlatan Ibrahimović",
            "Zlatan Ibrahimović and Ronaldinho",
        ],
        "difficulty": "medium",
        "imagePrompt": (
            "Single photorealistic front-facing portrait of a male footballer "
            "who looks like a real person that never existed. The face naturally "
            "fuses Ronaldinho and Zlatan Ibrahimović into one believable "
            "identity. Ronaldinho contributes the warm expressive eyes, joyful "
            "smile with slightly visible teeth, and wider nose. Zlatan contributes "
            "the strong sharp Nordic jawline, prominent high cheekbones, and "
            "intense confident gaze. One face, one nose, one mouth, one pair "
            "of eyes, one jawline. Longer dark styled hair tied back slightly. "
            "Confident charismatic expression. Looking directly at camera. "
            "Centered chest-up composition. Ultra photorealistic with visible "
            "skin pores, natural skin texture, and soft studio lighting. "
            "Plain blurred background. No accessories, no sunglasses, no hat, "
            "no text, no watermark, no logo."
        ),
        "negativePrompt": (
            "split face, half and half, two faces, double exposure, "
            "transparency, overlay, ghosting, morph filter artifacts, "
            "duplicated features, two noses, two mouths, four eyes, "
            "unbalanced blend, one person dominating, distorted proportions, "
            "asymmetrical face, unrealistic skin, waxy skin, plastic look, "
            "mannequin, jersey, football kit, logo, text, watermark, "
            "sunglasses, hat, side profile, blurry, low resolution, "
            "cartoon, illustration, 3D render, digital art"
        ),
        "explanation": (
            "Two of the most charismatic football personalities ever. "
            "Ronaldinho's joyful Brazilian flair and Zlatan's intense Nordic "
            "confidence are opposite energies that make this fusion delightful. "
            "Football fans recognise both instantly, but the contrasting facial "
            "structures create a medium-level identification challenge."
        ),
        "generationStatus": "pending_provider",
    },
    # ── Hard ────────────────────────────────────────────────────────────
    {
        "question": "من هم هذول اللاعبين؟",
        "playerA": "Luka Modrić",
        "playerB": "Kevin De Bruyne",
        "answer": "لوكا مودريتش وكيفن دي بروين",
        "acceptedAnswers": [
            "لوكا مودريتش وكيفن دي بروين",
            "كيفن دي بروين ولوكا مودريتش",
            "مودريتش ودي بروين",
            "دي بروين ومودريتش",
            "Luka Modrić and Kevin De Bruyne",
            "Kevin De Bruyne and Luka Modrić",
        ],
        "difficulty": "hard",
        "imagePrompt": (
            "Single photorealistic front-facing portrait of a male footballer "
            "who looks like a real person that never existed. The face naturally "
            "fuses Luka Modrić and Kevin De Bruyne into one believable identity. "
            "Modrić contributes the sharp determined eyes, defined cheekbones, "
            "and focused intelligent brow. De Bruyne contributes the fuller "
            "facial structure, light natural stubble beard, and composed calm "
            "mouth expression. One face, one nose, one mouth, one pair of eyes, "
            "one jawline. Short brown hair with natural texture. Focused "
            "thoughtful expression. Looking directly at camera. Centered "
            "chest-up composition. Ultra photorealistic with visible skin pores, "
            "natural skin texture, and soft studio lighting. Plain blurred "
            "background. No accessories, no sunglasses, no hat, no text, "
            "no watermark, no logo."
        ),
        "negativePrompt": (
            "split face, half and half, two faces, double exposure, "
            "transparency, overlay, ghosting, morph filter artifacts, "
            "duplicated features, two noses, two mouths, four eyes, "
            "unbalanced blend, one person dominating, distorted proportions, "
            "asymmetrical face, unrealistic skin, waxy skin, plastic look, "
            "mannequin, jersey, football kit, logo, text, watermark, "
            "sunglasses, hat, side profile, blurry, low resolution, "
            "cartoon, illustration, 3D render, digital art"
        ),
        "explanation": (
            "Two midfield geniuses who defined modern football. Modrić's "
            "sharp Croatian elegance and De Bruyne's Belgian precision are "
            "both unmistakable to dedicated fans. Neither has an overly "
            "dominant visual feature, making the fusion subtle and the "
            "identification genuinely rewarding for football enthusiasts."
        ),
        "generationStatus": "pending_provider",
    },
]


# ─── Export Helpers ─────────────────────────────────────────────────────

def questions_to_json(indent: int = 2) -> str:
    """Serialise all questions to a JSON string."""
    return json.dumps(QUESTIONS, ensure_ascii=False, indent=indent)


def save_questions_json(output_path: str | None = None) -> str:
    """Persist questions to a JSON file, returning the path."""
    if output_path is None:
        output_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "face_fusion_questions.json",
        )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(QUESTIONS, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(QUESTIONS)} questions to {output_path}")
    return output_path


# ─── Validation ─────────────────────────────────────────────────────────

def validate_questions() -> list[str]:
    """Run validation rules and return a list of issues (empty = pass)."""
    issues: list[str] = []

    if not QUESTIONS:
        issues.append("No questions defined.")
        return issues

    used_players: set[str] = set()
    used_pairs: set[tuple[str, str]] = set()
    difficulties = {"easy": 0, "medium": 0, "hard": 0}

    for i, q in enumerate(QUESTIONS):
        idx = i + 1
        a, b = q["playerA"], q["playerB"]

        # Required fields
        for field in ("question", "playerA", "playerB", "answer",
                      "acceptedAnswers", "difficulty", "imagePrompt",
                      "negativePrompt", "explanation", "generationStatus"):
            if field not in q:
                issues.append(f"Q{idx}: Missing field '{field}'.")

        # Question format
        if q.get("question") != "من هم هذول اللاعبين؟":
            issues.append(f"Q{idx}: Question must be exactly 'من هم هذول اللاعبين؟'.")

        # Difficulty breakdown
        if q.get("difficulty") in difficulties:
            difficulties[q["difficulty"]] += 1
        else:
            issues.append(f"Q{idx}: Invalid difficulty '{q.get('difficulty')}'.")

        # Player uniqueness
        if a in used_players:
            issues.append(f"Q{idx}: Player '{a}' reused.")
        if b in used_players:
            issues.append(f"Q{idx}: Player '{b}' reused.")
        used_players.add(a)
        used_players.add(b)

        # Pair uniqueness (order-independent)
        pair = tuple(sorted([a, b]))
        if pair in used_pairs:
            issues.append(f"Q{idx}: Duplicate pair '{a}' + '{b}'.")
        used_pairs.add(pair)

        # Answer must contain both player names (Arabic rendering)
        answer = q.get("answer", "")
        arabic_names = [
            "كريستيانو رونالدو", "محمد صلاح",
            "نيمار", "كيليان مبابي",
            "رونالدينيو", "زلطان إبراهيموفيتش",
            "لوكا مودريتش", "كيفن دي بروين",
        ]
        matches = sum(1 for name in arabic_names if name in answer)
        if matches < 2:
            issues.append(f"Q{idx}: Answer must reference both players.")

        # acceptedAnswers must have Arabic and English variants
        has_arabic = any("\u0600" <= c <= "\u06FF" for ans in q.get("acceptedAnswers", []) for c in ans)
        has_english = any("a" <= c.lower() <= "z" for ans in q.get("acceptedAnswers", []) for c in ans)
        if not has_arabic:
            issues.append(f"Q{idx}: acceptedAnswers must include Arabic variants.")
        if not has_english:
            issues.append(f"Q{idx}: acceptedAnswers must include English variants.")

        # generationStatus
        if q.get("generationStatus") != "pending_provider":
            issues.append(f"Q{idx}: generationStatus must be 'pending_provider'.")

    # Difficulty counts: 2 Easy, 1 Medium, 1 Hard
    if difficulties.get("easy") != 2:
        issues.append(f"Expected 2 Easy questions, got {difficulties.get('easy')}.")
    if difficulties.get("medium") != 1:
        issues.append(f"Expected 1 Medium question, got {difficulties.get('medium')}.")
    if difficulties.get("hard") != 1:
        issues.append(f"Expected 1 Hard question, got {difficulties.get('hard')}.")

    return issues


# ─── CLI ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("  FACE FUSION — Football Question Definitions")
    print("=" * 60)

    # Validate
    issues = validate_questions()
    if issues:
        print(f"\n  Validation FAILED ({len(issues)} issues):")
        for issue in issues:
            print(f"    • {issue}")
        sys.exit(1)
    else:
        print(f"\n  ✓ All {len(QUESTIONS)} questions validated successfully.")

    # Export
    json_path = save_questions_json()
    print(f"\n  Questions exported to: {json_path}")

    # Summary
    print(f"\n  Summary:")
    for q in QUESTIONS:
        print(f"    [{q['difficulty']:>6}] {q['playerA']} + {q['playerB']}")

    print(f"\n  Generation status: {QUESTIONS[0]['generationStatus']}")
    print(f"  Image provider:    Not configured (placeholder active)")
    print(f"  To generate:       Connect a FaceFusionImageProvider")
    print()
