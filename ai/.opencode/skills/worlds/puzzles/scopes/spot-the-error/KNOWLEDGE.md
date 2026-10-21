# Scope Knowledge Profile: spot-the-error (اكتشف الخطأ)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> **Scope ID:** `puzzles.spot-the-error`  
> **Canonical Slug:** `spot-the-error`  
> **World ID:** `puzzles` (عالم الألغاز)  
> **Player-Facing Arabic Name:** **اكتشف الخطأ**  
> **Primary Cognitive Identity:** **The player must infer an objective rule, then find what violates it.**  
> **Core Question:** «ما هي القاعدة المنطقية المعمول بها هنا، وأين كُسرت بالتحديد؟»  
> **Strict Operational Boundary:** Always a mandatory two-step solve: (1) Infer the latent rule from the presented material itself; (2) Locate the single element or step that violates it. Noticing a detail without any underlying rule belongs to `observation-illusions`. Mental rotation of an object belongs to `assembly-rotation`. Tracing continuous kinetic motion belongs to `paths-motion`. General knowledge error checking violates `PUZZLES_WORLD_NO_TRIVIA`.

---

## 1. Identity & Scope Boundaries

### Core Cognitive Identity
`spot-the-error` (اكتشف الخطأ) challenges the player's capacity for inductive reasoning followed by deductive verification. The puzzle never explicitly states the governing rule; the player must observe the consistent elements to deduce the rule, and then pinpoint the exact element, position, or operation that breaks it.

### The Two-Step Cognitive Invariant
1. **Step 1 (Rule Induction):** The player examines 3 or more coherent elements (or an intact system) to infer the latent rule: "All outer shapes have one more side than the inner shape," "Each step rotates 45 degrees clockwise and alternates fill color," or "Cast shadows must fall in the direction opposite to the unified light source."
2. **Step 2 (Defect Detection):** The player tests the elements against the inferred rule to discover the unique breach. Exactly **one** element must violate the rule, and its violation must be mathematically, physically, or logically indisputable.

### What Is Strictly Inside
- Intruder shapes within a geometrically coherent set where the rule is emergent.
- Temporal, sequential, or lifecycle processes with a single misplaced or inverted step.
- Visual matrices or grids with a single cell that defies the row/column transformation.
- Inconsistent physical/environmental rules (impossible cast shadows, contradictory balance weights).
- Erroneous mappings or equations where an arithmetic or symbolic rule is violated.
- Symmetrical compositions or tessellations where multiple units establish a clear transformation rule and one unit breaks it.

### What Is Strictly Excluded
- **No Static Visual Differences Without Rules:** Merely finding an unaligned dot or a tiny scratch with no systemic rule belongs to `observation-illusions` (`spot-the-difference`).
- **No Impossible Objects / Escher Geometries:** Escher-style impossible structures and perspective depth illusions belong exclusively to `observation-illusions` (`impossible-object-perception`).
- **No Direct Single-Image Reflection Checks:** Looking at a single mirror reflection and spotting a mismatch belongs to `observation-illusions` (`reflection-fidelity`). In `spot-the-error`, multiple examples must establish a systemic reflection/transformation rule first.
- **No Isolated Asymmetry Defects:** One asymmetric flaw inside an otherwise symmetrical shape belongs to `observation-illusions` (`visual-asymmetry-detection`).
- **No Trivia or Cultural Fact-Checking:** "Find the error: Riyadh, Cairo, London, Tokyo" is strictly forbidden (`PUZZLES_WORLD_NO_TRIVIA`).
- **No Mental Shape Transformations:** Unfolding a cube or rotating a 3D block belongs to `assembly-rotation`.
- **No Continuous Kinetic Tracing:** Tracing interconnected moving gears or fluid pipes belongs to `paths-motion`.

---

## 2. Strong vs. Weak Territories

### Strong Content Territories
- **Emergent Geometric Rules:** Polygons with relationships between vertices, edges, internal subdivisions, and line crossings.
- **Physical Consistency:** Cast shadows with a single directional vector across a scene, balance scales with algebraic equivalences, causal domino/switch chains.
- **Ordered Processes:** Logical sequences (geometric origami unfolding, phase progressions, clock hands progression) with an inverted step.
- **Visual Ciphers & Matrices:** Simple icon substitution keys or 3x3 grids where one cell contradicts the horizontal/vertical operator.

### Weak / Boring Territories
- Arbitrary rules that feel like a "guess what the author was thinking" trick.
- Subtle pixel hunting disguised as an error.
- Complex multi-step mathematical calculations that feel like an exam worksheet.
- Ambiguous sets where two different rules are equally valid, pointing to two different errors.

---

## 3. Evidence Opportunities & Assets
- Clean vector graphics (SVG) with stark contrast and clear geometric outlines.
- Clear structural layout so all elements are visible from 3 meters on a shared TV screen.
- High legibility on mobile controllers for text-only options (`العنصر أ`, `الخطوة 3`, `الميزان ج`).

---

## 4. Canonical Puzzle Family Definitions (12 Approved Families)

### 1. `intruder-element` (العنصر الدخيل على المجموعة)
- **Player Solve:** استنتاج الخاصية الهندسية أو المنطقية المشتركة بين عناصر المجموعة، وتحديد العنصر الشاذ الوحيد الذي لا تنطبق عليه.
- **Scope Identity:** The quintessential spot-the-error archetype. A set of 4-6 items where all items share a non-trivial structural rule except one.
- **Interaction Shapes:**
  - Shape A: 4 geometric figures; three have an odd number of vertices and one has an even number.
  - Shape B: 4 compound shapes; three have matching internal and external line counts, one has a mismatch.
  - Shape C: 4 figures; three are identical under 2D rotation, but one is a chiral reflection (mirror image).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s fast visual grouping, 4 distinct options on phone).
  - RYO: `EXCELLENT` (Instant visual recognition rewards speed).
  - Bomb: `EXCELLENT` (High-intensity odd-one-out pressure).
  - Closest: `DO_NOT_FORCE` (Categorical set; no distance metric between options).
- **Mechanic Notes:** Shared screen shows 4 clearly labeled elements (`A`, `B`, `C`, `D`). Phone displays 4 buttons.
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** 4 large, clean vector panels on a neutral backdrop with letters A, B, C, D.
- **Phone UI:** 4 text buttons: `[العنصر أ]`, `[العنصر ب]`, `[العنصر ج]`, `[العنصر د]`.
- **Concrete Arabic Examples:**
  - «أربعة أشكال هندسية، ثلاثة منها تحتوي على عدد أضلاع زوجي بينما يحتوي شكل واحد على عدد فردي. ما هو العنصر الدخيل؟»
  - «أربعة أسهم مركبة، ثلاثة منها تدور بزاوية قائمة مع اتجاه عقارب الساعة بينما الرابع يدور عكسها. حدد العنصر الشاذ.»
- **Anti-Patterns:** Sets based on trivia knowledge (e.g. 3 desert animals and 1 marine animal). Sets where the rule is subjective.
- **Distinction:** Differs from `false-classification-member` because there are no explicit bins or categories; the rule is entirely emergent from the single set.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG.

---

### 2. `order-violation` (خلل الترتيب والتسلسل المنطقي)
- **Player Solve:** فحص تسلسل مرحلي أو مسار تصاعدي واكتشاف الخطوة أو العنصر الذي كسر الترتيب المنطقي الصحيح.
- **Scope Identity:** A sequence with an objective sorting criterion (size, growth, angle, quantity, temporal phases) where exactly two adjacent items are swapped or one item is positioned prematurely.
- **Interaction Shapes:**
  - Shape A: 5 stages of an unfolding shape where stage 4 appears before stage 3.
  - Shape B: A sequence of filled glasses arranged by volume with one out-of-order container.
  - Shape C: Progressive rotation of an arrow in 30-degree increments where one step skips to 90 degrees.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s linear scan, rapid spotting).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (The defect is a categorical swap or misplaced item; treating sequence index 1..N as a distance metric where step 5 is closer to step 6 than step 3 is an artificial index hack. Proximity has no meaningful gameplay interpretation).
- **Mechanic Notes:** Shared screen shows horizontal sequence of numbered steps (1 through 6). Phone displays multiple-choice buttons.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Horizontal sequence of numbered steps (1 through 6) clearly laid out across the screen.
- **Phone UI:** Buttons `[الخطوة 2]`, `[الخطوة 3]`, `[الخطوة 4]`, `[الخطوة 5]`.
- **Concrete Arabic Examples:**
  - «تسلسل يوضح مراحل اكتمال تظليل قرص دائري بنسبة 20% في كل خطوة. أي خطوة وُضعت في مكان خاطئ؟»
  - «مجموعة أشكال مرتبة تصاعدياً حسب عدد الزوايا من الأصغر للأكبر. أي شكل يكسر ترتيب السلسلة؟»
- **Anti-Patterns:** Historical timelines, biographical ordering, or non-visual verbal sequences.
- **Distinction:** Differs from `intruder-element` because all items belong to the same sequence; only their positional arrangement is flawed.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG sequence.

---

### 3. `broken-visual-pattern` (الخلل في النمط والمصفوفة البصرية)
- **Player Solve:** استنباط القاعدة الحاكمة لصفوف أو أعمدة مصفوفة بصرية وتحديد الخلية التي تحتوي على عنصر يكسر النمط.
- **Scope Identity:** A visual matrix (typically 3x3) where the rule holds true across all rows and columns except for one defective cell.
- **Interaction Shapes:**
  - Shape A: A 3x3 grid of shapes where each row adds a dot, but one cell has two dots subtracted.
  - Shape B: A grid where row elements combine via visual addition, and one cell shows an incorrect combination.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (High-engagement deductive puzzle).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Grid cell identity is discrete/categorical).
- **Mechanic Notes:** Shared screen displays a 3x3 grid with labeled cells (e.g., A1, B2, C3). Phone lists cell coordinates.
- **Target Solve Time:** 10–14 seconds.
- **Shared Screen:** High-contrast 3x3 grid with prominent cell identifiers.
- **Phone UI:** Multiple-choice grid options `[A3]`, `[B2]`, `[C1]`, `[C3]`.
- **Concrete Arabic Examples:**
  - «مصفوفة أشكال 3×3 تزداد خطوطها في كل صف بمقدار خط واحد من اليمين لليسار. أي خلية تحتوي على الشكل الخاطئ؟»
  - «شبكة أنماط بصرية يتغير فيها اتجاه السهم بـ 90 درجة مع كل عمود. حدد الخلية التي تكسر هذا النمط.»
- **Anti-Patterns:** Leaving the cell blank and asking what goes in it (that is an archetype of standard matrices); here all cells are filled and one contains an ACTIVE ERROR.
- **Distinction:** Differs from `order-violation` because patterns are multi-dimensional (rows and columns simultaneously).
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG grid.

---

### 4. `invalid-transformation-step` (الخطوة غير الصحيحة في التحول)
- **Player Solve:** تتبع مراحل تحول تدريجي لشكل وتحديد المرحلة التي حدث فيها تحول غير متسق مع قاعدة التغير المعتمدة.
- **Scope Identity:** Focuses on dynamic morphological transformation (folding, slicing, color blending, geometric deformation) where a single transitional state violates continuity.
- **Interaction Shapes:**
  - Shape A: A square progressively morphing into an octagon through corner truncation; step 3 truncates only one corner instead of all four.
  - Shape B: An ink droplet expanding in equal radial waves where step 4 becomes asymmetric or shrinks.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Step index is categorical; no distance metric).
- **Mechanic Notes:** Shared screen shows arrows connecting transformation stages: 1 ➔ 2 ➔ 3 ➔ 4.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** Horizontal flow diagram with distinct numbered transition nodes.
- **Phone UI:** Buttons `[المرحلة 2]`, `[المرحلة 3]`, `[المرحلة 4]`, `[المرحلة 5]`.
- **Concrete Arabic Examples:**
  - «شكل هندسي يتحول تدريجياً عبر قص زواياه بالتساوي في كل مرحلة. أي مرحلة شهدت خطأً في تطبيق قاعدة القص؟»
  - «رسم يوضح تدرج انتقال اللون من الأبيض الكامل للأسود عبر 5 درجات رمادية متساوية. أي مرحلة خالفت التدرج الطبيعي؟»
- **Anti-Patterns:** Transforming shapes via random arbitrary distortion without an identifiable mathematical rule.
- **Distinction:** Differs from `assembly-rotation` because the player does not simulate the final state; the steps are laid bare and the player detects the procedural error.
- **Scalability:** `MEDIUM`.
- **Asset Req:** Clean 2D Vector SVG step diagram.

---

### 5. `impossible-shadow-violation` (خطأ الظلال ومصدر الضوء)
- **Player Solve:** استنتاج اتجاه مصدر الضوء الفيزيائي الموحد في المشهد عبر عدة مجسمات، ورصد المجسم الوحيد الذي يلقي ظلاً في اتجاه مستحيل.
- **Scope Identity:** Grounded in environmental optics. A scene displays 4-5 objects (trees, posts, blocks); 4 cast shadows consistent with a single sun/lamp vector, while one object's shadow casts in an impossible direction.
- **Interaction Shapes:**
  - Shape A: 4 vertical posts on a plane; three cast shadows toward the top-right, one casts shadow toward the bottom-left.
  - Shape B: A sunny courtyard where people and trees have shadows; one building casts a shadow that contradicts the sun's position.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Extremely intuitive physical intuition, immediate team debate).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `GOOD` (Between-Two-Anchors is acceptable ONLY when the scene itself is intentionally authored along a meaningful one-dimensional horizontal panorama, e.g. from left anchor A to right anchor B. Never use for arbitrary 2D targeting).
- **Mechanic Notes:** In Moving XO, options identify candidate objects (`العمود أ`, `العمود ب`, إلخ).
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** High-contrast rendering of objects casting distinct dark shadows on a light plane.
- **Phone UI:** Multiple choice with object labels `[الشجرة أ]`, `[العمود ب]`, `[الصندوق ج]`, or 1D horizontal slider.
- **Concrete Arabic Examples:**
  - «مشهد نهاري مشمس يحتوي على أربعة أعمدة إنارة. ثلاثة منها تلقي ظلالاً متناسقة مع اتجاه الشمس، بينما عمود واحد ظله في اتجاه خاطئ. أي عمود هو؟»
  - «غرفة تضيئها شمعة وحيدة في المنتصف. أي من الصناديق الأربعة يلقي ظلاً يناقض موضع الشمعة؟»
- **Anti-Patterns:** Artistic shading inconsistencies that are subtle rendering artifacts rather than clear vector errors.
- **Distinction:** Differs from `observation-illusions` because the answer requires vector triangulation of an invisible light source rule.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D/3D Vector SVG.

---

### 6. `wrong-number-mapping` (الخطأ في معادلة الربط العددي)
- **Player Solve:** استنتاج العملية الحسابية الرابطة بين أرقام الأشكال وتحديد الشكل أو الرقم الذي يحتوي على ناتج خاطئ.
- **Scope Identity:** Number logic and operational deduction. Several geometric figures (triangles, wheels, intersecting rings) contain numbers linked by an operational rule. One figure contains an erroneous number.
- **Interaction Shapes:**
  - Shape A: 4 triangles with numbers at the vertices and a central number; in three triangles `Center = (A + B) * C`, while the 4th violates it.
  - Shape B: A number pyramid where each brick is the sum of the two beneath it; one brick contains a flawed sum.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s rapid arithmetic rule testing).
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Targeting which shape or node has the defect is categorical).
- **Mechanic Notes:** Numbers must be single or double digits under 100 to keep the 15-second solve realistic.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** 4 diagrams labeled A, B, C, D with clear numerical typography.
- **Phone UI:** Buttons `[الشكل أ]`, `[الشكل ب]`, `[الشكل ج]`, `[الشكل د]`.
- **Concrete Arabic Examples:**
  - «أربعة مثلثات ترتبط أرقام رؤوسها بالرقم الموجود في مركزها وفق معادلة ثابتة. أي مثلث يحتوي على رقم خاطئ في مركزه؟»
  - «هرم أرقام تتساوى فيه كل لبنة مع مجموع اللبنتين تحتها مباشرة. في أي صف/لبنة وقع الخطأ الحسابي؟»
- **Anti-Patterns:** Multi-digit complex long division or algebra equations that feel like a math exam.
- **Distinction:** Differs from `numbers-estimation` because all figures are complete and the task is identifying the defect in the rule, not computing a missing quantity.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG with clear numerals.

---

### 7. `invalid-reflection-rule` (خلل قاعدة التناظر والانعكاس المحوري)
- **Player Solve:** استنباط قاعدة الانعكاس والتحول المحوري من عدة نماذج، وتحديد النموذج الوحيد الذي خرق القاعدة.
- **Scope Identity:** Multi-example reflection rule deduction. Multiple pairs or panels establish an objective reflection/transformation rule (e.g. horizontal flip with inverted fill color); exactly one pair violates this established transformation rule.
- **Interaction Shapes:**
  - Shape A: 4 pairs of figures (A, B, C, D); in three pairs, Shape 2 is a horizontal mirror reflection of Shape 1 with inverted colors; in pair D, the colors are not inverted.
  - Shape B: 4 reflected tiles across a grid axis where one tile fails the inferred reflection operation.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical pair identification).
- **Mechanic Notes:** Multiple examples MUST establish the rule. If the puzzle is simply "look at this single reflection and spot what is wrong", it belongs to `observation-illusions/reflection-fidelity`.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** 4 pairs labeled A, B, C, D with clear axes of reflection.
- **Phone UI:** Buttons `[الزوج أ]`, `[الزوج ب]`, `[الزوج ج]`, `[الزوج د]`.
- **Concrete Arabic Examples:**
  - «أربعة أزواج من الأشكال الهندسية، ثلاثة منها تطبق قاعدة انعكاس محوري محددة مع عكس الألوان، بينما زوج واحد كسر هذه القاعدة. أي زوج هو؟»
  - «تأمل النماذج الأربعة للتحول بالمرآة؛ أي نموذج تضمن خطأً في تطبيق قاعدة الانعكاس؟»
- **Anti-Patterns:** Single-image reflection comparison with no rule to deduce (violates Scope boundary; belongs to `observation-illusions`).
- **Distinction:** Requires inferring a transformation rule across multiple exemplars, distinct from static reflection inspection.
- **Scalability:** `HIGH`.
- **Asset Req:** High-resolution 2D Vector SVG.

---

### 8. `broken-chain-link` (الحلقة المكسورة في السلسلة السببية)
- **Player Solve:** تتبع مسار سلسلة سببية متسلسلة وتحديد الحلقة المنقطعة أو المتصلة بشكل خاطئ يمنع اكتمال الأثر.
- **Scope Identity:** Causal and mechanical logic defect. A setup of dominoes, levers, electrical switches, or falling balls is intended to trigger a final event. Exactly one connection is faulty, preventing success.
- **Interaction Shapes:**
  - Shape A: A line of dominoes where one gap is clearly wider than the height of the falling tile.
  - Shape B: A multi-switch circuit meant to illuminate a bulb where one switch is reversed or open.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Locating the defective switch/link is a categorical identification; treating link index as distance is an artificial index hack).
- **Mechanic Notes:** Shared screen displays the entire causal chain from Start to Goal with checkpoints marked `A`, `B`, `C`, `D`.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Clear kinetic illustration with marked stages.
- **Phone UI:** Buttons `[الحلقة أ]`, `[الحلقة ب]`, `[الحلقة ج]`, `[الحلقة د]`.
- **Concrete Arabic Examples:**
  - «مسار متسلسل من قطع الدومينو المتراصة لإسقاط جرس التنبيه. أي مسافة بين قطعتين كسرَت السلسلة ولن تسقط القطعة التالية؟»
  - «دائرة كهربائية بسيطة تحتوي على 4 قواطع موصولة. أي قاطع وُضع بوضعية خاطئة منعت إضاءة المصباح؟»
- **Anti-Patterns:** Dynamic animation that plays out before the answer; the diagram must be a static freeze-frame evaluated through mental physics.
- **Distinction:** Differs from `paths-motion` because the question is NOT "which outcome happens," but "which specific defective part prevents the system's intended function."
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG schematic.

---

### 9. `false-classification-member` (الخطأ في تصنيف الفئات والخواص)
- **Player Solve:** استنتاج معيار التصنيف الذي قُسمت بناءً عليه العناصر إلى مجموعتين، وتحديد العنصر الموضوع بالخطأ في المجموعة غير المناسبة.
- **Scope Identity:** Categorical and property sorting. Items are visually placed into two boxes or zones (Group 1 vs. Group 2). The player deduces the structural criterion and spots the single item misplaced in the wrong box.
- **Interaction Shapes:**
  - Shape A: Two shelves of tokens; Shelf A contains 4 symmetrical shapes, Shelf B contains asymmetric shapes, with one symmetrical token placed on Shelf B.
  - Shape B: Two circles of a Venn diagram where one element sits in the wrong partition.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «صندوقان من الرموز الهندسية؛ الصندوق (أ) يضم مضلعات محدبة والصندوق (ب) يضم مضلعات مقعرة. أي عنصر وُضع في الصندوق الخاطئ؟»
  - «مجموعتان من الأشكال؛ المجموعة الأولى تملك زوايا حادة فقط والثانية تملك زوايا منفرجة. أي شكل خالف تصنيف مجموعته؟»
- **Anti-Patterns:** Trivia-based categories (countries, animals, elements). Must strictly use visual, geometric, or structural properties.
- **Distinction:** Differs from `intruder-element` because elements are explicitly organized into two comparative groups.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG.

---

### 10. `wrong-code-translation` (الخطأ في تطبيق الشفرة والرموز)
- **Player Solve:** مقارنة جدول مفاتيح الشفرة البصرية بالرموز المشفرة وتحديد الكلمة أو العبارة التي تضمنت خطأ في فك الرمز.
- **Scope Identity:** Symbolic decoding audit. A master legend maps 4-5 geometric runes to letters or digits. Below it, 4 decoded examples are presented; three follow the key with 100% fidelity, but one has an incorrect decoded character.
- **Interaction Shapes:**
  - Shape A: 5 runes mapping to digits 1 to 5; four 3-rune sequences are translated, and sequence C contains one digit that does not match its rune.
  - Shape B: A substitution cipher translating arrows to directional words; one line has an incorrect translation.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «جدول شفرة بسيط يربط 4 رموز بأربعة أحرف. أي من الكلمات المشفرة الأربع تضمنت خطأً في تطبيق مفتاح الشفرة؟»
  - «مفتاح رموز يترجم أشكال النجوم إلى أرقام. في أي من العمليات الأربع التالية كُتب رقم لا يطابق رمز النجمة الخاص به؟»
- **Anti-Patterns:** Massive substitution keys that take 30 seconds just to read. Keep keys to 4-5 simple symbols.
- **Distinction:** Differs from `wordplay-letters` (`arabic-cipher-dhad`) because the symbols represent abstract visual tokens and focus on defect audit.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D Vector SVG.

---

### 11. `broken-balance-rule` (الخلل في توازن المعادلة المصورة)
- **Player Solve:** استنتاج الأوزان النسبية للرموز من كفتي ميزان صحيحتين، وتحديد الكفة أو المعادلة الثالثة التي تدعي وزناً مناقضاً للقاعدة المستنتجة.
- **Scope Identity:** Visual algebraic balance deduction. Two scales show balanced states (e.g., Scale 1: 1 Cube = 2 Spheres; Scale 2: 1 Sphere = 2 Cones). A third scale claims an equivalence that mathematically contradicts the deduced relationships.
- **Interaction Shapes:**
  - Shape A: Two balanced scales establish object values; Scale 3 claims 1 Cube = 3 Cones (when it should be 4). The player identifies Scale 3 as the error.
  - Shape B: Four standalone balanced scales with geometric weights; in three scales the equation holds, in the fourth it is mathematically impossible.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Identifying which scale is contradictory is categorical).
- **Mechanic Notes:** Shapes must have distinct silhouettes and colors (e.g. Red Cube, Blue Sphere, Yellow Pyramid).
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «الميزان الأول: أسطوانة واحدة تعادل كرتين. الميزان الثاني: كرة واحدة تعادل مكعبين. أي من الموازين التالية يقدم معادلة خاطئة تناقض هذه القاعدة؟»
  - «أربعة موازين ذات كفتين، ثلاثة منها في حالة توازن حقيقي رياضي بينما ميزان واحد ادعى توازناً مستحيلاً. أي ميزان هو؟»
- **Anti-Patterns:** Fractions or systems of 4 simultaneous equations that take more than 15 seconds to solve.
- **Distinction:** Differs from `numbers-estimation` (`balance-scale-weight`) because the player is not calculating an unknown weight, but spotting the logical contradiction in a set of stated balances.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D Vector SVG balance scales.

---

### 12. `broken-tessellation-tile` (الخلل في نمط التبليط الهندسي)
- **Player Solve:** إدراك النمط التكراري الدوري لشبكة من البلاطات الهندسية وتحديد البلاطة الوحيدة التي تخل بقاعدة التناوب أو الدوران.
- **Scope Identity:** Periodic wallpaper and tessellation regularity audit. Multiple adjacent tiles establish an unambiguous geometric translation or rotation rule; exactly one tile breaks this inferred transformation rule.
- **Interaction Shapes:**
  - Shape A: A hexagonal honeycomb where each cell alternates 3 colors according to a strict rotation rule; one cell swaps two colors.
  - Shape B: An interlocking bird/fish tessellation where one tile is inverted against the periodic repeat pattern.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Tile coordinate selection).
- **Mechanic Notes:** The player must infer the repetition rule across multiple tiles before spotting the breach. If it is simply one visibly asymmetric defect inside a symmetrical pattern, it belongs to `observation-illusions/visual-asymmetry-detection`.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «نمط تبليط هندسي يتكرر بنظام تناوب دقيق للألوان والأشكال عبر الصفوف والأعمدة. بلاطة واحدة فقط رُسمت بخلل يكسر النمط التكراري، حدد موقعها.»
  - «أرضية فسيفساء مكونة من مضلعات متداخلة تدور باتجاه ثابت في كل صف. أي بلاطة وُضعت باتجاه دوران خاطئ؟»
- **Anti-Patterns:** Isolated asymmetric defects in a standalone shape (that belongs to `observation-illusions/visual-asymmetry-detection`).
- **Distinction:** Focuses on periodic translation/rotation rules across multiple tiling units.
- **Scalability:** `HIGH`.
- **Asset Req:** High-resolution 2D Vector SVG.

---

## 5. Mechanic Compatibility Matrix

| # | Family Slug | Arabic Name | Moving XO | RYO | Bomb | Closest | Primary Media | Typical Phone Interaction |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| 1 | `intruder-element` | العنصر الدخيل على المجموعة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Geometry Vector | Multiple Choice (4 shapes) |
| 2 | `order-violation` | خلل الترتيب والتسلسل المنطقي | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Sequence Vector | Multiple Choice (4 steps) |
| 3 | `broken-visual-pattern` | الخلل في النمط والمصفوفة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Grid Vector | Multiple Choice (Coordinates) |
| 4 | `invalid-transformation-step` | الخطوة غير الصحيحة في التحول | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Flow Diagram | Multiple Choice (4 stages) |
| 5 | `impossible-shadow-violation` | خطأ الظلال ومصدر الضوء | **EXCELLENT** | **EXCELLENT** | **GOOD** | **GOOD** | 2D/3D Optics Vector | MC / Closest (1D Panorama) |
| 6 | `wrong-number-mapping` | الخطأ في معادلة الربط العددي | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Math Diagram | Multiple Choice (4 figures) |
| 7 | `invalid-reflection-rule` | خلل قاعدة التناظر والانعكاس | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Reflection Pairs | Multiple Choice (4 pairs) |
| 8 | `broken-chain-link` | الحلقة المكسورة في السلسلة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Causal Schematic | Multiple Choice (4 links) |
| 9 | `false-classification-member` | الخطأ في تصنيف الفئات والخواص | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Classification Vector | Multiple Choice (4 items) |
| 10 | `wrong-code-translation` | الخطأ في تطبيق الشفرة والرموز | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Cipher Layout | Multiple Choice (4 options) |
| 11 | `broken-balance-rule` | الخلل في توازن المعادلة المصورة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Balance Scales | Multiple Choice (4 scales) |
| 12 | `broken-tessellation-tile` | الخلل في نمط التبليط الهندسي | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Tessellation Vector | Multiple Choice (Tile label) |

---

## 6. Closest Dedicated Review (Spot the Error)

In Puzzles World, Closest must remain **reasoning-derived estimation**, never trivia recall (§23.11).  
**Runtime Reality:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders, or Between-Two-Anchors.

### Rejection of Index-As-Distance:
Do NOT treat categorical item indexes as meaningful Closest distance:
- ❌ **Rejected:** Using step number (e.g. 1 to 6) as a fake slider where guessing step 5 when the error is at step 6 is considered "closer". The error is either at step 6 or it is not; proximity between discrete steps has no valid gameplay interpretation.
- ❌ **Rejected:** Using option numbers (1..4) or tile IDs as numeric scales.

### Approved Closest Applications in Spot the Error:
1. **Horizontal Panoramic Position (Between-Two-Anchors):**
   - Supported Family: `impossible-shadow-violation` (`GOOD`).
   - Interaction: An authored horizontal landscape scene stretches between Left Anchor [A] and Right Anchor [B] (e.g. a row of 6 lampposts along a street). Exactly one post casts a shadow contradicting the sun vector. Players place a marker on a continuous 1D slider between Anchor A and Anchor B. Closest horizontal coordinate to the flawed object wins.
   - **Strict Restriction:** Approved ONLY when the scene itself is intentionally authored along a genuine 1D physical axis. Never generalize to 2D image targeting.

---

## 7. Overlap Audit & Scope Routing Rules

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`spot-the-error`**<br>(اكتشف الخطأ) | **Infer an objective rule, then locate what breaks it.** | **RULE:** Must be a mandatory two-step solve: infer the rule, then find the single defect. **No static noticing without rules, no impossible Escher geometries.** |
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **ROUTING:** If an image presents an impossible Escher/Penrose structure, route to **`observation-illusions`** (`impossible-object-perception`). If a scene has an isolated visual asymmetry or a single reflection mismatch, route to `observation-illusions` (`visual-asymmetry-detection`, `reflection-fidelity`). |
| **`assembly-rotation`**<br>(تركيب وتدوير) | **Mentally manipulate, fold, slice, assemble, or rotate the object itself.** | **ROUTING:** If solving requires mentally folding, rotating, or assembling 3D solids, route to **`assembly-rotation`**. |
| **`paths-motion`**<br>(مسارات وحركة) | **Simulate dynamic evolution across time or kinematic chain.** | **ROUTING:** If the challenge requires tracing kinetic movement through moving gears, flowing pipes, or circuits to see where energy flows, route to **`paths-motion`**. (If a static diagram has an isolated structural break preventing function, it belongs to `spot-the-error`). |
| **`numbers-estimation`**<br>(أرقام وتقديرات) | **Playful numerical intuition and mental calculation.** | **ROUTING:** If computing a missing number in a valid series, route to **`numbers-estimation`**. (If all numbers are present and one is an active error violating a rule, route to `spot-the-error`). |

---

## 8. Generation Scalability

| Scalability Tier | Families Included | Justification |
|---|---|---|
| **HIGH** | `intruder-element`, `order-violation`, `broken-visual-pattern`, `impossible-shadow-violation`, `wrong-number-mapping`, `invalid-reflection-rule`, `broken-chain-link`, `false-classification-member`, `wrong-code-translation`, `broken-balance-rule`, `broken-tessellation-tile` | Generative depth across geometric configurations, visual sequences, matrix transformations, balance systems, and ciphers. |
| **MEDIUM** | `invalid-transformation-step` | Multi-stage morphological progressions require curated vector illustration. |
| **SPECIALIZED** | — | All 12 approved families provide sustainable depth. |

---

## 9. Batch-Level Variety Rules

When generating or reviewing an authored batch for `spot-the-error`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Domain Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct error modalities:
   - *Modality A (Geometric & Set Properties):* `intruder-element`, `broken-visual-pattern`, `false-classification-member`, `broken-tessellation-tile`.
   - *Modality B (Physical & Environmental Consistency):* `impossible-shadow-violation`, `broken-chain-link`, `broken-balance-rule`.
   - *Modality C (Sequential, Symbolic & Mathematical):* `order-violation`, `invalid-transformation-step`, `wrong-number-mapping`, `wrong-code-translation`, `invalid-reflection-rule`.
4. **Zero Rule Re-Use:** Never reuse the identical underlying mathematical or geometric rule in the same batch.
5. **Dynamic Shuffling:** Note that answer option presentation order is randomized dynamically at session runtime by the game engine; authors should write clear, distinct distractors without worrying about artificial manual position balancing.

---

## 10. Library Evolution Rules

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 12 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against `observation-illusions`, `assembly-rotation`, and `numbers-estimation`.
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
