# Puzzle-Family Vocabulary

Canonical lightweight vocabulary for naming the solving operation behind a
ركّبها puzzle. A family names HOW the fragments combine, not WHAT the material
is about. Every distributed-information item is tagged with exactly one family;
one family per item, and a three-item Challenge prefers three distinct families.

## Scope, Family, and ChallengeType

- Scope defines the puzzle's primary content/material domain. Puzzle World has
  six scopes: `general-knowledge`, `letters-words`, `numbers-arithmetic`,
  `logic-deduction`, `shapes-patterns`, and `symbols-codes`. A scope constrains
  what material belongs, the knowledge/content domain the puzzle uses, routing,
  authoring boundaries, and review expectations, but it never owns mechanic
  behavior.
- Puzzle family defines the solving operation or construction used to turn that
  material into a puzzle. It is a lightweight authoring tag, recorded optionally
  in `mechanicPayload.puzzleFamily`, and it never changes the content shape.
- ChallengeType defines the gameplay behavior. For ركّبها that is the shared
  puzzle: one instruction plus two fragments plus one answer, 2P/3P
  distribution, and host secrecy.

## Canonical Family Names

| family | Arabic | solving operation |
| --- | --- | --- |
| `letter-set` | حروف مبعثرة | letter tiles combine into one word |
| `missing-shape` | شكل ناقص | partial figure is completed by combining |
| `partial-equation` | معادلة ناقصة | numbers and operators combine into one result |
| `matrix-cell` | شبكة رقمية | matrix rows and columns combine into one cell |
| `visual-pattern` | نمط بصري | figure sequence continues by one rule |
| `symbol-key` | مفتاح رموز | symbols map to letters or values by one key |
| `ordering` | ترتيب | pieces combine into one correct order |
| `relationship-logic` | علاقات منطقية | clues link into one deduction |
| `code-breaking` | فك شفرة | encoded message decodes by one rule |
| `map-path` | خريطة ومسار | path connects across a split map |
| `spot-difference` | فروقات | two views combine to expose differences |
| `transformation` | تحويل | one rule is applied across pieces |

## Rules

- Tag one family per item; do not invent a new family for one item.
- Keep the tag a stable lowercase dash-separated token.
- When a Challenge is exactly three items, use three distinct families so the
  batch plays differently.
- A family is extensible: adding a family is a vocabulary note here, not a
  schema change.

## Scope-Guided Family Fit

- `general-knowledge`: any family whose material is everyday shared facts
  (`letter-set`, `symbol-key`, `visual-pattern`).
- `letters-words`: `letter-set`, `ordering`, `code-breaking`.
- `numbers-arithmetic`: `partial-equation`, `matrix-cell`, `ordering`.
- `logic-deduction`: `relationship-logic`, `ordering`, `code-breaking`.
- `shapes-patterns`: `missing-shape`, `visual-pattern`, `spot-difference`,
  `transformation`.
- `symbols-codes`: `symbol-key`, `code-breaking`, `transformation`.
