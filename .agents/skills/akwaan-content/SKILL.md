---
name: akwaan-content
description: >-
  Master workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow


# MANDATORY CONTEXT RESOLUTION (FAIL-CLOSED)
You MUST NOT generate any content without first resolving the exact authoring context.
1. Determine the canonical `mechanic`, `world`, and `scope`.
2. Execute: `python3 ai/scripts/resolve_authoring_context.py --mechanic <slug> --world <slug> --scope <slug>`
3. Read the output. If the script exits with an error (e.g., `AUTHORING_BLOCKED`), you MUST HALT GENERATION immediately and report the blocker. Do NOT fall back to your own knowledge.
4. Your output artifact MUST include the `_authoringContext` metadata block exactly as produced by the script.

## 0. Canonical Product Principles (MANDATORY RESET R3)

> **1. BATCH-LEVEL MEDIA TARGET: >= 90% OF ALL QUESTIONS**:
> Akwaan is an audiovisual party game. At least **>= 90% of all authored items across the entire batch** must carry meaningful media (Image, Audio, Clip, or Programmatic Diagram).
> - **Top-5**: Kept as interaction-native text (10 candidate cards, names only). No decorative images.
> - **Football Bomb**: Exactly 1 name-completion item per 3-item scope set (famous surname in prompt -> less familiar first name in answer). The remaining 2/3 are media recognition.
> - **Anime, Video Games, Puzzles Bomb**: **100% media-based recognition/micro-puzzles**. No name-completion templates outside Football.
> - **Distributed Information**: Utilizes visual clue cards, private diagrams, maps, or coordinate fragments where visual clues enhance co-op deduction.
>
> **2. EXTRA CLUE WITH MEDIA = FATAL HARD ERROR (`EXTRA_CLUE_WITH_MEDIA`)**:
> When media is present, **NEVER provide descriptive clues, biographies, record trivia, or adjectives** in the prompt text.
> - ❌ `"من هذا الحارس صاحب الرقم القياسي في الشباك النظيفة...؟"` (FATAL CLUE LEAK)
> - ✅ `"من هذا الحارس؟"` (CLEAN & NEUTRAL)
> - ❌ `"وش اسم هذا الاستاد الذي احتضن نهائي 2008...؟"` (FATAL CLUE LEAK)
> - ✅ `"وش اسم هذا الملعب؟"` (CLEAN & NEUTRAL)
> The prompt states WHAT the player must identify (2–6 words), NOT facts ABOUT the subject.
>
> **3. STRICT MEDIA PROVENANCE & WIGOLO WORKFLOW**:
> - **`EXISTING_APPROVED_ASSET`**: Applies ONLY to assets proven to belong to previously human-approved / Production-approved items (e.g. Marhala Batch 01).
> - **`WIGOLO`**: The mandatory default acquisition workflow for all newly sourced real-world, anime, and video game media.
> - **`PROGRAMMATIC_PUZZLE`**: Allowed exclusively for authored puzzle diagrams and geometric constructions.
> - **Synthetic generated media for ordinary recognition is STRICTLY FORBIDDEN (0 count)**.
>
> **4. CONTEXTUAL ZERO ANSWER LEAKAGE (`CONTEXTUAL_ANSWER_LEAKAGE`)**:
> Zero Answer Leakage is **CONTEXTUAL** — do not ask *"Is there a logo?"*, ask: *"Does this visible element materially reveal what the player is required to answer?"*
> - ✅ **Permissible Branding**: Visible manufacturer logo/crest when the question asks for model/trim (e.g. visible Porsche crest + prompt `"وش هذي الفئة؟"` + answer `"GT3 RS"`).
> - ❌ **Fatal Leakage (Direct Model/Trim Text)**: Visible model emblems, script, trim badges, or plate text that directly expose the required answer (e.g. readable `"GT3 RS"`, `"GT-R"`, `"F40"`).
> - ❌ **Fatal Leakage (Brand MCQ / RYO)**: Visible brand logo when the multiple-choice options are different brands (e.g. options: `Porsche 911`, `BMW M4`, `Mercedes-AMG GT`, `Audi RS5`).

>
> **5. EXPERIENCE OVER KNOWLEDGE (GLOBAL AUTHORING RULE)**:
> Akwaan content must make players feel they are experiencing the subject, not taking a Wikipedia quiz.
> - **EXPERIENCE-NATIVE (A - Preferred):** Gameplay situations, UI elements, audio cues (Ultimate lines, Killstreaks), mechanics, spatial/visual recognition, and situational knowledge. The player reaction should be "أوووه أعرفها!"
> - **KNOWLEDGE-THROUGH-EXPERIENCE (B - Allowed):** Factual questions that a normal player naturally learns from experiencing the Scope itself.
> - **META-TRIVIA (C - Default Rejection):** Release dates, developer names, sales figures, award counts, or generic "what year..." questions. Reject these by default unless there is a clear reason it creates excellent gameplay.
> - *Textual questions must evoke the experience.* Avoid sterile formulation like "ما اسم المدينة التي تقع فيها GTA V؟". Prefer: "تشوف Vinewood فوق الجبل وأنت تلف بالمدينة — وين أنت؟"

>
> **6. MEDIA FIRST — TEXT ONLY WHEN IT EARNS ITS PLACE (GLOBAL AUTHORING RULE)**:
> Akwaan content should default toward visual/audio-backed experiences whenever media materially improves gameplay. Media is not decoration; if removing it leaves the same question and difficulty, it has not earned its place.
> - **World-Level Media Coverage:** Target minimum floors of **10% audio-native** and **10% image-native** content (when compatible mechanics exist). These are absolute floors, not ideal targets. Text-only should be a minority whenever the World and mechanic mix can support richer media.
> - **Mechanic Compatibility Overrides:** Never force media into an incompatible mechanic. For example, forward **Bomb explicitly bans audio** due to clock semantics. Satisfy audio floors using audio-compatible mechanics (e.g., Marhala, RYO, Signatures).
> - **Text-Only Validation:** Allowed only when the wording creates a strong interaction, knowledge is naturally experience-derived, and media would add no meaningful value. Text must not dominate merely because it is cheaper or faster to author.

>
> **7. MEDIA-LED CONCISE PHRASING (GLOBAL AUTHORING RULE)**:
> When media already carries the context, the text prompt should only briefly frame what the media represents and state what the player must answer.
> - **No Over-Explanation:** Do not restate details already obvious from the image/audio.
> - **No Player-Directed Conversational Filler:** Avoid "تعرف هذي؟", "سمعت الصوت؟", "وش تسوي هنا؟", "لاحظ الصورة". Describe the media or task itself neutrally.
> - **No Over-Compression:** Minimal wording is NOT the goal. Avoid lifeless "مين؟", "وين؟", "حق مين؟". The phrasing should feel complete and intentional.
> - **Tone:** Concise, neutral, natural, clear, Saudi-friendly Arabic. Not formal quiz language, not chatty, not robotic.
> - **Hierarchy:** Experience determines the question -> Media carries the experience -> Text supplies the missing framing/task.

---

## 1. World-Native Bomb Interaction Contracts

- **Cars Bomb**:
  - **Fast-Answer Naming**: Prefer the **SHORTEST widely recognized model / trim / designation** that uniquely identifies the intended answer (e.g. `GT3 RS`, `GT-R`, `F40`). Bomb rewards rapid recognition speed, NOT typing speed. Do not require full formal manufacturer names, chassis codes, or full marketing titles when the short designation is unambiguous.
  - **Brevity Must Preserve Uniqueness**: Do not shorten answers so aggressively that they become ambiguous. Generic names (`Turbo`, `Sport`, `RS`, `GT`) are REJECTED if multiple plausible vehicles could match them. Unique-answer defensibility strictly overrides brevity.
  - **Prompt & Answer Granularity Alignment**: The prompt must tell the player what level they are identifying:
    - Trim / Specific variant: `"وش هذي الفئة؟"` -> e.g. `GT3 RS` (Target: Porsche 911 GT3 RS 992)
    - Model line: `"وش هذا الموديل؟"` -> e.g. `GT-R` (Target: Nissan GT-R R35), `F40` (Target: Ferrari F40)
  - **Accepted Answers Normalization**: Include punctuation, spacing, and standard phonetic Arabic/English transliterations (e.g., `GT-R`, `GTR`, `GT R`, `جي تي آر`). Do NOT accept broader manufacturer-only fallbacks (e.g. do NOT accept `Nissan` for `GT-R`).
  - **Contextual Badging**: Manufacturer logos may remain visible, but badges/text directly exposing the requested model or trim must be cropped, obscured, or retouched.
- **Football Bomb**:
  - Max 1 name-completion per 3-item set (`NAME_FRAGMENT`: famous surname -> first name, e.g. `"وش الاسم الأول لمودريتش؟"` -> `"لوكا"`).
  - Min 2 player/stadium/crest image recognition items (`"من هذا اللاعب؟"`, `"وش اسم هذا الملعب؟"`).
- **Anime Bomb**:
  - 100% media recognition (`"من هذه الشخصية؟"`, `"وش اسم هذه المنظمة؟"`, `"وش اسم هذا الشيء؟"`).
- **Video Games Bomb**:
  - 100% game-native media (`"وش اسم هذا السلاح؟"`, `"وش اسم هذا المكان؟"`, `"وش هذا الصوت؟"`, `"من هذه الشخصية؟"`).
- **Puzzles Bomb**:
  - 100% rapid micro-puzzle visual targets (shape recognition, pattern step, visual count, spatial transformation).

---

## 2. Top-5 Keep-or-Give Contract

- **Prompt**: Challenge Topic ONLY (e.g. `"أكثر 5 لاعبين تسجيلًا للأهداف في تاريخ البريميرليغ"`). Zero tutorial text (`"رتب"`, `"تجنب الفخاخ"`).
- **Visible Candidate Cards**: **ENTITY NAMES ONLY** (`"ألان شيرر"`, `"هاري كين"`, etc.). Zero stats, numbers, ranks, or notes.
- **Hidden Metadata**: Exact ranks (1–5 or null), metrics, evidence, and cutoff dates.

---

## 3. Mandatory QA Hard Gates

1. **`BATCH_MEDIA_TARGET_90_PERCENT`**: >= 90% of the entire batch carries meaningful media (>= 173/192).
2. **`EXTRA_CLUE_WITH_MEDIA`**: Zero descriptive adjectives or answer-defining clues when media is present.
3. **`CONTEXTUAL_ANSWER_LEAKAGE`**: Zero direct answer exposure in image (model/trim badges matching answer must be obscured/cropped; brand logos permitted when identifying model/trim).
4. **`BOMB_FAST_ANSWER_UNIQUENESS`**: Short Bomb answers uniquely identify the target without ambiguity; prompt granularity matches answer granularity.
5. **`PROVENANCE_AND_WIGOLO_INTEGRITY`**: Valid `sourceMethod` (`WIGOLO`, `EXISTING_APPROVED_ASSET`, `PROGRAMMATIC_PUZZLE`, `INTENTIONAL_TEXT`).
6. **`TOP5_VISIBLE_CANDIDATE_NAME_ONLY`**: 10 candidate cards show names only.
7. **`CONTENT_PROMPT_NOT_MECHANIC_TUTORIAL`**: Zero tutorial wording in prompt.
8. **`RENDERABLE_MEDIA_REQUIRED`**: Assets exist on disk and render properly in browser.

### Pre-Generation Cognitive Planning
Before writing the prompt for any new item, you MUST explicitly define the following parameters to ensure it passes the `PLAYABLE QUESTION GATE`:
1. **Experience shape:** How the item will feel to play.
2. **Player cognitive task:** What mental operation the player performs (e.g. inference, pattern recognition, spatial recall).
3. **Expected payoff:** The satisfying "Aha!" moment.
4. **Modality:** Text, Image, Audio, or Video.
5. **Evidence shown:** Exactly what the player will see or hear.
6. **Expected answer:** The concept to be deduced.

If the cognitive task is weak (e.g., merely describing an obvious action), discard the concept immediately and do not generate the item. Experience-native authenticity does not automatically equal fun.

## CRITICAL RULE: THE QUESTIONNESS GATE
Akwaan content must ultimately be a GOOD QUESTION. Do not confuse complexity with quality.
- `MORE INFERENCE != BETTER QUESTION`
- `TACTICAL SCENARIO != SIGNATURE MOMENT`
- Start with strong evidence, then ask the cleanest, most direct actual question about it.
- Simple identification (who/what/where) + Strong Evidence = EXCELLENT. Do not artificially force tactical inference.
- Run the **Player-Facing Wording Test**: Hide all your clever metadata. Does the prompt alone read like a crisp, fun trivia question? If not, rewrite or reject.

- `THE EVIDENCE CHOOSES THE QUESTION SHAPE`. If the evidence is a distinctive voice line, "مين الشخصية؟" is a valid and excellent shape. Do not add artificial complexity (e.g. asking for ability + effect) just to make it feel deep.
- `MORE ANSWER PARTS != BETTER QUESTION`.
- `VARIETY IS ENFORCED ACROSS THE BATCH, NOT BY OVERLOADING EACH QUESTION`. Ensure variety over the batch, but let each individual item use the natural question shape for its media.


## Concept Identity & Novelty (Phase 2C)

1. **Emit Concept Metadata**: Every authored item MUST include a `conceptMetadata` block inside its `metadata` object:
   ```json
   "metadata": {
     "conceptKey": {
       "subject": "timed-finishing-green-indicator",
       "askedProperty": "meaning"
     }
   }
   ```
2. **Teach the Taste, Not the Answer**: `EXEMPLAR != GENERATION TARGET`. Do not use concrete items from KNOWLEDGE.md or EXEMPLARS.md as seeds for your generation. Extract the *lesson* (what makes the experience good) and generate a completely *novel* subject.
3. **Fresh Content Only**: Check existing data folders before generating to avoid accidental duplication.
