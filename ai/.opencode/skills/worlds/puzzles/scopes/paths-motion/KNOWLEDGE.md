# Scope Knowledge Profile: paths-motion (مسارات وحركة)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> **Scope ID:** `puzzles.paths-motion`  
> **Canonical Slug:** `paths-motion`  
> **World ID:** `puzzles` (عالم الألغاز)  
> **Player-Facing Arabic Name:** **مسارات وحركة**  
> **Primary Cognitive Identity:** **The player must simulate dynamic physical evolution across time or causal kinetic chains.**  
> **Core Question:** «إلى أين تتجه الحركة وما هي النتيجة الحتمية للمسار؟»  
> **Strict Operational Boundary:** Tracing causal, dynamic, or kinetic transmission over time. The system must be visually deterministic and solvable from the visible diagram itself. Specialist physics formulas, electrical engineering conventions, and textbook momentum equations are strictly excluded.

---

## 1. Identity & Scope Boundaries

### Core Cognitive Identity
`paths-motion` (مسارات وحركة) captures dynamic causal reasoning in Puzzles World. Unlike static visual perception or internal geometric rotation, this Scope asks the player to simulate a process unfolding over time: tracing the transmission of rotary motion through interlocking gears, following gravity-driven fluids through valves and pipes, finding closed circuits that power a bulb, or navigating branch networks and mazes to determine the final terminal.

### Visually Deterministic Invariant
All puzzles in this Scope must be self-contained in the visible diagram. The player must never need outside physics textbook recall (e.g., $F = ma$, electrical Kirchhoff laws, or momentum formulas). Motion rules are intuitive, visual, and strictly deterministic:
- Interlocking gears rotate in opposite directions.
- Belts without a twist preserve direction; crossed belts reverse it.
- Liquid flows downward and levels across communicating vessels.
- Closed switches complete a continuous circuit path from source to load.
- Dominoes fall forward unless the physical gap exceeds tile height.

### What Is Strictly Inside
- Tracing mechanical motion transmission (gears, pulleys, cams, levers).
- Fluid flow through hydraulic pipe networks and valve barriers.
- Electrical circuit continuity tracing through switches to terminal loads.
- Labyrinth and network pathfinding (mazes, one-way street grids, conveyor sorting belts).
- Kinetic gravity drops (marble runs, falling domino cascades).
- Finding shortest paths and tracking intertwined wire paths.

### What Is Strictly Excluded
- **No Physics Textbook Memorization:** Requiring recall of electrical impedance, mechanical advantage formulas, or abstract momentum equations violates `PUZZLES_WORLD_NO_TRIVIA`.
- **No Mental Shape Transformations:** Folding nets or rotating 3D blocks belongs to `assembly-rotation`.
- **No Static Visual Differences Without Motion:** Finding a disconnected line in a static drawing without dynamic causality belongs to `observation-illusions` or `spot-the-error`.
- **No Mandatory Animation:** Static vector graphics with clear directional indicators are the safe, approved default.

---

## 2. Strong vs. Weak Territories

### Strong Content Territories
- **High-Contrast Schematic Diagrams:** Clean vector illustrations of gear trains, pipe manifolds, and switches.
- **Immediate Causal Payoff:** Clear binary or quaternary outcomes (e.g. "Which bulb lights up: A, B, C, or D?").
- **Kinetic Puzzles with Clear Directional Markers:** Obvious rotation arrows, flow directions, and gravity vectors.

### Weak / Boring Territories
- Enormous, microscopic circuit boards that cause eye strain.
- Ambiguous mechanical linkages where motion could jam or bind realistically without clear constraints.
- Physics questions that turn into math word problems.

---

## 3. Evidence Opportunities & Assets
- Clean vector schematics (SVG) with clear line weights, color-coded paths, and unambiguous connection nodes.
- High contrast between active and inactive paths.
- Phone UI strictly provides clean multiple-choice options (`المصباح أ`, `الخزان ج`, `مع عقارب الساعة`).

---

## 4. Canonical Puzzle Family Definitions (12 Approved Families)

### 1. `gear-train-direction` (اتجاه دوران التروس المتشابكة)
- **Player Solve:** تتبع تسلسل نقل الحركة عبر سلسلة مسننات متشابكة لتحديد اتجاه دوران الترس الأخير.
- **Scope Identity:** Fundamental rotary kinetic transmission. Two interlocking gears turn in opposite directions; external belts preserve or reverse direction.
- **Interaction Shapes:**
  - Shape A: Linear gear train of 5-7 meshed gears; if Gear 1 turns clockwise, which way does Gear 7 turn?
  - Shape B: Gear train with an open belt and a crossed belt.
  - Shape C: Branched gear network where one input drives two output dials.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Fast 6–10s solve; parity check).
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Binary rotational outcome: مع أو عكس عقارب الساعة).
- **Mechanic Notes:** Shared screen shows gear chain with labeled Start gear and Goal gear. Phone displays 2 or 4 choices.
- **Target Solve Time:** 6–10 seconds.
- **Shared Screen:** High-contrast 2D vector gear train with a bold green arrow on the first gear.
- **Phone UI:** Buttons: `[مع عقارب الساعة]`, `[عكس عقارب الساعة]`.
- **Concrete Arabic Examples:**
  - «إذا دار الترس الأول (أ) باتجاه عقارب الساعة، ففي أي اتجاه سيدور الترس الأخير (د)؟»
  - «سلسلة مسننات موصولة بسيور، أحدها متقاطع. ما اتجاه دوران العجلة الصفراء؟»
- **Anti-Patterns:** Odd gear tooth counts calculating exact RPM ratios (belongs to `numbers-estimation`). Keep strictly to directional parity.
- **Distinction:** Kinetic rotary propagation vs static object rotation.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D vector gears with clear meshing teeth.

---

### 2. `pulley-rope-system` (حركة البكرات والأحمال)
- **Player Solve:** تتبع مسار حبل ملفوف على بكرات ثابتة ومتحركة لمعرفة اتجاه حركة ثقل معلق.
- **Scope Identity:** Visually deterministic cable and pulley tension tracing.
- **Interaction Shapes:**
  - Shape A: Rope pulled downward at point A; does suspended Load B move Up or Down?
  - Shape B: Two interconnected loads over 3 pulleys; which load hits the ground first?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Directional up/down outcome).
- **Mechanic Notes:** Pulleys must be anchored clearly (fixed to ceiling vs floating on rope loop).
- **Target Solve Time:** 7–10 seconds.
- **Concrete Arabic Examples:**
  - «عند سحب طرف الحبل للأسفل بقوة، هل سيرتفع الثقل المعلق للأعلى أم سينزل للأسفل؟»
  - «نظام بكرات مزدوج؛ إذا تحركت البكرة (س) لليمين، في أي اتجاه سيتحرك المؤشر (ص)؟»
- **Anti-Patterns:** Mechanical advantage mathematical calculations (e.g. calculate tension force in Newtons).
- **Distinction:** Cable tension mechanics vs free-falling objects.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector pulleys and colored ropes.

---

### 3. `pipe-valve-flow` (تدفق السوائل والصمامات المتصلة)
- **Player Solve:** تتبع شبكة أنابيب وسوائل ذات صمامات مفتوحة ومغلقة لمعرفة أي خزان سيمتلئ أولاً.
- **Scope Identity:** Hydraulic gravity flow and valve barrier tracing across communicating vessels.
- **Interaction Shapes:**
  - Shape A: Fluid poured into top container; pipes connect to tanks 1, 2, 3, 4 with some closed valves or blocked passages. Which tank fills first?
  - Shape B: Communicating vessels at equilibrium with liquid levels.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Classic viral brain-teaser; high team engagement).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `GOOD` (Estimating final liquid equilibrium percentage on a 1D continuous slider).
- **Mechanic Notes:** Shared screen shows liquid pouring from the top with clear valve orientations.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Cutaway hydraulic diagram with colored liquid tanks labeled A, B, C, D.
- **Phone UI:** 4 text buttons `[الخزان أ]`, `[الخزان ب]`, `[الخزان ج]`, `[الخزان د]`.
- **Concrete Arabic Examples:**
  - «يُسكب الماء باستمرار في الحوض العلوي. أي من الخزانات الأربعة سيمتلئ بالماء أولاً؟»
  - «تتبع مسار الأنابيب والصمامات المفتوحة، أي صنبور سيتدفق منه السائل؟»
- **Anti-Patterns:** Physics hydrodynamic calculations (Bernoulli equation, flow rate formulas). Keep strictly to open/closed paths and overflow elevations.
- **Distinction:** Continuous fluid flow vs discrete token paths.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D vector pipe schematics.

---

### 4. `electrical-switch-circuit` (مسارات الدوائر الكهربائية والقواطع)
- **Player Solve:** تتبع مسار التيار الكهربائي في شبكة أسلاك وقواطع لمعرفة أي مصباح سيضيء.
- **Scope Identity:** Visually self-contained circuit loop tracing. A complete unbroken path from battery terminal (+) through closed switches to a bulb and back to (-) illuminates that bulb.
- **Interaction Shapes:**
  - Shape A: Battery connected to 3 lamps via a network of 4 labeled switches (some open, some closed). Which lamp is ON?
  - Shape B: Which single switch must be flipped to turn on Lamp B?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Discrete bulb identity).
- **Mechanic Notes:** Schematic symbols must be universally obvious (knife switch clearly open or bridged, battery clearly marked).
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «في هذه الدائرة الكهربائية، ما هو المصباح الوحيد الذي سيضيء في الوضعية الحالية للقواطع؟»
  - «أي قاطع يجب إغلاقه لإضاءة المصباح الأخضر دون غيره؟»
- **Anti-Patterns:** Ohm's law calculations, resistor color codes, or complex electronics. Strictly binary loop continuity.
- **Distinction:** Electrical path continuity vs mechanical contact.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector electrical schematics with bright bulb indicators.

---

### 5. `maze-exit-route` (مسار الخروج من المتاهة)
- **Player Solve:** تتبع مسار مفتوح عبر متاهة مسارات متفرعة لتحديد المخرج الوحيد المتاح.
- **Scope Identity:** Labyrinth pathfinding under time pressure. Multiple branches lead to dead ends; exactly one continuous unblocked corridor leads from entrance to exit.
- **Interaction Shapes:**
  - Shape A: 1 Entrance, 4 labeled Exits (A, B, C, D); which exit is reachable?
  - Shape B: 4 Mice, 1 Cheese; which mouse has a clear path?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (High urgency visual navigation).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical exit label).
- **Mechanic Notes:** Corridors must have sufficient width and contrast to be followed at 3 meters distance without squinting.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** High-contrast 2D maze with clear boundary walls.
- **Phone UI:** 4 text buttons `[المخرج أ]`, `[المخرج ب]`, `[المخرج ج]`, `[المخرج د]`.
- **Concrete Arabic Examples:**
  - «تتبع مسار المتاهة انطلاقاً من نقطة البداية (س). إلى أي مخرج ستصل دون الاصطدام بحائط مغلق؟»
  - «أي من الشخصيات الأربع تملك مساراً سالكاً بالكامل للوصول إلى مركز الدائرة؟»
- **Anti-Patterns:** Micro-mazes with tiny 2-pixel passages that cannot be resolved on a living room screen.
- **Distinction:** Geometric boundary navigation vs open grid navigation.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean vector mazes with bold colored walls.

---

### 6. `domino-cascade-chain` (تساقط الدومينو وسلاسل الأثر)
- **Player Solve:** تتبع سقوط قطع الدومينو المتباعدة لمعرفة أي مسار فرعي سيسقط بالكامل وأيها سيتوقف.
- **Scope Identity:** Discrete kinetic cascade propagation. A tipped starting tile sets off branches. A gap wider than tile height halts propagation.
- **Interaction Shapes:**
  - Shape A: Tree branching into 3 terminal bells (A, B, C); branch A and C have gaps, branch B is contiguous. Which bell rings?
  - Shape B: Identifying the single bridge tile needed to complete a falling cascade.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Categorical terminal outcome).
- **Mechanic Notes:** Gaps must be unambiguous (clearly wider than tile length).
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «إذا تم إسقاط قطعة الدومينو الأولى، فأي من الأجراس الثلاثة سيرن في نهاية السلسلة؟»
  - «في أي مسار فرعي ستتوقف سلسلة تساقط الدومينو بسبب وجود مسافة فاصلة واسعة؟»
- **Anti-Patterns:** Microscopic gaps that look like drawing artifacts.
- **Distinction:** Progressive kinetic falling cascade vs static domino tile matching.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D/isometric vector domino paths.

---

### 7. `ball-marble-track` (مسار دحرجة الكرة والمنحدرات)
- **Player Solve:** محاكاة مسار كرة تتدحرج عبر قنوات ومحولات اتجاه لمعرفة الصندوق الذي ستستقر فيه.
- **Scope Identity:** Gravity-driven kinetic ball track routing with mechanical deflectors and toggle switches.
- **Interaction Shapes:**
  - Shape A: Marble dropped at top rolls down ramps, passing through 2 toggle gates; which basket does it reach?
  - Shape B: Two balls dropped simultaneously; which one reaches the finish line first based on slope distance?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE` (Categorical bin label).
- **Mechanic Notes:** Static freeze-frame illustration with directional arrows indicating deflector states.
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** Rube-Goldberg style marble track with lettered catch bins A, B, C, D.
- **Phone UI:** 4 text buttons `[الصندوق أ]`, `[الصندوق ب]`, `[الصندوق ج]`, `[الصندوق د]`.
- **Concrete Arabic Examples:**
  - «أُفلتت الكرة من القمع العلوي لتتدحرج عبر المنحدرات والمحولات. في أي سلة ستستقر في النهاية؟»
  - «تتبع مسار الكرة المعدنية عبر القنوات المائلة، ما المسار النهائي الذي ستسلكه؟»
- **Anti-Patterns:** Non-deterministic pinball bounces; outcomes must be 100% mechanically certain.
- **Distinction:** Gravity kinetic tracking through mechanical routing.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector marble run schematics.

---

### 8. `conveyor-sorter-route` (سيور النقل ومسارات الفرز)
- **Player Solve:** تتبع طرد يتحرك على شبكة سيور نقل كهربائية موجهة لمعرفة محطته النهائية.
- **Scope Identity:** Directional network graph tracing. Conveyor belts run in fixed directions marked by arrows; junction pushers divert items based on simple visual rules.
- **Interaction Shapes:**
  - Shape A: Package enters sorting grid; directional conveyor arrows guide it to Bin 1, 2, 3, or 4.
  - Shape B: Luggage carousel network with mechanical diverters.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical bin label).
- **Mechanic Notes:** Directional conveyor arrows must be large and bold.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «يتحرك الصندوق على سيور النقل الموجهة بالأسهم. إلى أي شاحنة سيصل في نهاية خط التوزيع؟»
  - «تتبع خط فرز الأمتعة عبر السيور المتحركة، في أي منصة سيستقر الطرد الأحمر؟»
- **Anti-Patterns:** Dynamic shifting belts that change state midway through the turn without clear logic.
- **Distinction:** Guided mechanical transport vs free-fall gravity motion.
- **Scalability:** `HIGH`.
- **Asset Req:** 2D isometric or top-down vector conveyor networks.

---

### 9. `one-way-traffic-flow` (مسارات الاتجاه الواحد وشبكات الطرق)
- **Player Solve:** تتبع شبكة شوارع ذات اتجاه إجباري واحد لتحديد الوجهة التي يمكن الوصول إليها نظامياً.
- **Scope Identity:** Directed acyclic and cyclic network navigation. Street grid with one-way arrows.
- **Interaction Shapes:**
  - Shape A: Car at intersection Start; which destination (A, B, C, D) is legally reachable without violating one-way signs?
  - Shape B: Finding if a return loop exists from destination to start.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Destination is categorical; turn counting belongs to limited variant).
- **Mechanic Notes:** Street directions must be marked with clear, high-contrast white arrows on dark asphalt.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** City map grid with prominent one-way arrows.
- **Phone UI:** 4 text buttons `[المبنى أ]`, `[المبنى ب]`, `[المبنى ج]`, `[المبنى د]`.
- **Concrete Arabic Examples:**
  - «انطلقت السيارة من النقطة (س) ملتزمة بأسهم السير الإلزامية. أي من المواقف الأربعة تستطيع الوصول إليه نظامياً؟»
  - «في شبكة الطرق ذات الاتجاه الواحد، أي وجهة يستحيل الوصول إليها من نقطة البداية؟»
- **Anti-Patterns:** Traffic rules based on regional driving laws (e.g. right-turn-on-red). Pure arrow-directed graph.
- **Distinction:** Directed graph pathfinding on a planar map.
- **Scalability:** `HIGH`.
- **Asset Req:** Top-down 2D vector city street grid.

---

### 10. `cam-linkage-motion` (حركة الكامات والأذرع الميكانيكية)
- **Player Solve:** تخيل تحويل الحركة الدائرية لكامة أو ذراع إلى حركة ترددية رأسية لقضيب دفع.
- **Scope Identity:** Intuitive visual kinematic conversion (rotary to linear oscillation). A pear-shaped cam or eccentric wheel pushes a follower rod.
- **Interaction Shapes:**
  - Shape A: Cam rotates to position X; does the follower rod move Up, Down, or Stay?
  - Shape B: Two cams on one shaft; which follower rod lifts first?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Clear visual mechanics).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Directional or sequence outcome).
- **Mechanic Notes:** Solvable strictly by visual geometry: lobe of cam pushes rod away from center.
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «عند دوران هذه الكامة البيضاوية ربع دورة في اتجاه السهم، هل سيتحرك القضيب للأعلى أم للأسفل؟»
  - «أي من الأذرع الثلاثة سيرتفع إلى أقصى نقطة له أولاً عند بدء دوران المحور؟»
- **Anti-Patterns:** Kinematic velocity/acceleration calculus. Pure geometric push contact.
- **Distinction:** Rotary-to-linear conversion vs pure rotary gear trains.
- **Scalability:** `MEDIUM`.
- **Asset Req:** 2D mechanical linkage vector diagrams.

---

### 11. `shortest-path-grid` (أقصر مسار حركي في الشبكة)
- **Player Solve:** حساب أو تقدير أقل عدد من الخطوات المطلوبة للوصول من البداية للنهاية مع تجنب العوائق.
- **Scope Identity:** Manhattan grid pathfinding and distance optimization. A grid contains Start, Finish, and barrier blocks.
- **Interaction Shapes:**
  - Shape A: 6x6 grid with obstacles; what is the minimum number of steps to reach Finish?
  - Shape B: 4 candidate paths drawn on screen; which path is strictly the shortest in distance?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (4 multiple choice step counts).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `EXCELLENT` (Estimating minimum steps on a 1D discrete slider — a true physical distance metric).
- **Mechanic Notes:** Only horizontal and vertical moves allowed (no diagonals unless explicitly stated).
- **Target Solve Time:** 8–12 seconds.
- **Shared Screen:** High-contrast grid with Start (Green), Finish (Red), and Obstacle blocks (Black).
- **Phone UI:** 1D discrete slider (steps 5 to 25) for Closest, or 4 count buttons for Moving XO.
- **Concrete Arabic Examples:**
  - «ما هو أقل عدد من الخطوات المباشرة للوصول من نقطة البداية إلى الهدف مع تفادي المربعات المغلقة؟» ➔ 11 خطوة.
  - «أي المسارات الملونة الأربعة يمثل الطريق الأقصر فعلياً للوصول إلى المخرج؟»
- **Anti-Patterns:** Giant 20x20 grids that require Dijkstra calculation. Keep grids to 5x5 or 6x6.
- **Distinction:** Quantitative spatial path optimization on a discrete grid.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast 2D grid vector.

---

### 12. `wire-trace-terminal` (تتبع الأسلاك المتشابكة)
- **Player Solve:** تتبع سلك واحد ملتف ومتشابك من بين عدة أسلاك ملونة للوصول للمقبس الصحيح.
- **Scope Identity:** Continuous line visual tracking through intertwining clutter. 4 wires tangle across the screen connecting 4 appliances to 4 wall sockets.
- **Interaction Shapes:**
  - Shape A: 4 colored cords (Red, Blue, Green, Yellow) intertwine; which cord connects Appliance A to Socket 3?
  - Shape B: Fishing lines tangled underwater; which hook belongs to Fisherman 1?
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Classic party game favorite; fast scanning).
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE` (Categorical socket identification).
- **Mechanic Notes:** Lines must have distinct colors or textures (e.g. solid, dashed, dotted) and smooth curves with clear over/under crossovers.
- **Target Solve Time:** 7–11 seconds.
- **Shared Screen:** 4 appliances on left, 4 sockets on right, crossed cables in between.
- **Phone UI:** 4 text buttons `[المقبس 1]`, `[المقبس 2]`, `[المقبس 3]`, `[المقبس 4]`.
- **Concrete Arabic Examples:**
  - «تتبع السلك المتصل بالمصباح (أ) عبر الأسلاك المتشابكة. في أي مقبس كهربائي ينتهي؟»
  - «أي خيط صيد من الخيوط الأربعة ينتهي بالسمكة الذهبية؟»
- **Anti-Patterns:** Spaghetti lines with zero contrast where lines merge into solid blobs.
- **Distinction:** Continuous visual line tracing through crossovers to a functional terminal.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean 2D vector cords with clear crossover layering.

---

## 5. Mechanic Compatibility Matrix

| # | Family Slug | Arabic Name | Moving XO | RYO | Bomb | Closest | Primary Media | Typical Phone Interaction |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| 1 | `gear-train-direction` | اتجاه دوران التروس المتشابكة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Vector Gears | Multiple Choice (Binary/MC) |
| 2 | `pulley-rope-system` | حركة البكرات والأحمال | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Vector Pulleys | Multiple Choice (Direction) |
| 3 | `pipe-valve-flow` | تدفق السوائل والصمامات | **EXCELLENT** | **EXCELLENT** | **GOOD** | **GOOD** | 2D Hydraulic Schematic | MC / Closest (Fill level) |
| 4 | `electrical-switch-circuit` | مسارات الدوائر الكهربائية | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Circuit Schematic | Multiple Choice (4 bulbs) |
| 5 | `maze-exit-route` | مسار الخروج من المتاهة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Vector Maze | Multiple Choice (4 exits) |
| 6 | `domino-cascade-chain` | تساقط الدومينو وسلاسل الأثر | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Kinetic Cascade | Multiple Choice (4 targets) |
| 7 | `ball-marble-track` | مسار دحرجة الكرة والمنحدرات | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | 2D Track Vector | Multiple Choice (4 bins) |
| 8 | `conveyor-sorter-route` | سيور النقل ومسارات الفرز | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Conveyor Vector | Multiple Choice (4 stations) |
| 9 | `one-way-traffic-flow` | مسارات الاتجاه الواحد | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Street Grid | Multiple Choice (4 destinations) |
| 10 | `cam-linkage-motion` | حركة الكامات والأذرع | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Linkage Vector | Multiple Choice (Direction) |
| 11 | `shortest-path-grid` | أقصر مسار حركي في الشبكة | **EXCELLENT** | **EXCELLENT** | **GOOD** | **EXCELLENT** | 2D Grid Vector | 1D Discrete Slider / MC |
| 12 | `wire-trace-terminal` | تتبع الأسلاك المتشابكة | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | 2D Cable Vector | Multiple Choice (4 sockets) |

---

## 6. Closest Dedicated Review (Paths & Motion)

In Puzzles World, Closest must remain **reasoning-derived estimation**, never trivia recall (§23.11).  
**Runtime Reality:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders, or Between-Two-Anchors.

Because kinetic systems primarily produce categorical terminal outcomes (which bulb, which direction, which bin), Closest is used strictly where continuous or discrete metrics emerge naturally from motion pathfinding:

### Natural Closest Interaction Types in Paths & Motion:
1. **Minimum Step Count Optimization:**
   - Supported Family: `shortest-path-grid` (`EXCELLENT`).
   - Interaction: A pathfinding grid with obstacles is presented. Players estimate the minimum number of steps required to reach the destination on a 1D discrete slider (e.g. 5 to 25 steps, step 1). Proximity to the optimal path length earns graduated distance points.
2. **Equilibrium Fluid Level / Fill Time:**
   - Supported Family: `pipe-valve-flow` (`GOOD`).
   - Interaction: Estimating relative fill level percentage or fill time on a 1D continuous slider.

### Explicitly Rejected Fake Closest Adaptations in Paths & Motion:
- ❌ Using categorical sequence positions or option IDs as fake sliders.
- ❌ 2D minimaps or waypoint touch tapping (not supported by runtime).
- ❌ Continuous sliders for binary gear rotational directions.

---

## 7. Overlap Audit & Scope Routing Rules

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`paths-motion`**<br>(مسارات وحركة) | **Simulate dynamic physical evolution across time or causal kinetic chains.** | **RULE:** The outcome requires tracing physical causality, motion transmission, or system evolution over time. **Visually self-contained, no physics formula recall.** |
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **ROUTING:** If lines form static closed geometric loops and the solve is counting loops, route to **`observation-illusions`** (`overlapping-boundary-trace`). (If the line traces a moving path to a functional terminal or appliance, it belongs to `paths-motion`). |
| **`assembly-rotation`**<br>(تركيب وتدوير) | **Mentally manipulate, fold, slice, assemble, or rotate the object itself.** | **ROUTING:** If mentally rotating a standalone 3D solid or folding a net, route to **`assembly-rotation`**. (Predicting rotary direction across connected gears belongs to `paths-motion`). |
| **`spot-the-error`**<br>(اكتشف الخطأ) | **Infer an objective rule, then locate what breaks it.** | **ROUTING:** If a causal system has a deliberate broken connection that violates an inferred rule, route to **`spot-the-error`** (`broken-chain-link`). (Tracing an intact mechanism to discover its outcome belongs to `paths-motion`). |
| **`numbers-estimation`**<br>(أرقام وتقديرات) | **Playful numerical intuition and mental calculation.** | **ROUTING:** If calculating numerical gear speed ratios ($1:3$), route to **`numbers-estimation`**. (Predicting clockwise vs counter-clockwise direction stays in `paths-motion`). |

---

## 8. Generation Scalability

| Scalability Tier | Families Included | Justification |
|---|---|---|
| **HIGH** | `gear-train-direction`, `pulley-rope-system`, `pipe-valve-flow`, `electrical-switch-circuit`, `maze-exit-route`, `domino-cascade-chain`, `ball-marble-track`, `conveyor-sorter-route`, `one-way-traffic-flow`, `shortest-path-grid`, `wire-trace-terminal` | Immense variety of circuit layouts, gear configurations, hydraulic schematics, and kinetic tracks with procedural freshness. |
| **MEDIUM** | `cam-linkage-motion` | Classic mechanical linkages; highly memorable party moments when rotated with care. |
| **SPECIALIZED** | — | All 12 approved families possess sustainable generative depth. |

---

## 9. Batch-Level Variety Rules

When generating or reviewing an authored batch for `paths-motion`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Operation Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct kinetic modalities:
   - *Modality A (Mechanical & Rotary Dynamics):* `gear-train-direction`, `pulley-rope-system`, `cam-linkage-motion`.
   - *Modality B (Flows, Circuits & Networks):* `pipe-valve-flow`, `electrical-switch-circuit`, `conveyor-sorter-route`, `one-way-traffic-flow`.
   - *Modality C (Pathfinding, Mazes & Kinetic Drops):* `maze-exit-route`, `domino-cascade-chain`, `ball-marble-track`, `shortest-path-grid`, `wire-trace-terminal`.
4. **Zero Diagram Topology Duplication:** Never reuse the exact same circuit or pipe schematic with merely component labels swapped in the same batch.
5. **Dynamic Shuffling:** Note that answer option presentation order is randomized dynamically at session runtime by the game engine; authors should write clear, distinct distractors without worrying about artificial manual position balancing.

---

## 10. Library Evolution Rules

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 12 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against `observation-illusions`, `assembly-rotation`, and `spot-the-error`.
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
