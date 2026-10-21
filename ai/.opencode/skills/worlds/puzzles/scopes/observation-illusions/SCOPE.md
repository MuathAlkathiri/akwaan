# Scope: Observation and Visual Illusions (قوة الملاحظة والخداع البصري)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template for the other five Puzzles Scopes.

- `scopeId`: `puzzles.observation-illusions`
- `worldId`: `puzzles`
- Player-facing Arabic name: **قوة الملاحظة والخداع البصري**
- Primary solve: **Notice what is already present.**
- The question it asks the player: «Did you notice it?»
- Boundary: the image in front of the player is the whole puzzle. The answer is
  visible before it is understood, and no inferred rule is required to reach it.
- Included: hidden detail, optical illusion, reflection, perspective, visual count, visual inconsistency.
- Excluded: anything that needs an inferred rule to solve — that is `spot-the-error`;
  anything solved by transforming the object — that is `assembly-rotation`;
  anything whose answer depends on recall.
- `excludedChallengeTypeIds`: []

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is
  invalid here. An item that a player answers by *knowing a fact* does not
  belong in this Scope regardless of how it is dressed.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what
  the player is shown. No outside lookup, no recall dependency.

## Puzzle families (Approved Canonical Library V1)

Families are authoring guidance for the Puzzles Signature mechanic, **Moving XO**, which is the World's
active authoring target (WORLD.md, product direction 2026-10-21). They are **not** a database field and
carry no runtime behaviour — see `ai/.opencode/knowledge/architecture/MOVING-XO.md`.

The `Supported Modes` column records the answer modes a family can express. A mode is not a second
mechanic claim: where a family notes `closest`, that is the Closest *answer mode* inside Moving XO
authoring, not an instruction to author this library for ركّبها, which is retired from current product
usage.

The complete **14-Family Library (Approved Canonical Library V1)**, with detailed cognitive operations, difficulty levers, mechanic-native notes, and anti-patterns, is documented in [`KNOWLEDGE.md`](./KNOWLEDGE.md).

For the Puzzles Signature mechanic (**Moving XO**), every family answers on a **text-only** phone within the **15-second** window while the prompt and media sit on the shared screen.

### Approved Canonical Family Summary (V1):
| # | Family ID | Arabic Title | Moving XO Fit | Media | Supported Modes |
|---|---|---|:---:|:---:|:---:|
| 1 | `hidden-detail` | التفصيلة المخفية والتمويه | GOOD | Required | `multiple_choice`, `closest` (limited: 1D scalar/count) |
| 2 | `figure-ground-reversal` | انعكاس الشكل والأرضية والفضاء السلبي | EXCELLENT | Required | `multiple_choice`, `match` |
| 3 | `illusory-contour` | الحدود والأشكال الوهمية | EXCELLENT | Required | `multiple_choice`, `match` |
| 4 | `size-distortion-illusion` | خداع الحجم والأبعاد | EXCELLENT | Required | `multiple_choice`, `closest` |
| 5 | `color-contrast-illusion` | خداع اللون والسطوع | EXCELLENT | Required | `multiple_choice`, `match` |
| 6 | `perspective-depth-trap` | فخ المنظور والعمق | EXCELLENT | Required | `multiple_choice`, `closest` (limited: 1D depth) |
| 7 | `impossible-object-perception` | المجسمات والتراكيب المستحيلة | EXCELLENT | Required | `multiple_choice` |
| 8 | `count-in-clutter` | العدّ البصري في الزحام | EXCELLENT | Required | `multiple_choice`, `closest` |
| 9 | `spot-the-difference` | الفروقات بين المشهدين | EXCELLENT | Required | `multiple_choice`, `closest` (limited: 1D count delta) |
| 10 | `visual-match-scan` | المطابقة البصرية الدقيقة | EXCELLENT | Required | `multiple_choice` |
| 11 | `reflection-fidelity` | انعكاس المرآة والمسطحات | EXCELLENT | Required | `multiple_choice`, `match`, `closest` |
| 12 | `overlapping-boundary-trace` | تداخل الأشكال والمسارات المغلقة | EXCELLENT | Required | `multiple_choice`, `closest` |
| 13 | `visual-closure-fragment` | التعرف عبر الاكتمال البصري | EXCELLENT | Required | `multiple_choice`, `match` |
| 14 | `visual-asymmetry-detection` | ملاحظة كسر التناظر | EXCELLENT | Required | `multiple_choice`, `closest` |

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
