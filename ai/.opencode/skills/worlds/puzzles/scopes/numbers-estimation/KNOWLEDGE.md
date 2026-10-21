# Scope Knowledge Profile: numbers-estimation (أرقام وتقديرات)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> **Scope ID:** `puzzles.numbers-estimation`  
> **Canonical Slug:** `numbers-estimation`  
> **World ID:** `puzzles` (عالم الألغاز)  
> **Player-Facing Arabic Name:** **أرقام وتقديرات**  
> **Primary Cognitive Identity:** **Playful numerical intuition, visual estimation, and pattern discovery.**  
> **Core Question:** «كم المقدار، أو ما هو الرقم الناقص؟»  
> **Strict Operational Boundary:** Estimations must be visually anchored or reasoning-derived. Patterns must provide an immediate 'aha!' discovery. Direct school arithmetic worksheet calculations, long multi-digit operations, and memorized math tables are strictly excluded.

---

## 1. Identity & Scope Boundaries

### Core Cognitive Identity
`numbers-estimation` (أرقام وتقديرات) is the numerical and quantitative territory of Puzzles World. It emphasizes rapid perceptual estimation, visual proportions, scale intuition, and short discoverable number sequences. It is **not** a mathematics classroom exam. The player succeeds through sharp visual-spatial approximation, clever relational reasoning, or noticing an elegant pattern, never through grueling pencil-and-paper computation.

### What Is Strictly Inside
- Perceptual visual quantity estimation (scatters, clusters, jars without exact one-by-one counting).
- Proportional estimation (fill levels, shaded fractions, geometric partitions on 0–100% sliders).
- Short discoverable number patterns and grids that produce a quick "aha!" insight.
- Spatial/temporal quantitative intuition (clock angles, Between-Two-Anchors graduations, ratio mixes).
- Playful physical balance equivalences.

### What Is Strictly Excluded
- **No School Arithmetic Worksheets:** Long multi-digit addition, subtraction, multiplication, or division problems.
- **No Memorized Math Fact Recall:** Trivial multiplication tables (جدول الضرب) or rote formula recall.
- **No Arbitrary "Guess My Rule" Traps:** Sequences with obscure or ambiguous generative rules.
- **No Direct Arithmetic Drills:** `digital-sum-root` and mechanical digit summing are strictly excluded.
- **No Factual/Statistical Trivia:** Questions asking for real-world statistics (e.g. population, distance between cities) violate `PUZZLES_WORLD_NO_TRIVIA`.

---

## 2. Strong vs. Weak Territories

### Strong Content Territories
- **Visual Analog Quantities:** Partially filled beakers, battery gauges, clusters of dots, shaded pie slices.
- **Geometric Number Relations:** Triangle corners multiplying to a center, balance scales with intuitive shapes.
- **Continuous 1D Sliders:** Where being "closer" represents genuine quantitative intuition and partial success.

### Weak / Boring Territories
- Pure arithmetic drills disguised with icons.
- Obscure algebraic puzzles requiring simultaneous linear equations with fractions.
- High-precision counts that force players into frantic, unfun one-by-one counting.

---

## 3. Evidence Opportunities & Assets
- High-contrast vector graphics for dials, gauges, containers, and scatter clusters.
- Prominent numerals and clear layout legible from 3 meters on a shared TV screen.
- Smooth, responsive 1D slider controls for Closest on mobile devices.

---

## 4. Canonical Puzzle Family Definitions (12 Approved Families)

### 1. `missing-number-pattern` (الرقم الناقص في المتتالية)
- **Player Solve:** استنتاج القاعدة الحسابية لمتتالية أرقام وإيجاد الرقم الناقص.
- **Scope Identity:** Number sequence reasoning. The player spots an intuitive pattern (e.g. +3, double, squares, alternating step) and identifies the missing value.
- **Interaction Shapes:**
  - Shape A: Linear sequence with an empty node in the middle: `3 · 7 · [ ? ] · 15 · 19`.
  - Shape B: Geometric progression with small integers: `2 · 6 · 18 · [ ? ]`.
  - Shape C: Alternating two-step progression: `5 · 10 · 8 · 16 · 14 · [ ? ]`.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s rapid pattern spot; 4 multiple choice options).
  - RYO: `EXCELLENT` (High confidence variance between intuitive spotters and hesitaters).
  - Bomb: `EXCELLENT` (Short, sharp solve under pressure).
  - Closest: `DO_NOT_FORCE` (The missing term is an exact derived logical answer; guessing 41 when the answer is 42 is an error, not an estimate. Proximity has no meaningful gameplay interpretation).
- **Mechanic Notes:** Multiple choice options must contain plausible rule-distractors.
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** Large horizontal number track with clear spacing and a bold `[ ? ]`.
- **Phone UI:** 4 text buttons with numbers: `[11]`, `[12]`, `[13]`, `[14]`.
- **Concrete Arabic Examples:**
  - «ما الرقم المفقود في المتتالية: (٤ · ٨ · ١٦ · [ ? ] · ٦٤)؟» ➔ ٣٢.
  - «أكمل المتتالية العددية التالية: (٣ · ٧ · ١١ · ١٥ · [ ? ])؟» ➔ ١٩.
- **Anti-Patterns:** Arbitrary, highly obscure polynomial sequences; multi-digit arithmetic; trivial +1 sequences. Must produce a short, discoverable pattern / aha moment.
- **Distinction:** Differs from `order-violation` in `spot-the-error` because here all existing numbers are valid and one missing number is derived.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean typography on number track.

---

### 2. `visual-quantity-estimate` (تقدير الكميات والمجموعات البصرية)
- **Player Solve:** تقدير عدد العناصر المتناثرة بصرياً دون عد فردي بطيء.
- **Scope Identity:** Perceptual estimation of unorganized scatters (e.g. 30–100 items in a jar or field).
- **Interaction Shapes:**
  - Shape A: Marbles in a transparent glass container.
  - Shape B: Scattered coins or stars across a canvas.
  - Shape C: Flock of flying birds in a silhouette sky.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 well-separated multiple choice ranges).
  - RYO: `EXCELLENT` (Teams bet on estimation accuracy).
  - Bomb: `GOOD` (Rapid visual estimation under countdown).
  - Closest: `EXCELLENT` (The premier canonical Closest family: 1D continuous slider from 10 to 120).
- **Mechanic Notes:** In Moving XO, options must be wide enough to be fair (e.g. 25, 45, 75, 110). In Closest, a continuous slider allows proximity scoring.
- **Target Solve Time:** 6–9 seconds.
- **Shared Screen:** High-contrast graphic showing the scattered items.
- **Phone UI:** 1D slider (Closest) or 4 range choices (Moving XO).
- **Concrete Arabic Examples:**
  - «قدّر عدد الكرات الزجاجية في هذا الإناء تقريباً.» (العدد الفعلي: 58).
  - «كم نجمة مضيئة تظهر في هذا المشهد تقريباً؟» (الخيارات: 20 · 45 · 75 · 110).
- **Anti-Patterns:** Displays with fewer than 15 items (which invites exact counting) or exceeding 150 (which turns into wild guessing).
- **Distinction:** Non-organized distribution requiring true estimation rather than counting.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D vector scatter illustrations.

---

### 3. `proportion-estimate` (تقدير النسبة المئوية والامتلاء)
- **Player Solve:** تقدير النسبة المئوية للجزء المظلل أو كمية السائل داخل وعاء.
- **Scope Identity:** Proportional and fractional visual estimation.
- **Interaction Shapes:**
  - Shape A: Beaker or cylindrical tank filled to an unmarked level (e.g. 68%).
  - Shape B: Pie chart or ring meter with a colored arc (e.g. 35%).
  - Shape C: Progress bar or battery meter without tick marks (e.g. 72%).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 distinct percentage options: 25%, 45%, 65%, 85%).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Native 1D continuous slider 0% to 100%).
- **Mechanic Notes:** Avoid obvious benchmark lines (quarters, halves) in the image itself; the player must estimate the fill ratio purely by eye.
- **Target Solve Time:** 6–9 seconds.
- **Shared Screen:** Large clean render of the container or meter without tick marks.
- **Phone UI:** 1D continuous percentage slider (0% to 100%) or 4 percentage buttons.
- **Concrete Arabic Examples:**
  - «قدّر النسبة المئوية لكمية العصير المتبقية في هذا الكوب.» (النسبة الفعلية: 65%).
  - «ما نسبة المساحة المظللة باللون الأزرق في هذا القرص الدائري تقريباً؟» (الخيارات: 15% · 35% · 55% · 75%).
- **Anti-Patterns:** Containers with embossed measurement marks or grid lines that turn the puzzle into trivial reading.
- **Distinction:** Estimates continuous proportion (0–100%) rather than discrete item count.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector meters and containers.

---

### 4. `balance-scale-weight` (أوزان كفة الميزان)
- **Player Solve:** استنتاج الوزن المكافئ لمجسم هندسي من موازين ذات كفتين.
- **Scope Identity:** Visual algebraic balance deduction with integer shape equivalences.
- **Interaction Shapes:**
  - Shape A: Scale 1: 1 Cube = 2 Spheres; Scale 2 shows 1 Cube + 1 Sphere = [ ? ] Spheres.
  - Shape B: Pan scale balanced with numbered weights and geometric tokens.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s deductive substitution; 4 multiple choice options).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Weight equivalence is an exact derived integer value; guessing 3 when the exact answer is 4 is an algebraic error, not an estimation).
- **Mechanic Notes:** Keep substitutions to 1 or 2 steps maximum with single-digit integers.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Clean pan scales with colored 3D tokens.
- **Phone UI:** 4 text buttons with candidate integer values.
- **Concrete Arabic Examples:**
  - «الميزان الأول: أسطوانة = مكعبان. الميزان الثاني: مكعب = كرتان. كم كرة تعادل أسطوانة واحدة؟» ➔ ٤ كرات.
  - «إذا كانت كفة الميزان متوازنة بثلاثة مربعات في اليمين ووزن 18 كجم في اليسار، فما وزن المربع الواحد؟» ➔ ٦ كجم.
- **Anti-Patterns:** Fractional weights or 3-variable equations that take longer than 15s to compute.
- **Distinction:** Differs from `spot-the-error` (`broken-balance-rule`) because here all scales are true and the player computes the unknown weight.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D/3D vector balance scales.

---

### 5. `number-relationship-grid` (علاقات الأرقام في الشبكة)
- **Player Solve:** استنباط العملية الرياضية بين أرقام صفوف وأعمدة شبكة 3×3 لإيجاد الرقم المجهول.
- **Scope Identity:** 2D relational grid deduction. Rows or columns share a consistent arithmetic relation.
- **Interaction Shapes:**
  - Shape A: 3x3 grid where Row Sum is constant (e.g. Row 1: 3+5+7=15; Row 2: 4+5+6=15; Row 3: 2+?+5=15).
  - Shape B: 3x3 grid where Center = (Left + Right) / 2.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Deductive discovery of row/col rule).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (The missing cell is an exact derived number; proximity has no meaning).
- **Mechanic Notes:** Avoid obscure formulas; relationships must be simple addition, subtraction, or doubling.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** High-contrast 3x3 number grid with one empty cell containing `[ ? ]`.
- **Phone UI:** 4 multiple choice numbers.
- **Concrete Arabic Examples:**
  - «شبكة أرقام 3×3، مجموع أرقام كل صف فيها يساوي 20. ما الرقم الذي يجب وضعه في الخلية المجهولة؟» ➔ 8.
- **Anti-Patterns:** Arbitrary "guess my formula" puzzles; multiplication drills; heavy multi-step arithmetic. Must provide a quick, discoverable aha moment.
- **Distinction:** Differs from linear sequences by operating across two grid dimensions.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector grid.

---

### 6. `time-angle-intuition` (حدس زوايا عقارب الساعة والزمن)
- **Player Solve:** تقدير الزاوية بين عقربي الساعة أو الوقت الناتج عن حركة زاوية محددة.
- **Scope Identity:** Angular geometry and circular time intuition.
- **Interaction Shapes:**
  - Shape A: Clock showing 3:00 (90°), 4:00 (120°), or non-quarter times (e.g. 2:20).
  - Shape B: Angle between two directional arrows on a compass dial.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 multiple choice angle options).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Continuous angular slider from 0° to 180°).
- **Mechanic Notes:** Highly intuitive physical geometry. Players estimate the opening angle between hands.
- **Target Solve Time:** 7–10 seconds.
- **Shared Screen:** Large minimalist analog clock face with prominent hands.
- **Phone UI:** 1D angular slider (0°–180°) for Closest, or 4 angle choices.
- **Concrete Arabic Examples:**
  - «كم قياس الزاوية الصغرى بين عقربي الساعة عند تمام الساعة 4:00 تماماً؟» ➔ 120 درجة.
  - «قدّر الزاوية الحادة المتشكلة بين عقربي هذه الساعة بالدرجات تقريباً.»
- **Anti-Patterns:** Complex split-second fractional calculations (e.g. 3:47 and 12 seconds).
- **Distinction:** Connects time representation with angular geometry on a continuous spectrum.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D vector clock dials.

---

### 7. `between-two-anchors` (التقدير بين نقطتين مرجعيتين)
- **Player Solve:** تقدير موضع قيمة أو مؤشر على خط مستقيم مدرج بين نقطتي بداية ونهاية معروفتين.
- **Scope Identity:** Canonical 1D interpolation. An unmarked slider line has anchor A on the left and anchor B on the right. An arrow points to an intermediate location.
- **Interaction Shapes:**
  - Shape A: Number line from 0 to 100 with an arrow at ~63.
  - Shape B: Scale from 100 to 500 with a marker at ~350.
  - Shape C: Celsius thermometer between 0° and 50° with liquid at ~32°.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 distinct numeric values).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (The definition of Closest Between-Two-Anchors).
- **Mechanic Notes:** Shared screen displays the line and marker. Phone displays a continuous slider anchored to Min/Max.
- **Target Solve Time:** 6–9 seconds.
- **Shared Screen:** Horizontal number line anchored at ends with a bold target marker.
- **Phone UI:** 1D slider matching the anchor span.
- **Concrete Arabic Examples:**
  - «ما القيمة التقريبية التي يشير إليها السهم على هذا الخط الممتد من 0 إلى 200؟» (القيمة: 140).
  - «إذا كانت البداية (أ) تمثل 0 والنهاية (ب) تمثل 500، فأين تقع القيمة 320 تقريباً؟»
- **Anti-Patterns:** Trivial midpoints (exact 50%) or lines cluttered with dozens of intermediate tick marks.
- **Distinction:** Pure spatial interpolation between two explicit reference anchors.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 1D vector line and marker graphics.

---

### 8. `relative-magnitude-sort` (المقارنة النسبية بين المقادير)
- **Player Solve:** تحديد المقدار الأكبر أو الأصغر عبر المقارنة البصرية والرياضية السريعة.
- **Scope Identity:** Rapid comparative evaluation without full computation.
- **Interaction Shapes:**
  - Shape A: 4 visual clusters, which has the greatest density?
  - Shape B: 4 simple multiplication/addition expressions, which yields the largest result?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Immediate 4-choice comparison).
  - RYO: `EXCELLENT` (Speed comparison rewards decisive teams).
  - Bomb: `EXCELLENT` (Rapid evaluation under fuse).
  - Closest: `DO_NOT_FORCE` (Selecting the largest/smallest item is a categorical choice).
- **Mechanic Notes:** Expressions or clusters must be designed so that estimation/insight reveals the winner without pen and paper.
- **Target Solve Time:** 7–10 seconds.
- **Shared Screen:** 4 panels labeled A, B, C, D.
- **Phone UI:** 4 text buttons `[أ]`, `[ب]`, `[ج]`, `[د]`.
- **Concrete Arabic Examples:**
  - «أي الصناديق الأربعة التالية يحتوي على أكبر عدد من القطع؟»
  - «أي العمليات الحسابية البسيطة التالية تعطي الناتج الأكبر دون حساب يدوي دقيق؟»
- **Anti-Patterns:** Requiring exact calculation of multi-digit numbers to find a difference of 1.
- **Distinction:** Comparative ranking rather than estimating a single absolute quantity.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector comparison cards.

---

### 9. `geometric-area-estimate` (تقدير المساحات الهندسية النسبية)
- **Player Solve:** تقدير نسبة مساحة جزء هندسي مظلل إلى المساحة الكلية للشكل.
- **Scope Identity:** Visual-spatial area estimation.
- **Interaction Shapes:**
  - Shape A: Square with an irregular shaded triangle inside (e.g. 37% area).
  - Shape B: Circle with an inscribed polygon.
  - Shape C: Grid of 100 squares with scattered filled cells.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 percentage choices).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Continuous 0–100% percentage slider).
- **Mechanic Notes:** Shading must be non-trivial (not a simple half or quarter) to reward visual area intuition.
- **Target Solve Time:** 7–10 seconds.
- **Shared Screen:** Clear geometric polygon with high-contrast shaded region.
- **Phone UI:** Continuous slider (0% to 100%) or 4 percentage choices.
- **Concrete Arabic Examples:**
  - «قدّر النسبة المئوية للمساحة المظللة باللون الرمادي داخل هذا المربع الكبير.» (النسبة: 42%).
  - «ما نسبة مساحة المثلث المظلل إلى مساحة المستطيل الإجمالية تقريباً؟»
- **Anti-Patterns:** Regular simple divisions (half, fourth) or shapes with fractal noise.
- **Distinction:** Focuses on 2D surface area rather than 3D container volume.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D vector geometry.

---

### 10. `structured-subitizing-count` (العد السريع للمجموعات المنظمة)
- **Player Solve:** تحديد العدد الدقيق لعناصر مصفوفة بنمط منتظم عبر التجميع البصري الفوري.
- **Scope Identity:** Rapid subitizing and grouped counting (e.g. 15–30 items arranged in recognizable clusters: pairs, triplets, dice patterns).
- **Interaction Shapes:**
  - Shape A: 4 groups of 5 dots with 3 leftover dots (4×5 + 3 = 23).
  - Shape B: Triangular formation of bowling pins or billiard balls.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Exact fast count, 4 multiple choice options).
  - RYO: `EXCELLENT` (Fast subitizers dominate).
  - Bomb: `EXCELLENT` (Instant visual grouping under pressure).
  - Closest: `LIMITED` (Subitizing is an exact recognition solve; unlike scatter estimation, a count off by 1 is an arithmetic miss rather than an estimation. Closest is usable with narrow discrete ranges, but multiple choice is strongly preferred).
- **Mechanic Notes:** Shared screen shows items in clean, instantly recognizable clusters.
- **Target Solve Time:** 6–8 seconds.
- **Shared Screen:** High-contrast grouped token layout.
- **Phone UI:** 4 multiple choice numbers.
- **Concrete Arabic Examples:**
  - «ما العدد الإجمالي لهذه الدوائر المنظمة في مجموعات ثلاثية؟» ➔ 21 دائرة.
  - «احسب عدد النقاط في هذا التشكيل المنظم بأسرع ما يمكن.»
- **Anti-Patterns:** Disorganized random scatters (that belongs to `visual-quantity-estimate`). Must be structured in groups.
- **Distinction:** Structured geometric grouping (subitizing) vs random scatter estimation.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector token arrays.

---

### 11. `ratio-intuition` (حدس النسب الرياضية)
- **Player Solve:** استنتاج النسبة والتناسب بين مجموعتين أو خلطتين من العناصر الملونة.
- **Scope Identity:** Proportional comparison between two parts (Part-to-Part ratio).
- **Interaction Shapes:**
  - Shape A: Tray of red and blue tokens; what is the simplified ratio of red to blue (e.g. 2:1)?
  - Shape B: Two mixing beakers showing liquid proportions.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 multiple choice ratio options).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Proportion slider from 1:1 to 5:1).
- **Mechanic Notes:** Ratios must simplify to small whole integers (e.g. 1:2, 2:3, 3:1).
- **Target Solve Time:** 8–11 seconds.
- **Shared Screen:** High-contrast dual-color token layout or divided bar.
- **Phone UI:** 4 text buttons with ratios: `[1:2]`, `[2:3]`, `[3:4]`, `[1:3]`.
- **Concrete Arabic Examples:**
  - «ما هي النسبة المبسطة بين عدد الكرات الحمراء والكرات الزرقاء في هذا الصندوق؟» ➔ 2 إلى 1.
  - «إذا كان هذا الشريط مقسوماً بنسبة معينة بين الأصفر والأخضر، فما هي النسبة الأقرب؟»
- **Anti-Patterns:** Complex fractional ratios like 17:39.
- **Distinction:** Relational ratio between two quantities rather than absolute count.
- **Scalability:** `HIGH`.
- **Asset Req:** Dual-color 2D vector assets.

---

### 12. `ordering-values-span` (مدى الفروق وترتيب القيم)
- **Player Solve:** تقدير الفارق العددي بين أعلى وأدنى قيمة في مجموعة أرقام أو قياسات معروضة.
- **Scope Identity:** Range and numerical span estimation (Range = Max - Min).
- **Interaction Shapes:**
  - Shape A: 5 temperature readings or bar heights; player estimates the spread (difference between top and bottom).
  - Shape B: Multiple price or score tags; player identifies the difference between extremes.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 multiple choice range options).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Continuous 1D numeric slider for the span).
- **Mechanic Notes:** Designed for quick scanning: locate the max, locate the min, subtract.
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** Clean comparative bar chart or set of numbered badges.
- **Phone UI:** 1D slider for Closest or 4 range choices for Moving XO.
- **Concrete Arabic Examples:**
  - «قدّر الفارق (المدى) بين أعلى قيمة وأدنى قيمة في هذه القراءات الخمس.» (القيم: 15، 28، 42، 55، 89 ➔ الفارق: 74).
  - «ما الفارق التقريبي بين أطول وأقصر عمود في هذا الرسم البياني؟»
- **Anti-Patterns:** Calculating variance or standard deviation; keep strictly to simple Range (Max - Min).
- **Distinction:** Measures numerical interval/span across a dataset.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector data badges/charts.

---

## 5. Mechanic Compatibility Matrix

| # | Family Slug | Arabic Name | Moving XO | RYO | Bomb | Closest | Primary Media | Typical Phone Interaction |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| 1 | `missing-number-pattern` | الرقم الناقص في المتتالية | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Typographic Track | Multiple Choice (4 numbers) |
| 2 | `visual-quantity-estimate` | تقدير الكميات والمجموعات | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Scatter Vector | 1D Continuous Slider / MC |
| 3 | `proportion-estimate` | تقدير النسبة والامتلاء | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Gauge Vector | 1D Continuous Slider (0–100%) |
| 4 | `balance-scale-weight` | أوزان كفة الميزان | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D/3D Pan Scale | Multiple Choice (4 numbers) |
| 5 | `number-relationship-grid` | علاقات الأرقام في الشبكة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Grid Vector | Multiple Choice (4 numbers) |
| 6 | `time-angle-intuition` | حدس زوايا عقارب الساعة | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Clock Dial | 1D Angular Slider (0°–180°) |
| 7 | `between-two-anchors` | التقدير بين نقطتين مرجعيتين | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 1D Vector Track | 1D Slider (Min to Max) |
| 8 | `relative-magnitude-sort` | المقارنة النسبية بين المقادير | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Vector Cards | Multiple Choice (4 options) |
| 9 | `geometric-area-estimate` | تقدير المساحات الهندسية | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Geometry Vector | 1D Continuous Slider (0–100%) |
| 10 | `structured-subitizing-count` | العد السريع للمجموعات | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | **LIMITED** | 2D Grouped Tokens | Multiple Choice (4 numbers) |
| 11 | `ratio-intuition` | حدس النسب الرياضية | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Dual-Color Tokens | 1D Slider / MC |
| 12 | `ordering-values-span` | مدى الفروق وترتيب القيم | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Data Badges | 1D Slider (Numeric span) |

---

## 6. Closest Dedicated Review (Numbers & Estimation)

In Puzzles World, Closest must remain **reasoning-derived estimation**, never trivia recall (§23.11).  
**Runtime Reality:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders, or Between-Two-Anchors.

### Rigorous Review: Exact Answers vs. Genuine Estimation:
Do NOT rate an exact logical answer as `EXCELLENT` for Closest merely because it is numeric. Proximity scoring is only meaningful when a close guess reflects genuine perceptual or quantitative intuition:
- **Exact Logical Answers (Rated `DO_NOT_FORCE`):**
  - `missing-number-pattern`: If the sequence rule yields 42, a guess of 41 is an incorrect calculation, not an estimation. Proximity has no gameplay meaning.
  - `number-relationship-grid`: The missing cell has one exact mathematical value derived from row/col rules.
  - `balance-scale-weight`: The substituted weight is an exact derived integer.
- **Exact Rapid Recognition (Rated `LIMITED`):**
  - `structured-subitizing-count`: Subitizing tests immediate exact pattern recognition. A miss by 1 is an arithmetic mistake. Multiple choice is strongly preferred; Closest is only usable with narrow discrete step margins.
- **Genuine Estimation-Native Domains (Rated `EXCELLENT`):**
  - `visual-quantity-estimate`: Continuous 1D slider measuring scattered items (e.g. 58 items). Being close (e.g. 55 or 62) earns graduated points.
  - `proportion-estimate`: Continuous 0–100% percentage slider for liquid levels and battery bars.
  - `geometric-area-estimate`: Continuous 0–100% slider for shaded polygon fractions.
  - `time-angle-intuition`: Continuous 0°–180° angular slider.
  - `between-two-anchors`: Continuous 1D interpolation between Anchor A and Anchor B.
  - `ratio-intuition`: Proportions and ratios on a 1D slider.
  - `ordering-values-span`: Continuous numerical span (Max - Min) on a 1D slider.

---

## 7. Overlap Audit & Scope Routing Rules

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`numbers-estimation`**<br>(أرقام وتقديرات) | **Playful numerical intuition, visual estimation, and pattern discovery.** | **RULE:** The puzzle asks for a quantitative estimate, proportion, or missing number in a valid pattern. **No school worksheet calculation, no memorized math trivia.** |
| **`spot-the-error`**<br>(اكتشف الخطأ) | **Infer an objective rule, then locate what breaks it.** | **ROUTING:** If all numbers or scales are present, but one is an explicit ERROR violating an inferred mathematical rule, route to **`spot-the-error`** (`wrong-number-mapping`, `broken-balance-rule`). |
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **ROUTING:** If counting small visible items in a visual scene (e.g. counting hidden birds), route to **`observation-illusions`** (`count-in-clutter`). (If estimating a large unstructured scatter or liquid volume, it belongs to `numbers-estimation`). |
| **`paths-motion`**<br>(مسارات وحركة) | **Simulate dynamic evolution across time or kinematic chain.** | **ROUTING:** If calculating gear speed ratios ($1:3$), route to **`numbers-estimation`**. (If tracing rotational direction, route to `paths-motion`). |

---

## 8. Generation Scalability

| Scalability Tier | Families Included | Justification |
|---|---|---|
| **HIGH** | `missing-number-pattern`, `visual-quantity-estimate`, `proportion-estimate`, `balance-scale-weight`, `number-relationship-grid`, `time-angle-intuition`, `between-two-anchors`, `relative-magnitude-sort`, `geometric-area-estimate`, `structured-subitizing-count`, `ratio-intuition`, `ordering-values-span` | Endless variations of geometric proportions, scatter densities, balance token combinations, and sequence pattern progressions. |
| **MEDIUM** | — | All 12 approved families possess robust combinatorial depth. |
| **SPECIALIZED** | — | Zero families in Numbers & Estimation are restricted to specialized tier. |

---

## 9. Batch-Level Variety Rules

When generating or reviewing an authored batch for `numbers-estimation`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Operation Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct numerical modalities:
   - *Modality A (Continuous Perceptual Estimates):* `visual-quantity-estimate`, `proportion-estimate`, `geometric-area-estimate`, `between-two-anchors`.
   - *Modality B (Pattern & Grid Deduction):* `missing-number-pattern`, `number-relationship-grid`, `ordering-values-span`.
   - *Modality C (Physical Scales, Angles & Ratios):* `balance-scale-weight`, `time-angle-intuition`, `ratio-intuition`, `structured-subitizing-count`.
4. **Zero Layout Duplication:** Never reuse the same container silhouette, clock face, or number grid with merely numbers swapped in the same batch.
5. **Dynamic Shuffling:** Note that answer option presentation order is randomized dynamically at session runtime by the game engine; authors should write clear, distinct distractors without worrying about artificial manual position balancing.

---

## 10. Library Evolution Rules

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 12 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against `spot-the-error` and `observation-illusions`.
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
