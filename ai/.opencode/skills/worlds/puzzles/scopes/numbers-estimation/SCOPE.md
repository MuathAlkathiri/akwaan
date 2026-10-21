# Scope: Numbers & Estimation (أرقام وتقديرات)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template: `observation-illusions` (Approved Canonical Library V1).

- `scopeId`: `puzzles.numbers-estimation`
- `worldId`: `puzzles`
- Player-facing Arabic name: **أرقام وتقديرات**
- Primary solve: **Playful numerical intuition, visual estimation, and pattern discovery.**
- The question it asks the player: «كم المقدار، أو ما هو الرقم الناقص؟»
- Boundary: Estimations must be visually anchored or reasoning-derived. Patterns must provide an immediate 'aha!' discovery. Direct school arithmetic worksheet calculations, long multi-digit operations, and memorized math tables are strictly excluded.
- Included: visual quantity estimation (scatters, clusters), fill percentage and proportion estimation, short discoverable number sequences, visual balance scale weights, 3x3 number grids, clock angles, Between-Two-Anchors graduations, ratio intuition, geometric area estimation.
- Excluded: multi-digit school arithmetic, memorized multiplication tables, obscure arbitrary formulas, direct digit-summing drills (`digital-sum-root`), factual/statistical trivia.
- `excludedChallengeTypeIds`: []

**أرقام وتقديرات natively anchors the Closest mechanic across continuous 1D sliders and Between-Two-Anchors.**

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is invalid here.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what the player is shown.

## Puzzle families (Moving XO authoring)

Families are authoring guidance for the Puzzles Signature mechanic, **Moving XO**, which is the World's active authoring target (WORLD.md, product direction 2026-10-21). They are **not** a database field and carry no runtime behaviour — see `ai/.opencode/knowledge/architecture/MOVING-XO.md`.

ركّبها is retired from current product usage and this library is not authored against it. Its runtime, schemas and validators are preserved — retirement from product direction is not runtime removal.

Every family answers on a **text-only** phone within the **15-second** window, while the prompt and media sit on the shared screen.

### Approved Canonical Families (12 Families — V1)

| # | Family | Arabic | Media | Answer Modes |
|---|---|---|---|---|
| 1 | `missing-number-pattern` | الرقم الناقص في المتتالية | Typographic Track | `multiple_choice` |
| 2 | `visual-quantity-estimate` | تقدير الكميات والمجموعات | 2D Scatter Vector | `multiple_choice \| closest` |
| 3 | `proportion-estimate` | تقدير النسبة والامتلاء | 2D Gauge Vector | `multiple_choice \| closest` |
| 4 | `balance-scale-weight` | أوزان كفة الميزان | 2D/3D Pan Scale | `multiple_choice` |
| 5 | `number-relationship-grid` | علاقات الأرقام في الشبكة | 2D Grid Vector | `multiple_choice` |
| 6 | `time-angle-intuition` | حدس زوايا عقارب الساعة | 2D Clock Dial | `multiple_choice \| closest` |
| 7 | `between-two-anchors` | التقدير بين نقطتين مرجعيتين | 1D Vector Track | `multiple_choice \| closest` |
| 8 | `relative-magnitude-sort` | المقارنة النسبية بين المقادير | 2D Vector Cards | `multiple_choice` |
| 9 | `geometric-area-estimate` | تقدير المساحات الهندسية | 2D Geometry Vector | `multiple_choice \| closest` |
| 10 | `structured-subitizing-count` | العد السريع للمجموعات | 2D Grouped Tokens | `multiple_choice` |
| 11 | `ratio-intuition` | حدس النسب الرياضية | 2D Dual-Color Tokens | `multiple_choice \| closest` |
| 12 | `ordering-values-span` | مدى الفروق وترتيب القيم | 2D Data Badges | `multiple_choice \| closest` |

---

## Brief Family Summaries

- **`missing-number-pattern`** — استنتاج النمط الحسابي المباشر لإكمال رقم مفقود في متتالية. (Closest = DO_NOT_FORCE؛ الإجابة استنتاج دقيق وليست تقديراً).
- **`visual-quantity-estimate`** — تقدير عدد عناصر غير منظمة في وعاء أو ساحة على شريط انزلاقي مستمر.
- **`proportion-estimate`** — تقدير نسبة الامتلاء أو الجزء المظلل (0% إلى 100%) دون علامات قياس مسبقة.
- **`balance-scale-weight`** — استنتاج وزن مكافئ بسيط من موازين ذات كفتين.
- **`number-relationship-grid`** — استنباط علاقة الجمع/الضرب بين أرقام صفوف وأعمدة شبكة 3×3.
- **`time-angle-intuition`** — تقدير الزاوية الحادة أو المنفرجة بين عقربي الساعة (0° إلى 180°).
- **`between-two-anchors`** — تقدير موضع علامة على خط مستقيم مدرج بين نقطتي بداية ونهاية معروفتين.
- **`relative-magnitude-sort`** — مقارنة سريعة لتحديد التعبير أو الصندوق الأكبر/الأصغر.
- **`geometric-area-estimate`** — تقدير نسبة مساحة جزء هندسي مظلل داخل مضلع.
- **`structured-subitizing-count`** — عد فوري لمجموعات متناسقة (أزواج أو ثلاثيات).
- **`ratio-intuition`** — استنتاج النسبة المبسطة بين نوعين من العناصر الملونة.
- **`ordering-values-span`** — تقدير الفارق (المدى) بين أعلى وأدنى قيمة في قراءات معروضة.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight, religion, romantic relationships, intelligence judgements, or awkward family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See roadmap §23.11.
