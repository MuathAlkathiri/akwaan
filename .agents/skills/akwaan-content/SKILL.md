---
name: akwaan-content
description: >-
  Master workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow

## 0. Canonical Authoring Principle

> **"Never begin by asking what trivia facts can I write.**
> **Begin by asking what interaction/question shape would be fun to play.**
> **Then find a recognizable, fair fact that fits that shape."**

Akwaan is a multiplayer party game. Content exists to create active gameplay moments: rapid recognition, suspense, bluffing, cooperation, lively team debate, and memorable reveals. A question that is merely an encyclopedia fact wrapped in `"ما هو / من هو"` is a failure of question craft.

---

## 1. Mandatory 7-Step Authoring Flow

Every authoring task must progress through this sequential 7-step pipeline:

```text
1. GLOBAL QUESTION CRAFT (ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md)
   ↓ Apply 12 pillars of question craft, anti-pattern gates, natural Arabic copy
2. QUESTION ARCHETYPE SELECTION (ai/.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md)
   ↓ Choose an engaging play shape from the 20 canonical archetypes (NAME_FRAGMENT, REVERSE_QUESTION, CAREER_PATH, etc.)
3. WORLD GUIDANCE (ai/.opencode/skills/worlds/<world>/WORLD.md)
   ↓ Consult the World Question Palette and rotate across content dimensions
4. SCOPE & KNOWLEDGE GUIDANCE (ai/.opencode/skills/worlds/<world>/scopes/<scope>/KNOWLEDGE.md)
   ↓ Ground in authentic, durable canonical lore and respect scope boundaries
5. MECHANIC COMPATIBILITY (ai/.opencode/knowledge/architecture/MECHANIC-COMPATIBILITY.md)
   ↓ Enforce exact mechanic contract (Bomb, Combo, Marhala, RYO, Closest, One Clue, Top-5, Distributed Info)
6. BATCH VARIETY REVIEW (ai/.opencode/knowledge/architecture/BATCH-VARIETY.md)
   ↓ Ensure max archetype share <= 35%, entity type rotation, and varied prompt openings
7. FACT, ANSWER & ZERO LEAKAGE QA (.agents/skills/akwaan-content-qa/SKILL.md)
   ↓ Validate 100% factual accuracy, comprehensive accepted answers, and zero prompt leaks
```

---

## 2. Authoring-Side Metadata Specification

Newly authored Question Craft items must carry lightweight authoring metadata in their source artifact:

```json
{
  "id": "item-id",
  "prompt": { "ar": "..." },
  "authoring": {
    "questionArchetype": "NAME_FRAGMENT",
    "contentDimension": "players"
  }
}
```

- **`authoring.questionArchetype`**: Must be one of the 20 canonical archetypes in `QUESTION-ARCHETYPES.md`. Used for batch variety and diversity auditing.
- **`authoring.contentDimension`** (Optional): Category tag (e.g. `players`, `stadiums`, `weapons`, `lore`) to assist in entity spread auditing.
- **Runtime Note**: Authoring metadata lives in source JSON review artifacts; it is **not** required to mutate production runtime schemas and is stripped/ignored during DB promotion.

---

## 3. Decoupling Archetype from Difficulty

Archetype and difficulty are **separate axes**:
- A mechanic stage or tier specifies the **required cognitive depth**, not a required archetype shape.
- **Combo**: Stage 1 to Stage 4 represents increasing difficulty ($S1 < S2 < S3 < S4$), with each stage allowing a diverse palette of compatible archetypes across the run.
- **Marhala**: Easy (1–2 tiles), Medium (2–4 tiles), and Hard (4–6 tiles) represent risk/movement tiers:
  - *Hard standard*: Requires deeper but still meaningful and recognizable domain recall. Never create Hard difficulty from irrelevant minutiae or obscure trivia.

---

## 4. Zero Answer Leakage Invariant (Strict Gate)

A question must **NEVER leak its own answer**:
1. **No Explicit or Near-Verbatim Leaks**: Target name, entity, or synonym must never appear in the prompt text.
2. **No Quote Leaks**: Never include a famous quote if the answer is contained within that quote.
3. **No Embedded Formulas**: Never include arithmetic that trivially calculates the answer.
4. **Bomb Visual Purity**: Character/image prompts must be neutral (`"من هذه الشخصية؟"` / `"ما اسم هذا الملعب؟"`), never describing powers, titles, or lore in text.
5. **RYO Stem Isolation**: Never state the correct option text in the prompt stem.
6. **Core Leakage Test**: *If a player does not know the fact, but can deduce the answer from prompt wording alone, the item FAILS.*

---

## 5. Active Mechanic Contracts

- **Bomb (`bomb`)**: Rapid-fire item loop under a continuous clock. Supports `none` (text-only prompt), `image` (1 asset with valid URL), or `audio` (1 asset with valid URL). Rapid prompt (recommended <70 chars), `mode: 'match'`, 1–10 accepted answers (≤120 chars).
- **Combo (`combo`)**: 4 monotonic difficulty stages (`comboStage: 1|2|3|4`), `mode: 'match'`, accepted answers.
- **Marhala (`marhala`)**: Exact 3/3/3 split (Easy / Medium / Hard), `mode: 'match'`.
- **One Clue (`one-clue`)**: Exactly 5 progressive clues ($C1 < C2 < C3 < C4 < C5$), `mode: 'match'`.
- **RYO (`read-your-opponent`)**: 3 items per challenge, `mode: 'ryo'` with either `options: [{ id, text }]` + `correctOptionId` or numeric estimate `correctValue` + optional `acceptedTolerance`.
- **Closest (`closest`)**: `mode: 'closest'` with numeric `correctValue`.
- **Top 5 (`top-5`)**: 10-card deck (5 real ranks, 5 plausible traps) in top-5 payload format.
- **Distributed Information (`distributed-information`)**: 3 shared puzzles, team instruction + 2 secret complementary fragments.
