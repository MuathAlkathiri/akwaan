# World Experience Profile: puzzles

## World Identity
The core aesthetic and thematic identity of puzzles. Focus on authentic engagement.

## Player Experience
How players feel when answering questions in this World. Must be kinetic and reward true fandom.

## Strong Content Territories
Best formats for this World.
- Strong: Visually distinct spatial or logical leaps.

## Weak / Meta Territories
Avoid trivia that feels like a wiki lookup.
- Weak: Overly complex math that requires a calculator.

## Natural Evidence Forms
What media types work best (e.g., Audio, Video, Image).

## World vs Scope Responsibility
World defines the tone and media boundaries. Scopes define the factual boundaries.

## World-Specific Anti-Patterns
Avoid breaking the core experience of puzzles.

# World: Puzzle World (عالم الألغاز)

- `worldId`: `puzzles`
- Identity: distributed puzzles, riddles, word games, number games, visual
  patterns, shapes, matrices, and logic — material that is solved by combining
  complementary pieces rather than by recall.
- Tone: playful, focused, clever, family-friendly.
- Media anchors: diagrams, matrices, shapes, symbol grids, partial figures, and
  letter/number tiles that render on a phone screen.
- Safety: no trivia-dependent solving; every puzzle must be self-contained in its
  private views and instruction. No money, body shape or weight, religion, romantic
  relationships, intelligence, or awkward family-group topics.
- Presentation: distinctive puzzle-grid frame and concise Arabic instruction
  vocabulary.
- Ownership: this World is the exclusive home of two mechanics — `moving-xo`
  (إكس أو المتحرك), the Puzzles **Signature**, and `rakkibha` (ركّبها), an
  independent mechanic with its own runtime, validators and content. Neither
  replaces the other, and Moving XO is **not** a renamed ركّبها. Neither is
  intended to run across Anime, Football, or Video Games.
- Current product direction (approved 2026-10-21): **`moving-xo` is the active
  authoring target for this World; `rakkibha` is retired from current product
  usage and is not authored against today.**

  Retired from *product direction* — not removed. ركّبها's runtime, schemas,
  validators, Skills and visual assembly patterns are deliberately preserved for
  possible future reactivation, and nothing here authorises deleting them,
  deactivating a challenge configuration, or mutating a runtime record. A
  mechanic nobody is currently authoring for is not a mechanic that has been
  taken out of the product; conflating the two is how a reversible pause becomes
  an irreversible deletion.

  ⬜ **Runtime removal and database deactivation are NOT VERIFIED and NOT
  AUTHORIZED.** No claim is made here about what any environment currently
  serves.
- Scopes: the six forward Scopes approved 2026-10-06 with canonical slugs
  approved 2026-10-09 (roadmap §23.11) — `observation-illusions`,
  `wordplay-letters`, `numbers-estimation`, `assembly-rotation`, `paths-motion`
  and `spot-the-error`. These are the **only** Puzzles Scopes. The earlier
  `general-knowledge` / `letters-words` / `numbers-arithmetic` /
  `logic-deduction` / `shapes-patterns` / `symbols-codes` set and the
  `patterns-sequences` / `lateral-thinking` / `visual-puzzles` expansion are
  **SUPERSEDED and removed**; no second Puzzles taxonomy exists. A Scope defines the
  puzzle's primary content/material domain and constrains what material belongs,
  routing, authoring boundaries, and review expectations; it never owns mechanic
  behavior.
- Authoring gate: readiness is decided per **target mechanic**, not World-wide.
  An item may be authored `ready` once the contract for the mechanic it is
  written for exists and its checks pass:
  - `moving-xo` — see `ai/.opencode/knowledge/architecture/MOVING-XO.md` for the
    contract and `ai/.opencode/validators/validate_moving_xo.py` for the checks.
    The backend's `ContentItemCompatibilityPolicy` is the gate that actually
    holds at READY.
  - `rakkibha` — see `ai/.opencode/validators/RAKKIBHA.md`, unchanged. Retained
    and still valid; simply not an active authoring target under the current
    product direction above.
  The earlier blanket rule — no Puzzles item `ready` until the Rakkibha contract
  exists — is **superseded**: that precondition is satisfied, and it never
  applied to a mechanic Rakkibha does not own.

This file supplies presentation context only. It does not own mechanic behavior
or Content Patterns.

## Question Palette

- **Scoped Puzzle Family Guidance (not a global `questionArchetype`)**:
  Moving XO family metadata describes the mechanic-native solving operation. The
  canonical family IDs are owned by the six forward Puzzles Scope profiles and
  are validated by `ai/.opencode/validators/validate_moving_xo.py`. Do not use
  historical Rakkibha family vocabulary as Moving XO family IDs.
- **High-Value Global Archetypes**:
  - `SEQUENCE` (Mathematical, visual, or alphabetic pattern progression)
  - `CONNECTION` (Word association, double meanings, riddle logic)
  - `ODD_ONE_OUT` (Geometric or logical outliers)
  - `DETAIL_RECOGNITION` (Visual puzzle clues, anagram decoders)
- **Usable Archetypes**:
  - `CATEGORY_IDENTIFICATION` (Riddle deduction)
  - `COMPLETION` (Word/cipher completion)
- **Archetypes to Limit**:
  - Fact-recall trivia (Puzzles must test deductive reasoning, pattern recognition, and lateral thinking—not general trivia).
- **Content Dimensions to Rotate Through**:
  - قوة الملاحظة والخداع البصري, التلاعب بالكلمات والحروف, أرقام وتقديرات, تركيب وتدوير, مسارات وحركة, اكتشف الخطأ.
- **World-Specific Anti-Patterns**:
  - *Trivia disguise*: Never author standard encyclopedic trivia in Puzzles World.
