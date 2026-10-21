# Scope: Spot the Error (اكتشف الخطأ)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template: `observation-illusions` (Approved Canonical Library V1).

- `scopeId`: `puzzles.spot-the-error`
- `worldId`: `puzzles`
- Player-facing Arabic name: **اكتشف الخطأ**
- Primary solve: **Infer an objective rule, then find what violates it.**
- The question it asks the player: «ما هي القاعدة المنطقية المعمول بها هنا، وأين كُسرت بالتحديد؟»
- Boundary: A rule must be inferable from the material itself, and exactly one element must break it. Two steps, always: (1) infer the rule, then (2) locate the breach.
- Included: intruder element, sequence order violation, broken visual matrix pattern, invalid transformation step, impossible cast shadow, wrong number mapping, invalid reflection rule across multiple exemplars, broken causal chain link, false classification member, wrong code translation, broken balance rule, broken periodic tessellation tile.
- Excluded: noticing a detail with no rule behind it (that is `observation-illusions`), impossible Escher/Penrose geometries (that is `observation-illusions/impossible-object-perception`), single-image reflection inspection (that is `observation-illusions/reflection-fidelity`), isolated asymmetry in a single shape (that is `observation-illusions/visual-asymmetry-detection`), mental rotation of 3D solids (that is `assembly-rotation`), continuous kinetic simulation (that is `paths-motion`), factual trivia error checking.
- `excludedChallengeTypeIds`: []

**اكتشف الخطأ may use Between Two Anchors for `impossible-shadow-violation` ONLY when the scene is intentionally authored along a genuine 1D physical panorama.**

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
| 1 | `intruder-element` | العنصر الدخيل على المجموعة | 2D Geometry Vector | `multiple_choice` |
| 2 | `order-violation` | خلل الترتيب والتسلسل المنطقي | 2D Sequence Vector | `multiple_choice` |
| 3 | `broken-visual-pattern` | الخلل في النمط والمصفوفة | 2D Grid Vector | `multiple_choice` |
| 4 | `invalid-transformation-step` | الخطوة غير الصحيحة في التحول | 2D Flow Diagram | `multiple_choice` |
| 5 | `impossible-shadow-violation` | خطأ الظلال ومصدر الضوء | 2D/3D Optics Vector | `multiple_choice \| closest` |
| 6 | `wrong-number-mapping` | الخطأ في معادلة الربط العددي | 2D Math Diagram | `multiple_choice` |
| 7 | `invalid-reflection-rule` | خلل قاعدة التناظر والانعكاس | 2D Reflection Pairs | `multiple_choice` |
| 8 | `broken-chain-link` | الحلقة المكسورة في السلسلة | 2D Causal Schematic | `multiple_choice` |
| 9 | `false-classification-member` | الخطأ في تصنيف الفئات والخواص | 2D Classification Vector | `multiple_choice` |
| 10 | `wrong-code-translation` | الخطأ في تطبيق الشفرة والرموز | 2D Cipher Layout | `multiple_choice` |
| 11 | `broken-balance-rule` | الخلل في توازن المعادلة المصورة | 2D Balance Scales | `multiple_choice` |
| 12 | `broken-tessellation-tile` | الخلل في نمط التبليط الهندسي | 2D Tessellation Vector | `multiple_choice` |

---

## Brief Family Summaries

- **`intruder-element`** — استنتاج الخاصية المشتركة وتحديد العنصر الشاذ. (Reject: مجموعات مبنية على حقائق عامة).
- **`order-violation`** — تسلسل منطقي يحتوي على خطوة وحيدة مكسورة أو معكوسة. (Closest = DO_NOT_FORCE؛ تجنب fake index distance).
- **`broken-visual-pattern`** — مصفوفة بصرية (3×3) تكسر إحدى خلاياها قاعدة الصفوف والأعمدة.
- **`invalid-transformation-step`** — تسلسل تحول تدريجي لشكل هندسي شهد خطوة خالفت قانون التحول.
- **`impossible-shadow-violation`** — مشهد مشمس به عدة مجسمات، أحدها يلقي ظلاً في اتجاه مستحيل يناقض موضع الضوء. (Closest متاح فقط في المشاهد البانورامية أحادية البعد).
- **`wrong-number-mapping`** — أشكال تحكم أرقامها معادلة ثابتة، وشكل واحد يحتوي على ناتج خاطئ.
- **`invalid-reflection-rule`** — استنباط قاعدة الانعكاس من عدة نماذج، وتحديد النموذج الذي خرقها. (تجنب فحص مرآة وحيدة؛ ذلك يتبع observation).
- **`broken-chain-link`** — سلسلة سببية متتابعة (دومينو أو قواطع) بها حلقة منقطعة تعطل الأثر.
- **`false-classification-member`** — مجموعتان مصنفتان بصرياً بهما عنصر وُضع بالخطأ في غير مجموعته.
- **`wrong-code-translation`** — مفتاح شفرة بصري بسيط يُترجم لرموز، وأحد الأسطر تضمن خطأ في فك الرمز.
- **`broken-balance-rule`** — موازين ذات كفتين تحدد قيماً نسبية، وميزان يدعي توازناً يناقض المعادلة المستنتجة.
- **`broken-tessellation-tile`** — نمط تبليط دوري متكرر يستنتج منه قانون التكرار وتحدد البلاطة المخالفة.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight, religion, romantic relationships, intelligence judgements, or awkward family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See roadmap §23.11.
