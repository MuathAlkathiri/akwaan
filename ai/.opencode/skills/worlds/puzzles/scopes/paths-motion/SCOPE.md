# Scope: Paths & Motion (مسارات وحركة)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template: `observation-illusions` (Approved Canonical Library V1).

- `scopeId`: `puzzles.paths-motion`
- `worldId`: `puzzles`
- Player-facing Arabic name: **مسارات وحركة**
- Primary solve: **The player must simulate dynamic physical evolution across time or causal kinetic chains.**
- The question it asks the player: «إلى أين تتجه الحركة وما هي النتيجة الحتمية للمسار؟»
- Boundary: Tracing causal, dynamic, or kinetic transmission over time. The system must be visually deterministic and solvable from the visible diagram itself. Specialist physics formulas, electrical engineering conventions, and textbook momentum equations are strictly excluded.
- Included: gear train direction, pulley systems, hydraulic pipe and valve flows, electrical circuit loops, mazes and labyrinths, domino cascade chains, ball marble tracks, conveyor belt networks, one-way street grids, cam linkages, shortest grid paths, tangled wire tracing.
- Excluded: physics textbook formulas (Ohm's law, momentum formulas, Newtons), static non-causal visual lines (that is `observation-illusions`), rotating standalone 3D solids (that is `assembly-rotation`), mandatory animated media.
- `excludedChallengeTypeIds`: []

**مسارات وحركة natively uses Closest for `shortest-path-grid` (step count optimization) and `pipe-valve-flow` (continuous fill levels) via 1D sliders.**

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
| 1 | `gear-train-direction` | اتجاه دوران التروس المتشابكة | 2D Vector Gears | `multiple_choice` |
| 2 | `pulley-rope-system` | حركة البكرات والأحمال | 2D Vector Pulleys | `multiple_choice` |
| 3 | `pipe-valve-flow` | تدفق السوائل والصمامات | 2D Hydraulic Schematic | `multiple_choice \| closest` |
| 4 | `electrical-switch-circuit` | مسارات الدوائر الكهربائية | 2D Circuit Schematic | `multiple_choice` |
| 5 | `maze-exit-route` | مسار الخروج من المتاهة | 2D Vector Maze | `multiple_choice` |
| 6 | `domino-cascade-chain` | تساقط الدومينو وسلاسل الأثر | 2D Kinetic Cascade | `multiple_choice` |
| 7 | `ball-marble-track` | مسار دحرجة الكرة والمنحدرات | 2D Track Vector | `multiple_choice` |
| 8 | `conveyor-sorter-route` | سيور النقل ومسارات الفرز | 2D Conveyor Vector | `multiple_choice` |
| 9 | `one-way-traffic-flow` | مسارات الاتجاه الواحد | 2D Street Grid | `multiple_choice` |
| 10 | `cam-linkage-motion` | حركة الكامات والأذرع | 2D Linkage Vector | `multiple_choice` |
| 11 | `shortest-path-grid` | أقصر مسار حركي في الشبكة | 2D Grid Vector | `multiple_choice \| closest` |
| 12 | `wire-trace-terminal` | تتبع الأسلاك المتشابكة | 2D Cable Vector | `multiple_choice` |

---

## Brief Family Summaries

- **`gear-train-direction`** — تتبع اتجاه دوران التروس المتشابكة والسيور لتحديد اتجاه دوران الترس النهائي.
- **`pulley-rope-system`** — تتبع حركة حبل مشدود عبر بكرات لمعرفة اتجاه حركة ثقل معلق.
- **`pipe-valve-flow`** — تتبع تدفق السائل عبر شبكة أنابيب وصمامات لمعرفة أي خزان سيمتلئ أولاً.
- **`electrical-switch-circuit`** — تتبع مسار مغلق للتيار الكهربائي عبر قواطع لتحديد المصباح المضاء.
- **`maze-exit-route`** — تتبع مسار سالك عبر متاهة لتحديد المخرج الوحيد المفتوح.
- **`domino-cascade-chain`** — تتبع تساقط قطع دومينو لمعرفة أي مسار فرعي سيكتمل وأيها سيتوقف عند فجوة واسعة.
- **`ball-marble-track`** — تتبع مسار كرة تتدحرج عبر قنوات ومحولات لتحديد سلة الاستقرار.
- **`conveyor-sorter-route`** — تتبع طرد على سيور نقل موجهة لمعرفة محطته النهائية.
- **`one-way-traffic-flow`** — ملاحة في شبكة شوارع ذات اتجاه إجباري واحد لتحديد الوجهة المتاحة.
- **`cam-linkage-motion`** — تخيل تحويل الحركة الدورانية لكامة إلى حركة رأسية لقضيب دفع.
- **`shortest-path-grid`** — حساب أو تقدير أقل عدد من الخطوات المطلوبة للوصول للهدف متفادياً العوائق.
- **`wire-trace-terminal`** — تتبع سلك واحد ملتف عبر أسلاك متشابكة للوصول إلى المقبس الصحيح.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight, religion, romantic relationships, intelligence judgements, or awkward family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See roadmap §23.11.
