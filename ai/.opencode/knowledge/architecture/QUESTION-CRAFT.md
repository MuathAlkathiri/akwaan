---
name: akwaan-content
description: >-
  Master workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow

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
3. **`PROVENANCE_AND_WIGOLO_INTEGRITY`**: Valid `sourceMethod` (`WIGOLO`, `EXISTING_APPROVED_ASSET`, `PROGRAMMATIC_PUZZLE`, `INTENTIONAL_TEXT`).
4. **`TOP5_VISIBLE_CANDIDATE_NAME_ONLY`**: 10 candidate cards show names only.
5. **`CONTENT_PROMPT_NOT_MECHANIC_TUTORIAL`**: Zero tutorial wording in prompt.
6. **`RENDERABLE_MEDIA_REQUIRED`**: Assets exist on disk and render properly in browser.

## EVIDENCE ≠ ANSWER
When authoring content, explicitly distinguish between the **Evidence shown to the player** and the **Expected answer**.
Do not accidentally design media intents that source the answer itself when the authored question expects the player to infer the answer from different evidence.
Before sourcing, ask: "What exactly must the player SEE/HEAR?" not "What is the answer?".

## EXPERIENCE-NATIVE DOES NOT AUTOMATICALLY MEAN FUN
Authentic gameplay media is necessary, but not sufficient. A question using authentic media is not automatically good just because it avoids Wikipedia trivia. It must still create a meaningful PLAYER MOMENT ("أوووه عرفتها" or "آه فهمت وش المطلوب").

## PLAYABLE QUESTION GATE
Every authored item must create at least one meaningful interaction, such as:
- recognition, inference, recall, deduction, comparison, consequence reasoning, spatial recognition, mechanic understanding, identity recognition, contextual association, pattern recognition, prediction, risk/reward decision.

**ACTION DESCRIPTION IS NOT A QUESTION:** Reject questions that merely ask the player to restate an obvious action already contained in the media.
- *Weak:* Hear a generic action sound → "وش قاعد يسوي؟"
- *Weak:* See a basic animation → "وش الحركة هذي؟"

**QUESTION PAYOFF TEST:**
Before accepting a question, ask:
1. What exactly is the player doing mentally?
2. What is the discovery/payoff?
3. Would the item still feel satisfying after the answer is revealed?
4. Is the player recognizing/inferencing something meaningful?
5. Is the task more than describing what is already obvious?
If the answer is "the player just says what is visibly/audibly happening", reject the concept.

### Regression Examples
- **God of War Axe Recall (Negative Reference):** Authentic heavy metallic sound, but the task is simply to describe the obvious action ("استدعاء الفأس"). Result: `QUESTION_CONCEPT_FAILURE`. A correct gameplay cue with a weak task is still weak content.
- **Resident Evil Nemesis Audio (Positive Reference):** The cue is distinctive, recognition maps to a clear identity, and the sound itself carries the gameplay challenge. Result: `HUMAN_PRODUCT_APPROVED`.
- **Minecraft Cake (Media Failure):** The prompt ("determine output from this crafting grid") is a great inference concept. The failure was sourcing the cake object instead of the grid. This proves that `GOOD QUESTION + WRONG MEDIA = FAIL`, which is different from `GOOD MEDIA + WEAK QUESTION = FAIL`.

## GENERATION-TIME COGNITIVE-TASK REQUIREMENT
During generation, before writing the actual question prompt, the model MUST define:
1. Experience shape
2. Player cognitive task
3. Expected payoff
4. Modality
5. Evidence shown
6. Expected answer
If the cognitive task is weak (e.g. trivial description), the idea must be discarded before the prompt is drafted.


## THE QUESTIONNESS GATE
Every standard question item must have:
1. A clear interrogative target.
2. One concrete expected answer.
3. Wording understandable immediately (the player should hear/read it and instantly know "وش يبغى مني أجاوب؟").
4. A short natural player-facing sentence.
5. No need for the player to infer what kind of response the game wants.

Reject content that reads primarily like:
- a tactical scenario ("What should you immediately do?")
- coaching/advice
- a hypothetical discussion
- a story followed by a vague task

## IDENTIFICATION IS NOT AUTOMATICALLY BAD
Do not blanket-reject "who?", "what?", "which?", or "where?" questions. Simple audio or visual recognition is EXCELLENT when the underlying evidence is distinctive, memorable, and satisfying to recognize (e.g., identifying Resident Evil's Nemesis from his distinct audio).
`SIMPLE QUESTION + STRONG EVIDENCE = CAN BE EXCELLENT`

## COMPLEXITY IS NOT QUALITY
- `MORE INFERENCE != BETTER QUESTION`
- `MORE WORDS != MORE PLAYABLE`
- `TACTICAL SCENARIO != SIGNATURE MOMENT`
Do NOT start from a "Cognitive Task label" and reverse-engineer a complicated prompt around it.

## PLAYER-FACING WORDING TEST
Before accepting an item, hide all metadata (Experience Shape, Cognitive Task, etc.). Look ONLY at the exact question, expected answer, and media evidence.
1. Does this look like an actual game question?
2. Is it clear immediately?
3. Is the answer specific?
4. Is it fun because of the subject/evidence?
5. Would it work without an explanation underneath telling us why it is clever?
If it only sounds good after reading its QA metadata: REJECT IT.

### OVERCORRECTION REGRESSION EXAMPLE
**Regression**: `GOOD GAMEPLAY IDEA + CONVERSATIONAL/SCENARIO PROMPT = FAIL`
*Context*: The agent found strong concepts (e.g., GTA Oppressor lock-on, CoD Sniper glint) but framed them as tactical scenarios ("What is the worst vehicle you expect behind you?", "What must you immediately do to survive?") instead of crisp trivia. This made them feel like coaching exams rather than Akwaan questions.

## THE EVIDENCE CHOOSES THE QUESTION SHAPE
Akwaan questions do NOT need to follow one fixed cognitive pattern. There is NO requirement that every question must contain multi-step inference or feel "deep" to be good.
The BEST question shape depends on the strength and nature of the evidence.

A simple identification question is fully valid — and can be excellent — when the evidence itself creates a strong recognition moment.
- `THE EVIDENCE CHOOSES THE QUESTION SHAPE`
- `SIMPLE IDENTIFICATION IS VALID WHEN THE EVIDENCE IS STRONG`
- `DO NOT ADD ARTIFICIAL COMPLEXITY TO A GOOD RECOGNITION MOMENT`
- `MORE ANSWER PARTS != BETTER QUESTION`

**Valid Question Shapes (When supported by strong evidence):**
- **Voice line → character:** `مين الشخصية اللي تقول هذي الجملة؟` (Do not artificially turn it into: `مين الشخصية؟ وش قدرتها؟` unless the media genuinely supports that richer question and it is more fun).
- **Ability visual → ability name:** `وش اسم هذي القدرة؟`
- **Weapon sound → weapon:** `وش السلاح اللي يصدر هذا الصوت؟`
- **Gameplay cue → meaning:** `وش يعني هذا التنبيه؟`
- **Item/object visual → identity:** `وش هذا؟` (If the item is genuinely recognizable and not trivial filler).
- **Ability/status → effect:** `وش تأثير هذي القدرة؟` (This is ONE possible shape, not the default for every item).

Do not confuse `SIMPLE` with `SHALLOW`.
`STRONG SUBJECT / EVIDENCE` → `BEST NATURAL QUESTION FOR THAT EVIDENCE` → `SATISFYING RECOGNITION` → `CLEAR ANSWER`.
Do not do: `STRONG EVIDENCE` → `FORCE EXTRA INFERENCE` → `MAKE QUESTION LONGER` → `CALL IT BETTER`.

**Question First means:**
Knowing what the player is being asked, the expected answer, why the interaction is satisfying, and the exact evidence required BEFORE sourcing media.
It does NOT mean every question needs two parts, mechanical explanation, deduction, or avoiding direct identification. Do not let Question First become "Forced Complexity."
