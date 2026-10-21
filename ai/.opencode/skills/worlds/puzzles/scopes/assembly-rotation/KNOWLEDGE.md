# Scope Knowledge Profile: assembly-rotation (تركيب وتدوير)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> **Scope ID:** `puzzles.assembly-rotation`  
> **Canonical Slug:** `assembly-rotation`  
> **World ID:** `puzzles` (عالم الألغاز)  
> **Player-Facing Arabic Name:** **تركيب وتدوير**  
> **Primary Cognitive Identity:** **The player must mentally manipulate, fold, slice, assemble, or rotate the object itself.**  
> **Core Question:** «كيف يبدو المجسم بعد تحريكه أو طيه أو تركيبه؟»  
> **Strict Operational Boundary:** Active internal spatial transformation of the shape or solid itself. If the player merely inspects static features already presented without mental manipulation, it belongs to `observation-illusions`. If the player simulates dynamic kinetic transmission over time (gears, pulleys, circuits), it belongs to `paths-motion`.

---

## 1. Identity & Scope Boundaries

### Core Cognitive Identity
`assembly-rotation` (تركيب وتدوير) tests active mental spatial manipulation. The player is not observing a static image to find a detail, nor are they watching physical motion unfold over time. Instead, the player must take an object (2D polygon or 3D solid) and execute a mental transformation: rotating it in plane, folding a flat net into a closed solid, slicing a cross-section, unrolling an unfolded surface, or fitting interlocking puzzle fragments.

### What Is Strictly Inside
- Mental rotation of 2D and 3D shapes to determine matching orientations and reject chiral mirrors.
- Folding 2D nets into 3D cubes, prisms, cylinders, and pyramids.
- Deducing opposite or adjacent faces of 3D solids from flat patterns.
- Orthographic projections (top, front, side views) of 3D block clusters.
- Structural estimation of 3D block configurations where hidden supporting blocks must be inferred.
- Fitting missing puzzle pieces that require mental rotation or flipping to test congruence.
- Mental planar slicing of 3D solids (cross-sections) and paper fold-and-punch symmetry.

### What Is Strictly Excluded
- **No Static Visual Matching Without Rotation:** If a missing piece or match is already presented in identical orientation, it belongs to `observation-illusions` (`visual-match-scan`).
- **No Pure Counting of Fully Visible Objects:** Counting visible 2D items without 3D structural inference belongs to `observation-illusions` (`count-in-clutter`) or `numbers-estimation`.
- **No Kinetic Dynamic Transmission:** Tracing motion through interconnected moving gears, pulleys, or fluid pipes belongs to `paths-motion`.
- **No Perspective Optical Illusions:** Illusions of perspective depth belong to `observation-illusions`.

---

## 2. Strong vs. Weak Territories

### Strong Content Territories
- **High-Contrast 3D Vector Blocks:** Clean isometric and orthographic views with clear shading that communicates depth without ambiguity.
- **Unfolding & Folding Nets:** Classic cube nets and geometric developments with bold symbols on each face.
- **Mental 2D Rotations with Chiral Distractors:** Figures rotated by 90°, 180°, or 270° with mirror-image distractors.

### Weak / Boring Territories
- Overly busy architectural CAD drawings that cannot be parsed from 3 meters on a shared TV screen.
- Ambiguous wireframe drawings that produce Necker-cube perceptual flips.
- Spatial tests requiring fine millimeter-level alignment estimation.

---

## 3. Evidence Opportunities & Assets
- Clean, consistent, unambiguous renders for 3D objects and 2D nets.
- High-contrast face markings (letters, numbers, geometric icons) that remain legible at living-room distance.
- Phone UI strictly provides clean multiple-choice options (`المكعب أ`, `المسقط ب`, `الوجه المقابل 4`).

---

## 4. Canonical Puzzle Family Definitions (13 Approved Families)

### 1. `mental-rotation-2d` (التدوير الذهني للأشكال ثنائية الأبعاد)
- **Player Solve:** تدوير شكل ثنائي الأبعاد ذهنياً بزاوية محددة ومطابقته مع أحد الخيارات وتجنب الشكل المعكوس (المرآتي).
- **Scope Identity:** Fundamental 2D mental rotation. Distinguishes rigid planar rotation (90°, 180°, 270°) from reflection.
- **Interaction Shapes:**
  - Shape A: Target shape rotated 90° clockwise; 4 candidate choices, 1 is rotated, 3 are chiral reflections or distorted.
  - Shape B: Two complex 2D shapes; are they identical under rotation or are they mirror images?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Fast spatial decision in 15s; 4 choices on phone).
  - RYO: `EXCELLENT` (Decisive spatial rotation test).
  - Bomb: `GOOD` (High-speed rotation check).
  - Closest: `DO_NOT_FORCE` (Categorical shape identification).
- **Mechanic Notes:** Shared screen shows target shape labeled «الشكل الأصلي» and 4 rotated candidates `[أ]`, `[ب]`, `[ج]`, `[د]`.
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** Large target polygon on the left; 4 candidate orientations on the right.
- **Phone UI:** 4 text buttons `[الشكل أ]`, `[الشكل ب]`, `[الشكل ج]`, `[الشكل د]`.
- **Concrete Arabic Examples:**
  - «أي من الأشكال الأربعة التالية يطابق الشكل الأصلي تماماً بعد تدويره بزاوية 90 درجة مع اتجاه عقارب الساعة؟»
  - «ثلاثة من الأشكال التالية ناتجة عن تدوير الشكل الأصلي، وشكل واحد ناتج عن انعكاس مرآتي. ما هو الشكل المعكوس؟»
- **Anti-Patterns:** Symmetrical shapes (circles, squares) where rotation produces no discernible change.
- **Distinction:** Differs from `mirror-vs-rotation-discrim` by focusing on finding the single rotated match among distractors.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector geometry.

---

### 2. `cube-net-fold` (طي مخطط المكعب)
- **Player Solve:** طي مخطط مسطح سداسي الأوجه ذهنياً لتحديد المكعب ثلاثي الأبعاد الناتج بدقة.
- **Scope Identity:** 2D-to-3D net transformation. The player inspects a flat 6-square net and predicts which 3D rendered cube correctly represents it.
- **Interaction Shapes:**
  - Shape A: Flat net with 6 patterned faces; player picks the one valid 3D cube among 4 options.
  - Shape B: 3D cube shown; which of 4 flat nets can fold into it?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Iconic spatial reasoning puzzle).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical cube selection).
- **Mechanic Notes:** Faces must use clear, distinct high-contrast symbols (e.g. circle, star, triangle, square, cross, diamond).
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** Flat net layout on the left; 4 rendered 3D cubes labeled A, B, C, D on the right.
- **Phone UI:** 4 buttons: `[المكعب أ]`, `[المكعب ب]`, `[المكعب ج]`, `[المكعب د]`.
- **Concrete Arabic Examples:**
  - «إذا تم طي هذا المخطط السداسي ليشكل مكعباً مغلقاً، فأي المكعبات التالية يمثل النتيجة الصحيحة؟»
  - «أي من مخططات المكعب الأربعة التالية يستحيل طيه ليشكل مكعباً متكاملاً دون تداخل الأوجه؟»
- **Anti-Patterns:** Plain white cubes without face markings, or markings with ambiguous chirality.
- **Distinction:** Complete 3D solid construction from a 2D net.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D vector net + 3D isometric cube renders.

---

### 3. `opposite-cube-faces` (الأوجه المتقابلة في المكعب)
- **Player Solve:** تحديد الوجه الذي سيكون مقابلاً لوجه معين في المكعب عند طي مخططه المسطح.
- **Scope Identity:** Topological adjacency deduction on flat nets without needing to mentally fold the entire solid.
- **Interaction Shapes:**
  - Shape A: Flat net with numbered faces 1 to 6; prompt asks: «ما الرقم المقابل للوجه رقم 3؟».
  - Shape B: Flat net with colors; prompt asks for the face opposite to Yellow.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (8–10s rapid solve; high party energy).
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT` (Fast rule-based topological check).
  - Closest: `DO_NOT_FORCE` (Categorical face identity).
- **Mechanic Notes:** Ideal for fast play. Players deduce that faces separated by exactly one square on a straight strip are opposite.
- **Target Solve Time:** 6–9 seconds.
- **Shared Screen:** Clearly numbered flat net.
- **Phone UI:** 4 face buttons with numbers or colors.
- **Concrete Arabic Examples:**
  - «عند طي هذا المخطط إلى مكعب، ما هو الوجه الذي سيكون مقابلاً تماماً للوجه الذي يحمل الرمز (★)؟»
  - «في مخطط المكعب المرقم من 1 إلى 6، أي رقم سيقع في الوجه المعاكس للرقم 2؟»
- **Anti-Patterns:** Ambiguous net configurations where fold direction (inward vs outward) alters face opposition.
- **Distinction:** Focuses strictly on opposite-face pairing rather than full 3D visual matching.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector nets.

---

### 4. `orthographic-projection` (المساقط الهندسية للمجسم)
- **Player Solve:** تحديد المسقط الرأسي (من الأعلى) أو الجانبي الصحيح لمجسم كتل ثلاثي الأبعاد.
- **Scope Identity:** 3D-to-2D perspective projection. The player inspects a 3D cluster of blocks and deduces what a 2D camera sees from a specific viewpoint.
- **Interaction Shapes:**
  - Shape A: 3D block cluster; player identifies the Top View (المسقط الرأسي من الأعلى).
  - Shape B: 3D block cluster; player identifies the Right Side View (المسقط الجانبي الأيمن).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical projection choice).
- **Mechanic Notes:** Shared screen shows 3D cluster with a prominent viewpoint arrow labeled «المنظر من الأعلى».
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** 3D block cluster with directional camera arrow; 4 flat 2D silhouettes labeled A, B, C, D.
- **Phone UI:** 4 text buttons `[المسقط أ]`, `[المسقط ب]`, `[المسقط ج]`, `[المسقط د]`.
- **Concrete Arabic Examples:**
  - «إذا نظرت إلى هذا المجسم ثلاثي الأبعاد من الأعلى مباشرة، فأي من المساقط المسطحة التالية يمثل ما ستراه؟»
  - «حدد المسقط الجانبي الصحيح لهذا التشكيل من المكعبات عند النظر إليه باتجاه السهم.»
- **Anti-Patterns:** Symmetrical block clusters where top and side views are indistinguishable.
- **Distinction:** Evaluates viewpoint-specific 2D projections rather than 3D rotation.
- **Scalability:** `HIGH`.
- **Asset Req:** 3D block cluster renders + 2D orthographic silhouettes.

---

### 5. `spatial-cube-count` (عد المكعبات المخفية في المجسم)
- **Player Solve:** حساب إجمالي عدد المكعبات المتساوية المكونة لمجسم كتل ثلاثي الأبعاد، متضمناً المكعبات المخفية الحاملة.
- **Scope Identity:** 3D structural inference. The player cannot see all cubes directly; they must apply physics/support logic to infer hidden blocks underneath visible upper layers.
- **Interaction Shapes:**
  - Shape A: Multi-tiered block staircase or tower with cantilevered blocks; player estimates or calculates total cube count.
  - Shape B: Hollow block structure with unseen interior supporting cubes.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 multiple choice options).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Estimating total cubes on a 1D discrete slider).
- **Mechanic Notes:** The structural rule is clear: no cube can float in mid-air; every elevated cube is supported by a column of hidden cubes beneath it.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Clean 3D isometric rendering of the block formation.
- **Phone UI:** 1D discrete slider for Closest, or 4 count buttons for Moving XO.
- **Concrete Arabic Examples:**
  - «كم مكعباً متساوياً يتكون منه هذا المجسم ثلاثي الأبعاد، مع احتساب المكعبات المخفية التي تستند عليها الطبقات العليا؟» (العدد الفعلي: 18 مكعباً).
  - «قدّر إجمالي عدد المكعبات في هذا البناء الهرمي.» (الخيارات: 14 · 18 · 22 · 26).
- **Anti-Patterns:** Fully flat or fully visible arrangements where zero hidden cubes exist (that belongs to pure visual counting). Internal/hidden cubes MUST be structurally inferred.
- **Distinction:** Requires spatial structural inference of hidden volumes, separating it from flat counting in `observation-illusions`.
- **Scalability:** `HIGH`.
- **Asset Req:** 3D isometric block renders with clean drop shadows.

---

### 6. `missing-puzzle-piece` (القطعة المفقودة لإكمال الشكل)
- **Player Solve:** تحديد القطعة الهندسية الوحيدة التي تكمل الفراغ في شكل هندسي بعد تدويرها ذهنياً لتلائم الفجوة.
- **Scope Identity:** Negative space fit with mental manipulation. The player identifies the missing puzzle piece among candidates that are **rotated or flipped**, requiring active spatial re-orientation to test fit.
- **Interaction Shapes:**
  - Shape A: Square grid with a 4-block notched hole; candidates are tetromino pieces in rotated orientations.
  - Shape B: Tangram-style silhouette with one missing polygon presented in rotated form.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical piece selection).
- **Mechanic Notes:** Candidate pieces MUST be presented in rotated orientations. If candidate pieces are shown in identical orientation to the hole, the puzzle reduces to static outline matching and belongs to `observation-illusions/visual-match-scan`.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Main shape with negative space hole; 4 candidate pieces labeled A, B, C, D in various orientations.
- **Phone UI:** 4 text buttons `[القطعة أ]`, `[القطعة ب]`, `[القطعة ج]`, `[القطعة د]`.
- **Concrete Arabic Examples:**
  - «أي من القطع الأربع التالية ستكمل الفراغ المتبقي في هذا المربع الهندسي تماماً بعد تدويرها ذهنياً؟»
  - «حدد القطعة المناسبة التي تكمل الفجوة المركزية في هذا الشكل.»
- **Anti-Patterns:** Presenting the correct candidate in the exact orientation of the hole with no mental rotation required (violates Scope boundary; belongs to `observation-illusions`).
- **Distinction:** Mandatory mental transformation/rotation to test fit, distinct from static shape matching.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D vector puzzle geometry.

---

### 7. `cross-section-slice` (المقطع العرضي للشكل المقطوع)
- **Player Solve:** تخيل المقطع العرضي ثنائي الأبعاد الناتج عن قطع مجسم ثلاثي الأبعاد بمستوى مستوٍ.
- **Scope Identity:** Planar geometry cutting 3D space. The player mentally slices a 3D solid (cylinder, cone, prism, torus) with a cutting plane and determines the 2D cross-section silhouette.
- **Interaction Shapes:**
  - Shape A: Cylinder cut at an angle ➔ Ellipse.
  - Shape B: Cube sliced diagonally through 3 vertices ➔ Equilateral Triangle.
  - Shape C: Cone sliced horizontally ➔ Circle.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical 2D silhouette).
- **Mechanic Notes:** The cutting plane must be clearly illustrated with a colored translucent surface slicing through the solid.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** 3D solid with cutting plane; 4 flat 2D silhouettes labeled A, B, C, D.
- **Phone UI:** 4 text buttons `[مستطيل]`, `[مثلث]`, `[قطع ناقص]`, `[دائرة]`.
- **Concrete Arabic Examples:**
  - «إذا تم قطع هذا المخروط بمستوى مستوٍ مائل لا يمر بالقاعدة، فما هو شكل المقطع العرضي الناتج؟» ➔ قطع ناقص (شكل بيضاوي).
  - «ما الشكل ثنائي الأبعاد الناتج عن قطع مكعب بمستوى يمر بزواياه الثلاث الموضحة؟» ➔ مثلث متساوي الأضلاع.
- **Anti-Patterns:** Complex solids resulting in obscure higher-order algebraic curves. Keep to circles, ellipses, triangles, parabolas, and rectangles.
- **Distinction:** 3D volumetric slicing into a 2D surface.
- **Scalability:** `MEDIUM`.
- **Asset Req:** 3D rendered solids with cutting plane overlays.

---

### 8. `fold-and-punch` (طي الورق وتخريم الثقوب)
- **Player Solve:** تخيل نمط الثقوب ومواقعها عند إعادة فتح ورقة مربعة تم طيها ثم ثقبها.
- **Scope Identity:** Sequential folding and punch symmetry. A square sheet is folded in half, folded again, and punched with 1 or 2 holes. The player deduces the unfolded pattern.
- **Interaction Shapes:**
  - Shape A: 1 fold (vertical) + 1 hole ➔ 2 symmetrical holes.
  - Shape B: 2 folds (quarter square) + 1 hole near corner ➔ 4 symmetrical holes.
  - Shape C: Diagonal fold + 1 triangular punch on the crease.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Classic visual IQ puzzle; fast deduction).
  - RYO: `GOOD`.
  - Bomb: `LIMITED` (Can induce hesitation).
  - Closest: `DO_NOT_FORCE` (Categorical unfolded pattern).
- **Mechanic Notes:** Limit to 2 folds maximum to ensure a comfortable 15-second solve.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** Step 1 (Fold) ➔ Step 2 (Fold) ➔ Step 3 (Punch); 4 candidate unfolded sheets A, B, C, D.
- **Phone UI:** 4 buttons `[الورقة أ]`, `[الورقة ب]`, `[الورقة ج]`, `[الورقة د]`.
- **Concrete Arabic Examples:**
  - «طُويت ورقة مربعة إلى النصف، ثم إلى الربع، وثُقبت ثقباً دائرياً في طرفها. كيف سيبدو شكل الورقة بعد فتحها بالكامل؟»
  - «تتبع خطوات طي الورقة وثقبها، واختر المخطط النهائي الصحيح بعد إعادة فتحها.»
- **Anti-Patterns:** More than 2 folds or asymmetrical odd-angle origami folds that require over 20 seconds to mentally trace.
- **Distinction:** Symmetry generation through reversible folding and punching.
- **Scalability:** `MEDIUM`.
- **Asset Req:** 2D step-by-step vector folding diagrams.

---

### 9. `tangram-silhouette-fit` (تركيب قطع التانغرام في الظل)
- **Player Solve:** تحديد القطعة الهندسية التي لا يمكن استخدامها في تشكيل ظل هندسي معين من بين قطع التانغرام.
- **Scope Identity:** 2D polygonal decomposition and puzzle assembly.
- **Interaction Shapes:**
  - Shape A: A black silhouette is presented alongside 4 colored geometric shapes; 3 shapes fit together to form the silhouette, and 1 shape is surplus/incompatible.
  - Shape B: Identifying how many triangles are needed to cover a composite polygon.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «يمكن تكوين هذا الظل الأسود بدمج ثلاثة أشكال من الأشكال الأربعة المعروضة. ما هو الشكل الزائد الذي لا يدخل في تركيبه؟»
  - «أي من القطع الهندسية التالية تلزم لإكمال هذا الشكل السداسي مع القطع الموجودة؟»
- **Anti-Patterns:** Non-polygonal organic blobs without geometric vertices.
- **Distinction:** 2D polygon tiling and silhouette fitting.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D vector tangram shapes.

---

### 10. `exploded-view-assembly` (المجسم المجمع من الأجزاء المفككة)
- **Player Solve:** تركيب أجزاء هندسية متفرقة ذهنياً لتحديد المجسم المتكامل الناتج.
- **Scope Identity:** 3D volumetric assembly. 3 or 4 detached interlocking parts are shown with alignment axes. The player mentally pushes them together.
- **Interaction Shapes:**
  - Shape A: Two wooden puzzle blocks shown separated along an axis; what solid do they form when joined?
  - Shape B: 3 colored wedges assembling into a cylinder or cube.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «إذا تم تجميع هذه القطع الهندسية الثلاث المفككة معاً على طول المحاور الموضحة، فأي مجسم سينتج عنها؟»
  - «أي من المجسمات الأربعة يمثل النتيجة الصحيحة لتركيب القطعتين (أ) و (ب) معاً؟»
- **Anti-Patterns:** Mechanical machinery components (screws, engine gears); keep strictly to abstract geometric solids.
- **Distinction:** 3D assembly along translation axes.
- **Scalability:** `HIGH`.
- **Asset Req:** 3D exploded view vector renders.

---

### 11. `mirror-vs-rotation-discrim` (التمييز بين التدوير والانعكاس)
- **Player Solve:** تمييز ما إذا كان الشكل المستهدف ناتجاً عن تدوير الشكل الأصلي أم عن انعكاسه المرآتي.
- **Scope Identity:** 2D chirality discrimination. Fast perceptual distinction between planar rotation ($SO(2)$) and reflection ($O(2) \setminus SO(2)$).
- **Interaction Shapes:**
  - Shape A: Hand or asymmetric letter-like shape; is the target Rotated or Mirrored?
  - Shape B: 4 candidate shapes, 3 are pure rotations and 1 is a chiral reflection (odd one out).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Lightning fast 6–8s solve).
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 6–9 seconds.
- **Concrete Arabic Examples:**
  - «هل الشكل المعروض على اليسار ناتج عن (تدوير) الشكل الأصلي أم عن (انعكاس مرآتي) له؟»
  - «أربعة أشكال هندسية غير متناظرة، ثلاثة منها تمثل نفس الشكل في وضعيات تدوير مختلفة، وشكل واحد يمثل صورة مرآتية له. حدد الشكل المرآتي.»
- **Anti-Patterns:** Symmetrical shapes that possess bilateral symmetry (which renders rotation and reflection indistinguishable).
- **Distinction:** Specifically tests the cognitive boundary between rotation and chirality.
- **Scalability:** `HIGH`.
- **Asset Req:** Asymmetric 2D vector shapes.

---

### 12. `unfolded-surface-net` (مخطط المجسمات غير المكعبة)
- **Player Solve:** مطابقة أسطح مجسمات هرمية أو أسطوانية أو موشورية بمخططاتها المسطحة المنبسطة.
- **Scope Identity:** Non-cubic net developments (cones, triangular prisms, square pyramids, truncated pyramids).
- **Interaction Shapes:**
  - Shape A: Triangular prism net (2 triangles + 3 rectangles).
  - Shape B: Square pyramid net (1 square + 4 triangles).
  - Shape C: Cylinder net (2 circles + 1 rectangle).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «أي من المجسمات التالية يطابق هذا المخطط المسطح المكون من مثلثين وثلاثة مستطيلات؟» ➔ موشور ثلاثي.
  - «حدد المخطط المسطح الصحيح الذي يمكن طيه ليشكل هرماً رباعي القاعدة.»
- **Anti-Patterns:** Standard cube nets (which belong exclusively to `cube-net-fold`).
- **Distinction:** Generalization of net folding to non-cubic 3D solids.
- **Scalability:** `MEDIUM`.
- **Asset Req:** 2D nets and corresponding 3D non-cubic solids.

---

### 13. `spatial-reconstruction` (إعادة بناء النمط المنقسم)
- **Player Solve:** جمع قطعتين هندسيتين مقطوعتين بزاوية مائلة لتحديد النمط المتشكل عند تلاصقهما.
- **Scope Identity:** Planar translation and boundary stitching. A pattern or symbol was cut in two by an irregular line and separated. The player brings them together.
- **Interaction Shapes:**
  - Shape A: A circle with internal stripes cut along an S-curve and shifted apart.
  - Shape B: Two interlocking puzzle halves; what symbol do they reveal when merged?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «تم شطر هذا الشعار الدائري إلى نصفين بواسطة خط متعرج وإبعادهما. أي رمز مكتمل سيتشكل عند إعادة إلصاق النصفين معاً؟»
  - «أي من الخيارات الأربعة يمثل الشكل الناتج عن تلاصق هاتين القطعتين على طول حافتهما المشتركة؟»
- **Anti-Patterns:** Random jagged static noise without identifiable geometric features.
- **Distinction:** Reversible 2D cutting and translation stitching.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D vector stitching graphics.

---

## 5. Mechanic Compatibility Matrix

| # | Family Slug | Arabic Name | Moving XO | RYO | Bomb | Closest | Primary Media | Typical Phone Interaction |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| 1 | `mental-rotation-2d` | التدوير الذهني للأشكال ثنائية الأبعاد | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Geometry Vector | Multiple Choice (4 shapes) |
| 2 | `cube-net-fold` | طي مخطط المكعب | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Net + 3D Render | Multiple Choice (4 cubes) |
| 3 | `opposite-cube-faces` | الأوجه المتقابلة في المكعب | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Vector Net | Multiple Choice (4 faces) |
| 4 | `orthographic-projection` | المساقط الهندسية للمجسم | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 3D Render + 2D Silhouettes | Multiple Choice (4 views) |
| 5 | `spatial-cube-count` | عد المكعبات المخفية في المجسم | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 3D Isometric Render | 1D Discrete Slider / MC |
| 6 | `missing-puzzle-piece` | القطعة المفقودة لإكمال الشكل | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Geometry Vector | Multiple Choice (4 pieces) |
| 7 | `cross-section-slice` | المقطع العرضي للشكل المقطوع | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 3D Solid + Slicing Plane | Multiple Choice (4 silhouettes) |
| 8 | `fold-and-punch` | طي الورق وتخريم الثقوب | **EXCELLENT** | **GOOD** | **LIMITED** | DO_NOT_FORCE | 2D Step Flow Vector | Multiple Choice (4 sheets) |
| 9 | `tangram-silhouette-fit` | تركيب قطع التانغرام في الظل | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Tangram Vector | Multiple Choice (4 options) |
| 10 | `exploded-view-assembly` | المجسم المجمع من المفككات | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 3D Exploded Render | Multiple Choice (4 solids) |
| 11 | `mirror-vs-rotation-discrim` | التمييز بين التدوير والانعكاس | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Vector Geometry | Multiple Choice (Binary/MC) |
| 12 | `unfolded-surface-net` | مخطط المجسمات غير المكعبة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Net + 3D Solids | Multiple Choice (4 solids) |
| 13 | `spatial-reconstruction` | إعادة بناء النمط المنقسم | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Vector Pieces | Multiple Choice (4 patterns) |

---

## 6. Closest Dedicated Review (Assembly & Rotation)

In Puzzles World, Closest must remain **reasoning-derived estimation**, never trivia recall (§23.11).  
**Runtime Reality:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders, or Between-Two-Anchors.

Because spatial transformation problems almost universally yield discrete categorical outcomes (which cube folds, which rotated piece fits, which face is opposite), forcing sliders onto categorical shapes is strictly rejected. Only one family natively supports Closest:

### Natural Closest Interaction in Assembly & Rotation:
1. **Hidden Volume Cube Count:**
   - Supported Family: `spatial-cube-count` (`EXCELLENT`).
   - Interaction: A complex 3D block cluster is presented on the shared screen with multiple supporting tiers. Players structurally infer hidden blocks and estimate the total count on a 1D discrete slider (e.g. range 10 to 35 cubes, step 1). Being close to the actual count earns partial distance points.

### Explicitly Rejected Fake Closest Adaptations in Assembly:
- ❌ Continuous sliders for 4 discrete candidate shapes (e.g. «أي شكل يطابق بعد التدوير؟ اختر 1 إلى 4»).
- ❌ Estimating the angle of rotation on a continuous slider for multiple choice items.
- ❌ Spatial coordinate pickers or touch screen tapping (not supported by runtime).

---

## 7. Overlap Audit & Scope Routing Rules

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`assembly-rotation`**<br>(تركيب وتدوير) | **The player must mentally manipulate, fold, slice, assemble, or rotate the object itself.** | **RULE:** The solve requires mental manipulation of an object. **No static noticing without transformation, no kinetic tracing over time.** |
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **ROUTING:** If candidate pieces or reflections are already presented in identical orientation and the player merely scans for matching outlines, route to **`observation-illusions`** (`visual-match-scan`, `reflection-fidelity`). |
| **`paths-motion`**<br>(مسارات وحركة) | **Simulate dynamic evolution across time or kinematic chain.** | **ROUTING:** If a system involves continuous kinetic transmission through moving gears, belts, pulleys, or fluid flows, route to **`paths-motion`**. (If rotating a standalone 3D block or polygon, route to `assembly-rotation`). |
| **`spot-the-error`**<br>(اكتشف الخطأ) | **Infer an objective rule, then locate what breaks it.** | **ROUTING:** If an image presents an impossible perspective structure or architectural junction that contradicts 3D geometry rules, route to **`spot-the-error`** or **`observation-illusions`** (`impossible-object-perception`). |

---

## 8. Generation Scalability

| Scalability Tier | Families Included | Justification |
|---|---|---|
| **HIGH** | `mental-rotation-2d`, `cube-net-fold`, `opposite-cube-faces`, `orthographic-projection`, `spatial-cube-count`, `missing-puzzle-piece`, `tangram-silhouette-fit`, `exploded-view-assembly`, `mirror-vs-rotation-discrim`, `spatial-reconstruction` | Rich combinatorial variations of 2D/3D polygons, block formations, and net face patterns generated via vector assets. |
| **MEDIUM** | `cross-section-slice`, `fold-and-punch`, `unfolded-surface-net` | Slicing geometries, paper fold sequences, and non-cubic net developments require specialized manual 3D modeling and verification. |
| **SPECIALIZED** | — | All 13 approved families provide sustainable depth across gameplay sessions. |

---

## 9. Batch-Level Variety Rules

When generating or reviewing an authored batch for `assembly-rotation`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Operation Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct spatial modalities:
   - *Modality A (2D Manipulations & Chirality):* `mental-rotation-2d`, `missing-puzzle-piece`, `tangram-silhouette-fit`, `mirror-vs-rotation-discrim`, `spatial-reconstruction`.
   - *Modality B (3D Nets, Folding & Slicing):* `cube-net-fold`, `opposite-cube-faces`, `cross-section-slice`, `fold-and-punch`, `unfolded-surface-net`.
   - *Modality C (Volumetric Projections & Assembly):* `orthographic-projection`, `spatial-cube-count`, `exploded-view-assembly`.
4. **Zero Shape Duplication:** Never reuse the exact same 3D block formation or 2D silhouette with merely colors swapped in the same batch.
5. **Dynamic Shuffling:** Note that answer option presentation order is randomized dynamically at session runtime by the game engine; authors should write clear, distinct distractors without worrying about artificial manual position balancing.

---

## 10. Library Evolution Rules

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 13 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against `observation-illusions` and `paths-motion`.
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
