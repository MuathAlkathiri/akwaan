# Scope: Assembly & Rotation (تركيب وتدوير)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template: `observation-illusions` (Approved Canonical Library V1).

- `scopeId`: `puzzles.assembly-rotation`
- `worldId`: `puzzles`
- Player-facing Arabic name: **تركيب وتدوير**
- Primary solve: **The player must mentally manipulate, fold, slice, assemble, or rotate the object itself.**
- The question it asks the player: «كيف يبدو المجسم بعد تحريكه أو طيه أو تركيبه؟»
- Boundary: Active mental spatial transformation of the shape or solid itself. If the player merely inspects static features already presented, it belongs to `observation-illusions`. If the player simulates dynamic kinetic transmission over time, it belongs to `paths-motion`.
- Included: mental rotation of 2D/3D shapes, folding 2D nets into cubes and solids, opposite cube faces, orthographic projections (top/front/side views), counting hidden structural cubes, rotating missing puzzle pieces to fit a notch, cross-section slicing, paper fold-and-punch symmetry, exploded view assembly, chiral mirror vs rotation discrimination.
- Excluded: static visual matching with zero rotation (that is `observation-illusions/visual-match-scan`), pure visible object counting with zero hidden blocks, continuous kinetic gear/belt simulations (that is `paths-motion`), perspective optical illusions.
- `excludedChallengeTypeIds`: []

**تركيب وتدوير natively uses Closest for `spatial-cube-count` via 1D discrete sliders.**

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is invalid here.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what the player is shown.

## Puzzle families (Moving XO authoring)

Families are authoring guidance for the Puzzles Signature mechanic, **Moving XO**, which is the World's active authoring target (WORLD.md, product direction 2026-10-21). They are **not** a database field and carry no runtime behaviour — see `ai/.opencode/knowledge/architecture/MOVING-XO.md`.

ركّبها is retired from current product usage and this library is not authored against it. Its runtime, schemas and validators are preserved — retirement from product direction is not runtime removal.

Every family answers on a **text-only** phone within the **15-second** window, while the prompt and media sit on the shared screen.

### Approved Canonical Families (13 Families — V1)

| # | Family | Arabic | Media | Answer Modes |
|---|---|---|---|---|
| 1 | `mental-rotation-2d` | التدوير الذهني للأشكال ثنائية الأبعاد | 2D Geometry Vector | `multiple_choice` |
| 2 | `cube-net-fold` | طي مخطط المكعب | 2D Net + 3D Render | `multiple_choice` |
| 3 | `opposite-cube-faces` | الأوجه المتقابلة في المكعب | 2D Vector Net | `multiple_choice` |
| 4 | `orthographic-projection` | المساقط الهندسية للمجسم | 3D Render + 2D Silhouettes | `multiple_choice` |
| 5 | `spatial-cube-count` | عد المكعبات المخفية في المجسم | 3D Isometric Render | `multiple_choice \| closest` |
| 6 | `missing-puzzle-piece` | القطعة المفقودة لإكمال الشكل | 2D Geometry Vector | `multiple_choice` |
| 7 | `cross-section-slice` | المقطع العرضي للشكل المقطوع | 3D Solid + Slicing Plane | `multiple_choice` |
| 8 | `fold-and-punch` | طي الورق وتخريم الثقوب | 2D Step Flow Vector | `multiple_choice` |
| 9 | `tangram-silhouette-fit` | تركيب قطع التانغرام في الظل | 2D Tangram Vector | `multiple_choice` |
| 10 | `exploded-view-assembly` | المجسم المجمع من المفككات | 3D Exploded Render | `multiple_choice` |
| 11 | `mirror-vs-rotation-discrim` | التمييز بين التدوير والانعكاس | 2D Vector Geometry | `multiple_choice` |
| 12 | `unfolded-surface-net` | مخطط المجسمات غير المكعبة | 2D Net + 3D Solids | `multiple_choice` |
| 13 | `spatial-reconstruction` | إعادة بناء النمط المنقسم | 2D Vector Pieces | `multiple_choice` |

---

## Brief Family Summaries

- **`mental-rotation-2d`** — تدوير شكل ثنائي الأبعاد ذهنياً بزاوية 90°/180°/270° وتجنب الصور المرآتية.
- **`cube-net-fold`** — طي مخطط سداسي الأوجه ذهنياً لاختيار المكعب ثلاثي الأبعاد الصحيح.
- **`opposite-cube-faces`** — استنتاج الوجه المقابل لوجه معين على مخطط مسطح للمكعب.
- **`orthographic-projection`** — تحديد المسقط العلوي أو الجانبي الصحيح لمجسم كتل ثلاثي الأبعاد.
- **`spatial-cube-count`** — حساب إجمالي المكعبات متضمناً المكعبات المخفية الحاملة في بناء متدرج.
- **`missing-puzzle-piece`** — تحديد القطعة التي تكمل الفراغ بعد تدويرها ذهنياً لتلائم الفجوة. (Reject: قطع تطابق الفراغ مباشرة دون تدوير).
- **`cross-section-slice`** — تخيل المقطع العرضي ثنائي الأبعاد الناتج عن قطع مجسم بمستوى مائل.
- **`fold-and-punch`** — تخيل نمط الثقوب الناتج عند إعادة فتح ورقة مربعة تم طيها ثم ثقبها.
- **`tangram-silhouette-fit`** — تحديد القطعة الهندسية التي لا تدخل في تركيب ظل هندسي معين.
- **`exploded-view-assembly`** — تركيب أجزاء هندسية متفرقة ذهنياً على طول محاور التجميع.
- **`mirror-vs-rotation-discrim`** — تمييز ما إذا كان الشكل المستهدف ناتجاً عن تدوير أم انعكاس مرآتي.
- **`unfolded-surface-net`** — مطابقة مخططات أسطح المجسمات غير المكعبة (أهرامات، مواشير، أسطوانات).
- **`spatial-reconstruction`** — إعادة تجميع شطري نمط منقسم لتحديد الرمز المتشكل.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight, religion, romantic relationships, intelligence judgements, or awkward family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See roadmap §23.11.
