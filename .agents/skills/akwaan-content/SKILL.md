---
name: akwaan-content
description: >-
  Workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow

## Responsibilities
- Author production-ready game content items for Akwaan.
- Ensure all items are mechanic-native, recognizable, fair, multiplayer-friendly, and non-repetitive.
- Avoid generic trivia dressed up with a cosmetic mechanic label.
- Do not push, import, or mutate runtime data without explicit user approval.

## Core Authoring Invariants

### Zero Answer Leakage Rule (Strict QA Requirement)
A question must **NEVER leak its own answer**. Reject or rewrite any item where a player can derive the answer directly from prompt wording instead of genuine knowledge.
1. **No Explicit or Near-Verbatim Leaks**: Never include the target entity, name, number, or synonymous phrasing inside the prompt.
2. **No Quote/Catchphrase Leaks**: Never include a famous quote/catchphrase if the quote itself contains the answer target (e.g. do not include "Over 9000" in a prompt asking for Goku's 9000 power level).
3. **No Embedded Arithmetic/Formulas**: In *Closest* or numerical items, never embed a formula that trivially computes the target (e.g. do not include "8 universes × 10 fighters" for target 80).
4. **Bomb Visual Purity**: Bomb is visual recognition; character prompts must be neutral (`"من هذه الشخصية؟"`), never describing who the character is, their powers, or their title.
5. **RYO / Multiple Choice Option Isolation**: Never state the correct option text or title in the prompt stem.
6. **Core Leakage Test**: *If a player does not know the fact, but can still get the answer from the wording alone, the item FAILS authoring QA.*

## Required Authoring Process

1. **Check Roadmap State**:
   - Read the relevant section in `GAME_NEW_SYSTEM_ROADMAP.md` (governance in §0, boards and pacing in §3, mechanic specs in §16).
   - Ensure the mechanic is implemented or targeted for authoring.

2. **Inspect Canonical Authoring Assets (Do Not Duplicate)**:
   - Content standards: `ai/.opencode/knowledge/AKWAAN-CONTENT-BIBLE.md`
   - Target World definition: `ai/.opencode/skills/worlds/<world>/WORLD.md`
   - Target Scope definition: `ai/.opencode/skills/worlds/<world>/scopes/<scope>/SCOPE.md`
   - Scope Knowledge base: `ai/.opencode/skills/worlds/<world>/scopes/<scope>/KNOWLEDGE.md`
   - Challenge Type & Pattern: `ai/.opencode/skills/challenge-types/<mechanic>/SKILL.md` and associated `patterns/`

3. **Inspect Implemented Mechanic Content Contract**:
   - Verify the exact shape required in code (e.g., `backend/src/modules/world-content/domain/*-content.policy.ts` and `content-item-compatibility.policy.ts`).
   - For example:
     - **Bomb (`bomb`)**: exactly 1 image in `media.assets`, neutral Arabic prompt (`"من هذه الشخصية؟"`), `mode: 'match'`, 1–10 accepted answers (≤120 chars each), no duplicates after normalization.
     - **Combo (`combo`)**: 4 difficulty stages (`mechanicPayload.comboStage: 1|2|3|4`), Arabic prompt (zero leakage), `mode: 'match'`, accepted answers. Scope and stage are independent.
     - **One Clue (`one-clue`)**: ordered progressive clue ladder (`mechanicPayload.clues`), monotonic difficulty, no early giveaway or useless clues.

4. **Inspect Existing Catalog**:
   - Check existing items in the target World/Scope to prevent duplicate facts, duplicate entities, or near-identical prompts.

5. **Author Mechanic-Native Content**:
   - Produce structured ContentItems adhering strictly to the contract and Zero Answer Leakage Rule.
   - Respect World and Scope boundaries.
   - Hand off to QA (`akwaan-content-qa`) for review.

