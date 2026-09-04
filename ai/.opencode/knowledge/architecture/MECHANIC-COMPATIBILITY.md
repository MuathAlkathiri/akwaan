# Mechanic Question Compatibility & Contract Provenance

## 0. Core Principle: Mechanics Own Play Loops, Archetypes Supply Shapes

Mechanic policies define the gameplay rules, input mechanisms, timing, and resolution math.
Question Archetypes supply the psychological and cognitive play shapes that populate those mechanics.

Archetypes and difficulty tiers are **separate axes**:
- A mechanic stage or difficulty tier specifies the **required cognitive depth**, not a fixed question archetype.
- For example, in **Combo**, Stage 1 to Stage 4 represents increasing difficulty ($S1 < S2 < S3 < S4$), but each stage supports a diverse palette of archetypes.
- In **Marhala**, Easy, Medium, and Hard represent risk/movement tiers, each open to varied archetypes.

---

## 1. Active Mechanics Compatibility & Provenance Matrix

| Mechanic | Classification & Rule | Category | Source / Provenance |
| :--- | :--- | :--- | :--- |
| **`bomb`** | **Multimodal Assets:** Supports `none` (Text-only), `image` (1 asset with valid URL), or `audio` (1 asset with valid URL). | **A. Runtime Contract** | `backend/src/modules/world-content/domain/bomb-content.policy.ts` |
| | **Answer Mode:** `mode: 'match'`, 1–10 accepted answers, max 120 chars each. | **A. Runtime Contract** | `bomb-content.policy.ts` |
| | **Run Cardinality:** 10–15 items per challenge run. | **A. Runtime Contract** | `bomb-content.policy.ts` |
| | **Production Target:** 15 items per Scope pack. | **B. Approved Product Contract** | Roadmap §16.1, Scope Expansion Plan |
| | **Prompt Brevity & Friendly Copy:** Rapid-fire prompt (e.g. `"بيلينغهام... وش اسمه الأول؟"` or `"ما هذا الشعار؟"`), recommended $<70$ chars. Bomb prompts should be short, conversational and mechanic-native (e.g. "مين هذا؟", "وش اسم...؟"). Avoid multi-clause AI-style descriptive filler. Image recognition prompts normally use simple "مين هذا/هذي؟" forms. | **C. Authoring Recommendation** | Zero-Leakage Policy, Question Craft Guidelines |
| **`closest`** | **Answer Mode:** `mode: 'closest'` with integer/number `correctValue`. | **A. Runtime Contract** | `backend/src/modules/world-content/domain/content-item-compatibility.policy.ts` (lines 800–813) |
| | **Estimation Quality:** Target must be estimable; no embedded arithmetic formulas. | **B. Approved Product Contract** | Roadmap §3.3, Zero-Leakage QA Gate |
| **`combo`** | **Stage Tagging:** `mechanicPayload.comboStage: 1 | 2 | 3 | 4`. | **A. Runtime Contract** | `backend/src/modules/world-content/domain/combo-content.policy.ts` (lines 12–20) |
| | **Answer Mode:** `mode: 'match'`, 1–10 accepted answers. | **A. Runtime Contract** | `combo-content.policy.ts` |
| | **Difficulty Curve:** Monotonic progression across Stages 1–4 ($S1 < S2 < S3 < S4$). | **B. Approved Product Contract** | Roadmap §16.4 |
| | **Archetype Diversity:** S1–S4 allow varied compatible archetypes across the run. | **C. Authoring Recommendation** | Question Craft Architecture |
| **`marhala`** | **Difficulty Tagging:** `mechanicPayload.marhalaDifficulty: 'easy' | 'medium' | 'hard'`. | **A. Runtime Contract** | `backend/src/modules/world-content/domain/marhala-content.policy.ts` |
| | **Answer Mode:** `mode: 'match'`, 1–10 accepted answers. | **A. Runtime Contract** | `marhala-content.policy.ts` |
| | **Batch Distribution:** Exactly 9 items per Scope (3 Easy / 3 Medium / 3 Hard). | **B. Approved Product Contract** | Roadmap §17, Marhala Production Spec |
| | **Difficulty Calibration:** Hard requires deeper but still meaningful and recognizable domain recall (never create Hard from irrelevant minutiae). | **B. Approved Product Contract** | Marhala R2 Product Standard |
| **`one-clue`** | **Clues Structure:** `mechanicPayload.clues` with exactly 5 ordered clues (values 5..1). | **A. Runtime Contract** | `content-item-compatibility.policy.ts` (lines 900–940) |
| | **Answer Mode:** `mode: 'match'`, 1–10 accepted answers. | **A. Runtime Contract** | `content-item-compatibility.policy.ts` |
| | **Monotonic Ladder:** Clues strictly ordered hardest to easiest ($C1 < C2 < C3 < C4 < C5$). | **B. Approved Product Contract** | `ai/.opencode/knowledge/architecture/ONE-CLUE.md` |
| **`read-your-opponent`** (RYO) | **Answer Mode:** `mode: 'ryo'` with either `options: [{ id, text }]` + `correctOptionId`, or numeric estimate `correctValue` + optional `acceptedTolerance`. | **A. Runtime Contract** | `content-item-compatibility.policy.ts` (lines 815–838) |
| | **Challenge Structure:** Exactly 3 discrete items per challenge on a match board. | **B. Approved Product Contract** | Roadmap §3.3, `PRODUCT-EXPERIENCE.md` |
| | **Uncertainty Calibration:** Plausible options/estimates optimizing bluff/trust tension. | **C. Authoring Recommendation** | `skills/challenge-types/read-your-opponent/SKILL.md` |
| **`top-5`** | **Payload Structure:** Exactly 10 cards (5 real ranks 1..5, 5 traps) in top-5 format. | **A. Runtime Contract** | `content-item-compatibility.policy.ts` (lines 950–990) |
| | **Answer Mode:** `mode: 'top_5'`. | **A. Runtime Contract** | `content-item-compatibility.policy.ts` |
| **`rakkibha`** | **Payload Structure:** private reference + candidate-holder views, `authoring.rakkibha.interactionPattern`. | **A. Runtime Contract** | `backend/src/modules/world-content/domain/content-item-compatibility.policy.ts` |
| | **Challenge Structure:** Exactly 3 shared puzzles per challenge. | **B. Approved Product Contract** | `ai/.opencode/knowledge/architecture/RAKKIBHA.md` |

---

## 2. Decoupling Archetype from Difficulty

### Combo Run Design:
- **Stage 1 (Easy)**: Accessible franchise knowledge. Compatible with `FAST_ATTRIBUTE`, `NAME_FRAGMENT`, `NICKNAME_OR_ALIAS`, `WORK_TO_CHARACTER`, `DETAIL_RECOGNITION`.
- **Stage 2 (Medium-Low)**: Recognizable secondary concepts. Compatible with `COMPLETE_THE_NAME`, `BEFORE_AFTER`, `DETAIL_RECOGNITION`, `REVERSE_QUESTION`.
- **Stage 3 (Medium-High)**: Deep franchise familiarity. Compatible with `CAREER_PATH`, `REVERSE_QUESTION`, `REAL_NAME`, `SEQUENCE`.
- **Stage 4 (Hard)**: True fan recall and subtle connections. Compatible with `CONNECTION`, `ODD_ONE_OUT`, `DETAIL_RECOGNITION`, `CATEGORY_IDENTIFICATION`.

### Marhala Pack Design:
- **Easy (1–2 tiles)**: Universal recognition for anyone who has played/followed the franchise.
- **Medium (2–4 tiles)**: Solid franchise familiarity, secondary systems, standard lore.
- **Hard (4–6 tiles)**: Deeper but still meaningful and recognizable domain recall. Never create Hard difficulty from irrelevant minutiae.
