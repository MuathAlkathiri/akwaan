# Question Craft Contract

## 0. Canonical Principle

> **"Never begin by asking what trivia facts can I write.**
> **Begin by asking what interaction/question shape would be fun to play.**
> **Then find a recognizable, fair fact that fits that shape."**

Content in Akwaan exists to create active gameplay moments: rapid recognition, suspense, bluffing, cooperation, lively team debate, and memorable reveals. A question that is merely an encyclopedia fact wrapped in `"ما هو / من هو"` is a failure of question craft.

---

## 1. The 12 Pillars of Question Craft

Every authored question must be evaluated against these 12 core standards:

1. **Immediate Understandability**:
   The player must grasp the question premise and target in <3 seconds. Pacing is paramount in multiplayer party games.
2. **Fun Reveal**:
   The answer reveal must trigger an emotional payoff: a laugh, an "aha!" eureka moment, a fist-pump, or playful team banter.
3. **Recognizable Knowledge**:
   Test salient, culturally resonant, or deeply authentic franchise lore—never obscure footnote trivia chosen merely for artificial difficulty.
4. **Short, Readable Wording**:
   Keep player-facing prompts concise, punchy, and mobile-screen friendly (<120 characters preferred for rapid mechanics).
5. **Group Discussion & Spectator Readability**:
   Questions should provoke spontaneous verbal reactions among teammates and remain easily followable for spectators watching the big screen.
6. **Pace & Rhythm Suitability**:
   Calibrate question structure to the mechanic time envelope (e.g. 5–10s rapid reflex for Bomb vs 25s bluffing for RYO vs 45s puzzle-solving for Co-op).
7. **Varied Cognitive Interaction**:
   Rotate the mental task required: name fragment completion, sequence deduction, visual detail recognition, reverse association, attribute recall, or category triangulation.
8. **Difficulty != Fun**:
   Difficulty and fun are independent axes. A simple question can be wildly fun (e.g. `"بيلينغهام... وش اسمه الأول؟" -> جود`); a hard question must be deeply satisfying and fair, not tedious.
9. **Low Ambiguity & Single Truth**:
   The question must point deterministically to exactly one indisputable canonical answer. Subjective superlatives ("الأفضل", "الأجمل") are forbidden unless anchored to objective metrics.
10. **Zero Answer Leakage**:
    Absolute prohibition against prompts, clues, media, filenames, or option sets leaking or trivially hinting at the answer target.
11. **Natural Conversational Arabic Copy**:
    Use clean, natural, Saudi-friendly phrasing suited for spoken group play (e.g. `"وش اسمه الأول؟"` instead of verbose classical phrasing like `"ما هو الاسم الأول لهذا اللاعب؟"`).
12. **Defensible Answer Normalization**:
    Every question must provide a canonical answer plus all legitimate Arabic spellings, transliterations, and English variants in `acceptedAnswers`.

---

## 2. Decoupling Question Archetype from Difficulty

Archetype and difficulty are **separate axes**:
- The same question archetype can be authored across Easy, Medium, or Hard levels.
- What creates legitimate Hard difficulty:
  - **Deeper Domain Recall**: Requires specific, authentic knowledge of secondary characters, historical milestones, or advanced mechanics.
  - **High Plausible Alternatives**: Demands precision to distinguish between close canonical concepts.
  - **Reduced Clue Directness**: The prompt is tight and concise without gratuitous descriptive giveaways.
- What is **FORBIDDEN** as Hard difficulty:
  - Obscure developer trivia, release patch numbers, or background minutiae.
  - Vague, trick, or misleading syntax.
  - Unusably tiny or cropped images.

---

## 3. The 10 Question Quality Anti-Patterns

| Anti-Pattern ID | Name | Description & Violation |
| :--- | :--- | :--- |
| `ANTI_FACT_FIRST` | **Fact-First Trivia** | The agent finds an arbitrary fact in a wiki and wraps it mechanically in `"ما هو / من هو"`. |
| `ANTI_OBSCURE` | **Obscure-For-Obscure** | Creating artificial difficulty by asking for irrelevant minutiae (e.g. room numbers, shoe sizes, release dates of minor patches). |
| `ANTI_WIKIPEDIA` | **Wikipedia Sentence** | Dense, academic, or robotic encyclopedia prose that drains energy from the room. |
| `ANTI_LEAKAGE` | **Answer Leakage** | Prompt text, quote excerpts, or media assets that give away the answer to an attentive player without domain knowledge. |
| `ANTI_FAKE_DIFF` | **Fake Difficulty** | Making an easy fact artificially hard through convoluted syntax or microscopically tiny unreadable image crops. |
| `ANTI_SAME_SHAPE` | **Same Interaction, New Fact** | Authoring a batch of 15 questions that test different facts but feel identical in play (e.g. 15 consecutive "Who is this player?" questions). |
| `ANTI_HOST_AMBIG` | **Host-Dependent Ambiguity** | Questions where the answer is debatable or requires human referee interpretation. |
| `ANTI_OVER_SPEC` | **Over-Specified Clue** | Providing excessive overlapping clues that make the answer trivially obvious even to non-fans. |
| `ANTI_UNDER_SPEC` | **Under-Specified Clue** | A vague prompt where multiple different answers are equally defensible. |
| `ANTI_WALL_TEXT` | **Mobile Wall of Text** | Overly verbose prompts that force players to read multi-line paragraphs on their phones during high-pressure rounds. |

---

## 4. The 4 Canonical QA Gates (Playtest Lessons)

Every authored question must pass these four fundamental quality invariants before product review:

1. **Scope-Native Alignment**:
   The core fact and knowledge target must meaningfully belong to the selected Scope, not merely to the overarching World. (e.g. A generic club-career fact must not be placed in Champions League without a genuine Champions League connection; Arabic music collaborations must not be placed in Gulf Music).
2. **Unique-Answer Defensibility**:
   Every question must have exactly ONE indisputably correct answer. If a knowledgeable player could give another equally valid answer (e.g. under-specified nicknames or ambiguous title completions), the question must be rewritten or replaced. Never use `acceptedAnswers` to patch prompt ambiguity.
3. **Media Earns Its Place**:
   For `IMAGE` and `AUDIO` questions, the media asset must carry the primary cognitive challenge. If removing the media allows solving the question from text alone (e.g. giveaway nicknames or full descriptive clues in prompt), the prompt must be stripped of the giveaway. Media must never be decorative.
4. **Difficulty Trust**:
   For risk-choice mechanics (especially Marhala), difficulty labels must be genuinely calibrated. Hard must require deeper recognizable fandom recall, not obscure wiki minutiae or confusing wording. Evaluate comparatively (Easy vs Medium, Medium vs Hard) from the player's risk/reward perspective.

---

## 5. Media Pipeline Separation

- **Authoring Agent Responsibility**: Authors the game question, prompt copy, accepted answers, and precise structured `mediaIntent` (subject, asset type/excerpt, duration, and zero-leakage constraints).
- **Media Enrichment Service Responsibility**: Downstream media tools/Wigolo services retrieve, crop, normalize, and attach actual binary assets. Authoring agents never search external video/audio platforms or download media binaries directly.
