# Scope Knowledge Profile: observation-illusions

## Identity / Boundaries
قوة الملاحظة والخداع البصري — Notice what is already present. The image in front of the player is the whole puzzle. The answer is visible before it is understood, and no inferred rule is required to reach it.

## Strong Content Territories
Strong: hidden figures, miscounted shapes, impossible objects, reflections that disagree with their source, perspective tricks, near-duplicate pairs, figure-ground reversals, illusory contours, shadow/contrast illusions.

## Weak / Boring Territories
Weak: illusions that need motion or a large screen, anything that fails on a phone at arm's length, images where the catch is invisible at render size, pixel-hunting in compression noise.

## Evidence Opportunities
Single high-contrast images that survive phone rendering; no caption or label may name the catch. Scalable SVG diagrams and calibrated high-resolution photographs.

## Terminology / Aliases
Use the player-facing Arabic name **قوة الملاحظة والخداع البصري** in copy; use the canonical slug
`observation-illusions` in every technical identifier. No other name or slug is approved.

## Ambiguity Traps
An illusion the author can see only because they already know the answer; a 'count the shapes' item with more than one defensible count; subjective figure-ground contours where multiple interpretations are equally plausible.

## Scope-Specific Taste
A good item here makes the player say «آه، شفتها» — the satisfaction comes from
the solve itself, never from having known something. Every item must survive
both `PUZZLES_WORLD_NO_TRIVIA` and `PUZZLE_ITSELF_IS_THE_CHALLENGE`.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09 (§23.11).

---

# Approved Puzzle Family Library (V1)
*World: `puzzles` (عالم الألغاز) | Scope: `observation-illusions` (قوة الملاحظة والخداع البصري)*

This is the canonical, human-product-approved registry of puzzle interaction shapes for this Scope.
Question authoring must strictly instantiate from this library; generators may not invent ad-hoc families during batch generation.

```
Scope (قوة الملاحظة والخداع البصري)
  └── Approved Family (e.g. figure-ground-reversal)
        └── Mechanic Fit (Moving XO / RYO / Bomb / Closest)
              └── Difficulty Levers (Tuned for target audience)
                    └── Question Craft (Concise, zero-trivia, Saudi-friendly)
```

---

## 1. `hidden-detail` (التفصيلة المخفية والتمويه)

### 1. Family ID
`hidden-detail`

### 2. Player Solve
Scans complex visual textures, natural foliage, or dense scene compositions to locate a camouflaged or embedded element that is visually present but overlooked upon casual inspection.

### 3. Identity
Pure observational search. The target physically exists in the rendered pixels; no rule deduction or mental manipulation is needed to perceive it once visual attention locks onto its contours.

### 4. Example Interaction Shapes
- Locate a camouflaged animal or insect whose skin pattern matches tree bark, dried leaves, or coral reef.
- Find a specific everyday tool (e.g. a key) textured into an ornate carpet, parquet floor, or wallpaper drawing.
- Identify which quadrant or region of a busy market stall contains a misplaced, hidden object.
- Detect an embedded silhouette or micro-drawing subtly blended into the crosshatch shading of a landscape engraving.

### 5. Mechanic Fit
- **Moving XO:** `GOOD` (4 clear text choices identifying the hidden object or its location quadrant).
- **RYO:** `EXCELLENT` (Perceptual blindness creates high bluffing tension: solvers who spot the camouflage are certain; opponents doubt whether it is real or imagined).
- **Bomb:** `LIMITED` (Camouflage search under 5–8s clock can feel punitive or degrade into blind guessing).
- **Closest:** `LIMITED` (Only applicable if estimating a scalar numeric quantity related to the detail, such as distance percentage along a single marked ruler/axis or count of camouflaged instances. Runtime has no 2D coordinate picker or spatial touch tap).

### 6. Mechanic-Native Notes
- **RYO:** Present 4 plausible items that could blend into the foliage texture; players who truly spotted it know which one is real, while bluffers guess blindly.
- **Closest:** Only valid when estimating a 1D scalar value (e.g. "كم كائناً مموهاً في هذا المشهد؟" on a numeric count slider). Spatial targeting via 2D minimaps or touch coordinates is unsupported in the runtime.
- **Moving XO:** Target must be discoverable within 8–10 seconds at 4-meter room distance; choices name the object or broad quadrant («أعلى اليمين»).

### 7. Target Solve Time
6–12 seconds. (Too slow for rapid 5s Bomb rounds; well-paced for 15s Moving XO and RYO).

### 8. Difficulty Levers
- *Luminance & Color Contrast:* High-contrast shape against background vs tone-on-tone camouflage matching the surrounding palette.
- *Contour Disruption:* Intact, unbroken silhouette vs target contour broken up by background hatch lines or dappled shadows.
- *Distractor Density:* Sparse background with few features vs dense, high-frequency textural clutter.
- *Target Scale:* Medium distinct object (10–15% screen height) vs smaller detail (5–7% screen height, never below shared-screen legibility).

### 9. Variety Dimensions
Natural environments (desert, forest, underwater), urban clutter (workshop, library desk, spice souq), architectural engravings, abstract line art, patterned textiles.

### 10. Media Requirements
`REQUIRED` (High-resolution image carrying the camouflaged subject).

### 11. Answer Modes
`multiple_choice`, `closest` (limited: 1D scalar/count only).

### 12. Anti-Patterns
- Reject sub-pixel hunting requiring zooming in on mobile.
- Reject details hidden in arbitrary compression artifacts or dark shadows.
- Reject obscure objects that players cannot name without specialist trivia.
- Reject targets whose camouflage makes them genuinely invisible or debatable.

### 13. Distinction from Neighboring Families
- *vs `figure-ground-reversal`:* In `hidden-detail`, the object is drawn with positive lines and textures camouflaged against positive background lines. In `figure-ground-reversal`, the object is formed exclusively in the negative empty space *between* drawn elements.
- *vs `spot-the-error`:* In `hidden-detail`, the hidden item does not break a logical rule; it is simply camouflaged.

### 14. Scalability Rating
`HIGH` (Immense variety of environments, textures, and camouflaged items across hundreds of themes).

---

## 2. `figure-ground-reversal` (انعكاس الشكل والأرضية والفضاء السلبي)

### 1. Family ID
`figure-ground-reversal`

### 2. Player Solve
Reverses visual attention from the foreground drawn shapes (positive space) to the unprinted empty space between them (negative space) to recognize an alternate concealed silhouette.

### 3. Identity
Classic Gestalt optical perception. The silhouette is permanently visible, but requires a perceptual figure-ground bistable switch in the visual cortex.

### 4. Example Interaction Shapes
- Identify the creature or vessel formed by the white negative space between two facing tree trunks or columns (Rubin vase type).
- Recognize the word or symbol formed in the empty spaces between interlocking abstract dark shapes.
- Determine which everyday tool or utensil is formed by the negative cutout between two animals.
- Perceive the secondary hidden profile in a dual-perception silhouette.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Instant "aha!" recognition; 4 clean text choices naming the negative space object).
- **RYO:** `EXCELLENT` (Bistable perception: players who experience the perceptual shift see it instantly with 100% certainty; those who stay locked on positive space see nothing).
- **Bomb:** `GOOD` (High-contrast binary visuals pop instantly for players with strong figure-ground perception).
- **Closest:** `DO_NOT_FORCE` (A negative space silhouette is either recognized or not; forcing a numerical slider on an all-or-nothing Gestalt switch is artificial).

### 6. Mechanic-Native Notes
- **Moving XO:** High contrast black-and-white vector graphics ensure the bistable illusion triggers cleanly from 4 meters away.
- **RYO:** Options list 4 concrete objects (e.g. كأس, شمعة, وجهان, شجرة); bluffers struggle because the negative space form is undeniable once seen.
- **Bomb:** Simple, iconic dual-silhouettes (e.g., faces vs vase, cat between legs) solvable in 3–5 seconds.

### 7. Target Solve Time
4–8 seconds.

### 8. Difficulty Levers
- *Contour Sharing Simplicity:* Familiar archetypal silhouettes (goblet, cat, face) vs complex compound tools/objects.
- *Color Polarity & Weight:* Equal 50/50 black-to-white area distribution vs unbalanced positive space dominance that suppresses the negative figure.
- *Boundary Ambiguity:* Crisp clean vector edges vs organic curved boundaries that require deeper closure.
- *Number of Negative Forms:* Single central negative figure vs multiple smaller negative motifs along a border.

### 9. Variety Dimensions
Architectural arches, tree branches, typography negative counters, dual-animal silhouettes, interlocking cultural motifs, furniture legs.

### 10. Media Requirements
`REQUIRED` (High-contrast binary image asset, SVG vector preferred).

### 11. Answer Modes
`multiple_choice`, `match`.

### 12. Anti-Patterns
- Reject muddy, low-contrast, or noisy gradients that prevent clear boundary separation.
- Reject ambiguous blobs that require imagination rather than exhibiting definite anatomical/geometric contours.
- Reject designs where positive space already forms the same object as the negative space.

### 13. Distinction from Neighboring Families
- *vs `hidden-detail`:* `hidden-detail` lives in the positive drawn textures; `figure-ground-reversal` lives in the empty white background between positive shapes.
- *vs `silhouette-match` (in `assembly-rotation`):* `silhouette-match` tests mental 3D-to-2D projection; `figure-ground-reversal` tests 2D bistable boundary perception.

### 14. Scalability Rating
`MEDIUM` (High artistic craftsmanship required to author valid bistable graphics, but highly memorable and evergreen).

---

## 3. `illusory-contour` (الحدود والأشكال الوهمية)

### 1. Family ID
`illusory-contour`

### 2. Player Solve
Perceives an unprinted, boundary-less geometric shape or line that the visual cortex automatically hallucinates through the precise alignment and orientation of surrounding inducing elements.

### 3. Identity
Pure physiological illusion (Kanizsa and Ehrenstein effects). The lines do not physically exist in the pixel data; the brain constructs them from spatial cues.

### 4. Example Interaction Shapes
- Name the illusory geometric polygon (triangle, square, star) induced by inwards-facing notched disks ("Pac-Man" figures).
- Identify whether an illusory line bridging two separated bar patterns is straight, curved, or tilted.
- Recognize the shape of the illusory "floating" white panel that appears brighter than the identical surrounding white background.
- Determine how many illusory vertices exist in a multi-inducer array.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Instant solve, high legibility, clean text choices naming the induced polygon or count of vertices).
- **RYO:** `GOOD` (Simple perceptual phenomenon; options contrast the illusory shape against the physical shapes of the inducers).
- **Bomb:** `EXCELLENT` (Ultra-fast 3–5s recognition; bold high-contrast graphics).
- **Closest:** `LIMITED` (Could estimate count of illusory shapes or vertices, but generally better suited to discrete multiple choice).

### 6. Mechanic-Native Notes
- **Moving XO:** Displayed on shared screen; options on phone list 4 geometric shapes (مثلث, مربع, دائرة, نجمة).
- **Bomb:** Rapid 4s micro-puzzle: "وش الشكل الوهمي اللي بالوسط؟"
- **RYO:** Distractors exploit inducers (e.g. naming the Pac-Man circle rather than the induced triangle).

### 7. Target Solve Time
3–6 seconds.

### 8. Difficulty Levers
- *Inducer Indication Ratio:* Wide cutout wedges (strong illusory induction) vs narrow, subtle cutouts (faint illusory boundary).
- *Number of Inducers / Polygon Complexity:* 3 inducers (triangle) vs 5 inducers (pentagon) or 8 inducers (star).
- *Support Ratio (Line Length vs Gap):* Long inducing lines with small gaps vs short inducing lines with wide spatial gaps.
- *Inducer Rotation / Symmetry:* Symmetrical cardinal alignment vs tilted, asymmetric orientation.

### 9. Variety Dimensions
Kanizsa polygons (triangles, squares, hexagons, stars), Ehrenstein circular brightness halos, illusory curvilinear paths, warped illusory planes.

### 10. Media Requirements
`REQUIRED` (Clean vector diagram, high-contrast dark inducers on light canvas).

### 11. Answer Modes
`multiple_choice`, `match`.

### 12. Anti-Patterns
- Reject faint inductions that depend on specific monitor brightness or viewing angles.
- Reject inducers that accidentally draw real connecting lines (eliminates the illusion).
- Reject overly complex polygon setups where inducers are ambiguous.

### 13. Distinction from Neighboring Families
- *vs `figure-ground-reversal`:* In `figure-ground-reversal`, a real physical boundary separates two regions. In `illusory-contour`, no physical boundary exists at all; the contour is an optical phantom.

### 14. Scalability Rating
`MEDIUM` (Airtight, iconic perceptual puzzles; best rotated across distinct polygon topologies and Ehrenstein brightness variants).

---

## 4. `size-distortion-illusion` (خداع الحجم والأبعاد)

### 1. Family ID
`size-distortion-illusion`

### 2. Player Solve
Evaluates and determines the true physical equality or relative dimension of lines, circles, or geometric figures despite surrounding context, perspective lines, or flanking elements that trigger deceptive scale distortions.

### 3. Identity
Classic psychophysical optical illusion (Müller-Lyer, Ponzo, Ebbinghaus, Jastrow, Titchener). Solved by mentally stripping the contextual framing to judge raw spatial magnitude.

### 4. Example Interaction Shapes
- Determine which of two horizontal bars between converging perspective tracks is physically longer (or if they are equal).
- Identify whether the central colored circle surrounded by giant circles is smaller, larger, or identical to the one surrounded by tiny circles (Ebbinghaus).
- Compare two curved arched blocks (Jastrow illusion) to identify their true relative size.
- Compare two vertical lines with inward vs outward arrowheads (Müller-Lyer) to name their true mathematical relationship.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Classic binary/categorical puzzle: "متساويان تماماً", "العلوي أطول", "السفلي أطول").
- **RYO:** `EXCELLENT` (Perceptual trap: players unversed in illusions fall for the perceptual bias, creating high bluffing and confidence divergence).
- **Bomb:** `GOOD` (Fast visual choice when prompt asks whether A and B are equal).
- **Closest:** `EXCELLENT` (Direct percentage or ratio estimation: "بكم تزيد الدائرة (أ) عن (ب)؟" or estimating the actual pixel length on a calibrated slider).

### 6. Mechanic-Native Notes
- **Closest:** "ما النسبة الفعلية بين طول الخط (أ) وطول الخط (ب)؟" -> Slider lands on 100% (متساويان), rewarding players who recognize the illusion while catching players who estimate 130% or 150%.
- **RYO:** Four options: A is larger, B is larger, Both are identical, A is double B. Trap options exploit the visual cortex's default misjudgment.
- **Moving XO:** Clear labeling of elements (A and B) with high-contrast colored markers so solvers instantly know what to compare.

### 7. Target Solve Time
4–7 seconds.

### 8. Difficulty Levers
- *Contextual Induction Strength:* Extreme converging grid (heavy distortion) vs subtle flanking angles (subtle distortion).
- *Truth State:* Identical equality ($A = B$) vs deceptive inequality ($A$ looks smaller but is actually slightly larger!).
- *Flanking Clutter Density:* Minimalist Müller-Lyer arrows vs realistic 3D scenic perspective (hallway, railway, street).
- *Orientation of Stimuli:* Horizontal/vertical vs diagonal/tilted orientations which degrade human visual estimation accuracy.

### 9. Variety Dimensions
Converging line illusions (Ponzo), arrowhead distortions (Müller-Lyer), surrounding ring contrasts (Ebbinghaus/Titchener), curved block arcs (Jastrow), vertical-horizontal illusion, Shepard tabletop dimensional distortion.

### 10. Media Requirements
`REQUIRED` (Precise geometric vector graphic or controlled perspective photograph).

### 11. Answer Modes
`multiple_choice`, `closest`.

### 12. Anti-Patterns
- Reject imprecise drawings where the artist intended equality but the pixels are actually unequal.
- Reject illusions requiring fine millimeter measurements that cannot be distinguished on screen.
- Reject prompts asking "which looks longer?" (must always ask for the *objective physical measurement*).

### 13. Distinction from Neighboring Families
- *vs `perspective-depth-trap`:* `size-distortion-illusion` compares 2D object lengths/areas distorted by visual cues. `perspective-depth-trap` involves forced perspective and depth planes.
- *vs `proportion-estimate` (in `numbers-estimation`):* Numbers-estimation tests mathematical intuition (e.g., estimating 33% of a pie); this family tests overcoming a sensory optical illusion.

### 14. Scalability Rating
`HIGH` (Extensive variety across classical and modern geometric illusions, abstract and pictorial scenes).

---

## 5. `color-contrast-illusion` (خداع اللون والسطوع)

### 1. Family ID
`color-contrast-illusion`

### 2. Player Solve
Evaluates true physical luminance, shade, or color hue of a target patch by overcoming the visual system's automatic local contrast adaptation, cast-shadow compensation, or simultaneous chromatic induction.

### 3. Identity
Sensory perceptual illusion (Adelson checker shadow, simultaneous brightness contrast, Chubb illusion, Munker-White assimilation, Craik-O'Brien-Cornsweet). Solved by evaluating raw physical luminance/hue independently of contextual illumination and surround.

### 4. Example Interaction Shapes
- Compare two checkerboard squares (one in cast shadow, one in full light) to determine that both have the exact same RGB grayscale luminance (Adelson).
- Identify which of two gray strips crossing different background gradients is physically identical in shade.
- Determine which colored stripe embedded among alternating tint bars (Munker-White effect) shares the identical hex color with a comparison swatch.
- Identify whether two colored discs illuminated under contrasting colored spotlights are physically identical in surface reflectance.

> [!NOTE]
> **Stroop Effect Status:** Color-word semantic interference (Stroop) is excluded from this Family in V1. Because Stroop relies on linguistic reading conflict rather than sensory luminance/chromatic perception, it is reserved as a **Future Candidate Family** pending separate Product review.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Fast binary verification; choices map to clear text color names or equality statements).
- **RYO:** `EXCELLENT` (Strong perceptual bias: players who don't know the trick vehemently defend the apparent difference, creating top-tier bluffing dynamics).
- **Bomb:** `GOOD` (High-contrast brightness or equality checks solvable in 3–5 seconds).
- **Closest:** `DO_NOT_FORCE` (Color shade matching is categorical or identical; forcing a numeric slider on hex values is unplayable).

### 6. Mechanic-Native Notes
- **Moving XO:** High-contrast displays on shared TV. For Adelson tiles, letters A and B clearly mark the targets. Phone displays clear text options («المربع أ أغمق», «المربع ب أغمق», «المربعان متطابقان تماماً»).
- **RYO:** Options provide the intuitive trap ("المربع أ أفتح بكثير") alongside the objective truth ("المربعان متطابقان تماماً في درجة اللون").
- **Bomb:** Rapid visual equality check: "هل الدرجتان متطابقتان؟" (نعم / لا).

### 7. Target Solve Time
3–6 seconds.

### 8. Difficulty Levers & Device Robustness
- *Consumer Display Robustness:* Differences must survive normal consumer displays (uncalibrated living-room TVs, budget phone screens, varied viewing angles). Never rely on subtle 2–3% RGB micro-differences that clip or crush in dark/light areas.
- *Calibration Independence:* Avoid calibration-dependent or color-profile-dependent answers. The intended equality or difference must be encoded safely and decisively in the source asset (identical RGB values for equality; distinct, perceptible delta for inequality).
- *Shadow Gradient Smoothness:* Stark shadow line vs smooth soft-edge penumbra (soft edges dramatically amplify brightness illusions).
- *Surrounding Induction Contrast:* High local contrast difference (black vs white surround) vs subtle chromatic shifts.
- *Spatial Separation of Targets:* Adjacent targets vs targets separated across opposite sides of a 3D scene.

### 9. Variety Dimensions
Cast shadow luminance (Adelson), simultaneous chromatic contrast, Munker-White color assimilation stripes, Craik-O'Brien-Cornsweet edge illusions, White's illusion, Hermann grid lightness patches. (Stroop is excluded).

### 10. Media Requirements
`REQUIRED` (Calibrated color/grayscale image asset).

### 11. Answer Modes
`multiple_choice`, `match`.

### 12. Anti-Patterns
- Reject Stroop color-word items (reserved as future candidate family).
- Reject reliance on poor monitor calibration or subtle RGB micro-deltas that clip on consumer screens.
- Reject yellow text on white canvas (fatal room legibility failure).
- Reject confusing questions asking "how does it appear?" rather than "what is its true color/shade?".

### 13. Distinction from Neighboring Families
- *vs `size-distortion-illusion`:* Focuses on spectral wavelength and luminance rather than spatial length/geometry.
- *vs `spot-the-difference`:* Not looking for changes across two images, but evaluating the physical reality of a single scene.

### 14. Scalability Rating
`HIGH` (Extensive psychophysical luminance and chromatic illusions; highly evergreen when tuned safely for consumer displays).

---

## 6. `perspective-depth-trap` (فخ المنظور والعمق)

### 1. Family ID
`perspective-depth-trap`

### 2. Player Solve
Evaluates true 3D spatial positioning and depth planes, unmasking forced perspective alignments where 2D camera angles trick the eye into seeing contact or scale that contradicts physical 3D layout.

### 3. Identity
Visual depth perception. Solved by analyzing grounded monocular depth evidence (ground planes, perspective convergence, shadow anchoring, occlusion) to determine true physical arrangement.

### 4. Example Interaction Shapes
- Determine which of two people in a forced-perspective photo is physically closer to the camera by tracing their cast shadow anchors on a tiled floor.
- Identify which of two balls is physically higher off the ground by analyzing where their cast shadows land on a visible floor plane.
- Determine whether a person is actually touching a distant object or standing meters in front of it, verified by visible perspective convergence lines on the pavement.
- Rank three objects from nearest to farthest along a marked perspective grid.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Clear multiple choice identifying depth plane, nearest object, or true ground contact).
- **RYO:** `EXCELLENT` (Forced perspective photographs create immediate debate between casual lookers and spatial analysts).
- **Bomb:** `GOOD` (Fast identification of which object is in the foreground).
- **Closest:** `GOOD` (Estimating true 1D depth distance or height based on visible floor tile units or shadow offset).

### 6. Mechanic-Native Notes
- **Closest:** 1D metric estimation only (e.g. "كم بلاطة تقريباً يبعد الشخص في الخلف عن الكاميرا؟" on a 1D numeric slider).
- **Moving XO:** "أي الشخصين أقرب فعلياً إلى الكاميرا؟" (أ ، ب ، على نفس المسافة). Phone displays clear text choices.
- **RYO:** High bluff potential because casual players fall for the 2D plane illusion without checking shadow or horizon clues.

### 7. Target Solve Time
5–9 seconds.

### 8. Difficulty Levers & Visual Evidence Determinacy
- **Visual Evidence Determinacy Criteria:** The answer must be strictly derivable from authored visual evidence within the image itself. Every item must provide at least two verifiable depth anchors:
  1. *Ground plane / floor / tile grid:* Visible floor grid, paving stones, or floorboards providing perspective convergence lines and distance scaling.
  2. *Shadow anchoring:* Cast shadows that ground the object onto a surface plane, revealing its true spatial offset.
  3. *Horizon line & vanishing points:* Clear horizon or architectural vanishing lines establishing camera height and depth scale.
  4. *Perspective convergence lines:* Converging wall, ceiling, or track lines that provide unambiguous linear perspective cues.
  5. *Explicit occlusion geometry:* Visible overlap edges where object A clearly occludes or is occluded by grounded structural features.
- *Cue Conflict:* Obvious lack of shadow vs carefully placed deceptive shadows.
- *Camera Elevation:* Eye-level shot vs oblique angle that distorts ground-plane perspective.

### 9. Variety Dimensions
Ames room geometry, forced perspective photographic tricks, shadow-depth decoupling (Kersten shadow illusion), tilted room illusions, anamorphic pavement art viewed from off-axis.

### 10. Media Requirements
`REQUIRED` (Photographic asset or realistic 3D render with verified lighting, ground grid, and depth planes).

### 11. Answer Modes
`multiple_choice`, `closest` (limited: 1D scalar depth/height).

### 12. Anti-Patterns
- **STRICT PROHIBITION:** Reject guessing real-world object sizes (e.g. assuming a toy car is real, or assuming a figurine has human height without ground anchors).
- **STRICT PROHIBITION:** Reject relying on underdetermined 3D scenes where depth is an ungrounded guess (e.g. floating objects against an empty sky or uniform background without ground contact or shadows).
- Reject setups where depth is mathematically indeterminable from a single 2D projection.
- Reject puzzles relying on knowing real-world dimensions of rare, obscure buildings.

### 13. Distinction from Neighboring Families
- *vs `assembly-rotation`:* Does not require rotating or projecting 3D blocks into 2D orthogonal views; tests depth-plane perception in a single presented view.
- *vs `impossible-object-perception`:* The scene depicts a physically possible real 3D space with a deceptive viewing angle, not a mathematically impossible object.

### 14. Scalability Rating
`MEDIUM` (High player delight; requires high-quality photography or calibrated 3D renders with verified depth evidence).

---

## 7. `impossible-object-perception` (المجسمات والتراكيب المستحيلة)

### 1. Family ID
`impossible-object-perception`

### 2. Player Solve
Inspects a 2D depiction of an impossible 3D construction to detect the geometric paradox, locate the impossible joint, or determine which section violates spatial topology.

### 3. Identity
Visual paradox observation (Escher, Penrose, Reutersvärd). The artwork tricks the visual cortex into interpreting local 2D corners as 3D depth, creating an impossible global structure.

### 4. Example Interaction Shapes
- Identify which numbered corner/joint (1, 2, 3, 4) contains the impossible overlap that makes the structure physically unbuildable.
- Determine how many prongs (2 or 3) exist at the base vs the top of an impossible tuning fork (poiuyt).
- Identify whether an Escher-style staircase is continuously descending, ascending, or flat when following a specific path.
- Spot which of four candidate wooden block assemblies is geometrically impossible in real 3D space.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Text choices identify the impossible joint `opt-a`..`opt-d` or the number of prongs).
- **RYO:** `EXCELLENT` (Players must spot the subtle impossible joint across the room; bluffing thrives on whether opponents see the topological break).
- **Bomb:** `GOOD` (Fast identification of the impossible figure among 4 shapes).
- **Closest:** `DO_NOT_FORCE` (An impossible paradox is topological/binary; forcing an estimate is unnatural).

### 6. Mechanic-Native Notes
- **Moving XO:** 4 numbered circular callout badges (1, 2, 3, 4) mark the vertices of the structure; phone displays `الزاوية (1)`, `الزاوية (2)`, etc.
- **Bomb:** "أي من الأشكال الأربعة يستحيل بناؤه في الواقع؟" (instant 5s recognition of Penrose triangle).
- **RYO:** Trap distractors highlight normal perspective joints, testing who actually traced the overlapping edges.

### 7. Target Solve Time
5–9 seconds.

### 8. Difficulty Levers
- *Structure Complexity:* 3-bar Penrose triangle vs multi-tiered impossible architectural palace (Escher waterfall).
- *Paradox Concentration:* Single blivet joint vs dispersed paradoxical shading and twist angles.
- *Rendering Style:* Minimalist flat wireframe vs fully shaded, realistic wood/marble texture that disguises the impossible seam.
- *Number of Candidate Vertices:* 3 labeled joints vs 6 labeled joints.

### 9. Variety Dimensions
Penrose triangles and squares, Escher continuous loop stairs, impossible multi-prong forks, impossible cubes, impossible archways, impossible crates.

### 10. Media Requirements
`REQUIRED` (Clean vector line art or shaded 3D CAD rendering).

### 11. Answer Modes
`multiple_choice`.

### 12. Anti-Patterns
- Reject sloppy illustrations where normal drawing errors look like intentional impossible joints.
- Reject overly convoluted mazes where tracing takes $>30$ seconds.
- Reject designs where multiple joints could equally be argued as the single impossible breach.

### 13. Distinction from Neighboring Families
- *vs `spot-the-error`:* Does not require inferring a taxonomic or mathematical group rule; the error is a direct violation of 3D Euclidean space embedded in the drawing.
- *vs `assembly-rotation`:* The object cannot be assembled or rotated in 3D because it cannot exist in 3D!

### 14. Scalability Rating
`MEDIUM` (Classic, highly engaging puzzle archetype; requires mathematically rigorous impossible graphics).

---

## 8. `count-in-clutter` (العدّ البصري في الزحام)

### 1. Family ID
`count-in-clutter`

### 2. Player Solve
Rapidly filters high-density visual clutter to count the exact number of target items defined by a specific conjunction of features (e.g. color + shape + orientation) within strict time limits.

### 3. Identity
Visual search and pre-attentive feature filtering. Tests selective visual attention and enumeration under distractor interference.

### 4. Example Interaction Shapes
- Count how many red triangles (pointing up) appear scattered among red squares, blue triangles, and green circles.
- Count how many open padlocks appear in an array of closed padlocks.
- Count how many dice show the number 5 in a scattered pile of mixed dice.
- Count how many coffee cups have steam rising among cups without steam.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Count strictly capped at 4–10 items; choices are distinct integers on phone).
- **RYO:** `EXCELLENT` (Off-by-one perceptual traps create natural tension between conservative and confident answers).
- **Bomb:** `LIMITED` (Counting more than 5 items under a 5s clock leads to panic guessing; acceptable only for counts $\le 5$).
- **Closest:** `EXCELLENT` (Continuous count estimation: target count 12–25 items; players slide to estimate the total count without having to be 100% exact).

### 6. Mechanic-Native Notes
- **Closest:** Natural home for larger counts (15–30 items). Player doesn't need to count every single one; rapid subitizing/estimation awards points for landing within $\pm 2$.
- **Moving XO:** Strict cap: target count must be **between 4 and 9 items**. No overlaps. Clear spacing. Distractors in choices represent off-by-one or distractor-category counts.
- **RYO:** Target count 6. Options: 5, 6, 7, 8. Bluffers struggle because counting requires active scanning.

### 7. Target Solve Time
6–10 seconds.

### 8. Difficulty Levers
- *Feature Conjunction Complexity:* Single feature (all stars) vs dual feature (yellow stars) vs triple feature (yellow 5-point stars).
- *Distractor Similarity:* Distractors share 0 features vs distractors share 1 or 2 features (high cognitive interference).
- *Spatial Distribution:* Gridded alignment vs randomly scattered, varied orientations.
- *Item Count:* Small set (4–6 items, fast solve) vs medium set (7–10 items, high-pressure solve).

### 9. Variety Dimensions
Everyday objects (keys, coins, stamps), geometric shapes, wildlife icons, gaming tokens, traffic signs, tools, food items.

### 10. Media Requirements
`REQUIRED` (Clean vector scatter or gridded illustration).

### 11. Answer Modes
`multiple_choice`, `closest`.

### 12. Anti-Patterns
- Reject counts above 10 for Moving XO / RYO (impossible to verify reliably in 15 seconds).
- Reject partially occluded items where whether something "counts" is debatable.
- Reject micro-scale targets that turn the game into pixel-peering.

### 13. Distinction from Neighboring Families
- *vs `quantity-intuition` (in `numbers-estimation`):* Numbers-estimation tests mathematical volume/order-of-magnitude intuition (e.g. 60 vs 200 marbles in a jar); `count-in-clutter` tests visual search and enumeration of discrete separated items.
- *vs `hidden-detail`:* `hidden-detail` searches for 1 camouflaged target; `count-in-clutter` searches for multiple distinct items across distractors.

### 14. Scalability Rating
`HIGH` (Endless theme variations, perfectly tunable difficulty via distractor conjunctions).

---

## 9. `spot-the-difference` (الفروقات بين المشهدين)

### 1. Family ID
`spot-the-difference`

### 2. Player Solve
Rapidly compares two side-by-side, near-identical versions of an illustrated scene to locate and identify the single deliberate visual discrepancy.

### 3. Identity
Canonical observation puzzle. Tests comparative visual saccades and change-blindness detection between two states of the same scene.

### 4. Example Interaction Shapes
- Compare Image A and Image B to identify which character's accessory (hat, belt, watch) is missing in Image B.
- Locate the single color change in an architectural facade between two otherwise identical photos.
- Identify which clock on a shelf displays a different time in the second image.
- Spot the single altered geometric shape in a repetitive decorative tile panel.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Text choices name the altered element: «القبعة», «الساعة», «الحذاء», «النافذة»).
- **RYO:** `EXCELLENT` (Change blindness creates prime RYO gameplay: players who notice the difference are certain, while others overlook it completely).
- **Bomb:** `GOOD` (Fast identification if the difference is a prominent macro feature).
- **Closest:** `LIMITED` (Only applicable if estimating a numeric/count difference between the two scenes, e.g. "how many more items appear in scene B?". Runtime does not support 2D coordinate tapping or spatial minimaps).

### 6. Mechanic-Native Notes
- **Closest:** Only usable when the discrepancy translates into a 1D numeric count (e.g. "كم عنصراً إضافياً يظهر في المشهد الثاني مقارنة بالأول؟" on a 1D numeric slider). Spatial targeting via 2D minimaps or coordinate pickers is completely unsupported in the runtime.
- **Moving XO:** The discrepancy must be a **macro feature** (e.g. an entire hat color, a missing bird, a reversed sign), NEVER a single missing button or altered line pixel.
- **RYO:** 4 distinct elements in the scene are named in choices; only one actually changed.

### 7. Target Solve Time
6–10 seconds.

### 8. Difficulty Levers
- *Discrepancy Type:* Complete removal/addition vs color swap vs positional shift.
- *Discrepancy Salience:* Central foreground element vs peripheral midground element.
- *Visual Scene Density:* Clean 5-element composition vs bustling 25-element street scene.
- *Image Separation / Scale:* Two side-by-side images taking full screen width.

### 9. Variety Dimensions
Cartoon vignettes, isometric rooms, botanical drawings, city streets, space stations, classic paintings with a humorous modern change.

### 10. Media Requirements
`REQUIRED` (Side-by-side composite image with Image A and Image B clearly labeled).

### 11. Answer Modes
`multiple_choice`, `closest` (limited: 1D count delta only).

### 12. Anti-Patterns
- Reject multiple differences (MUST HAVE EXACTLY ONE DEFICIT/CHANGE).
- Reject tiny pixel changes that fail at 4 meters on a living room TV.
- Reject differences in JPEG compression artifacts or slight blur differences.

### 13. Distinction from Neighboring Families
- *vs `visual-inconsistency`:* `visual-inconsistency` has only ONE image with an internal physical paradox. `spot-the-difference` has TWO side-by-side images compared against each other.
- *vs `spot-the-error`:* Does not test an abstract group rule; tests comparative difference between Image A and Image B.

### 14. Scalability Rating
`HIGH` (Universal puzzle archetype, massive cultural familiarity, endless scene possibilities).

---

## 10. `visual-match-scan` (المطابقة البصرية الدقيقة)

### 1. Family ID
`visual-match-scan`

### 2. Player Solve
Scans an array of highly similar candidate figures to identify the single exact 1:1 duplicate of a central reference item, filtering out distractors with subtle feature variations.

### 3. Identity
Visual discrimination and feature matching. The target and distractors share 90% of their visual identity; the solver must isolate the unique diagnostic feature.

### 4. Example Interaction Shapes
- Match a target complex key/keyhole silhouette against 4 candidate keys where teeth or grooves vary slightly.
- Identify which of 4 patterned Persian rugs has the exact matching central medallion to the reference sample.
- Find which snowflake or mandala among 4 choices matches the target design.
- Match a specific stylized fingerprint or crest against 4 candidates.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Reference on left, 4 labeled candidates A, B, C, D on right; phone displays `أ`, `ب`, `ج`, `د`).
- **RYO:** `EXCELLENT` (Distractor traps create high bluffing value; near-miss options catch careless players).
- **Bomb:** `GOOD` (Fast visual scanning under clock).
- **Closest:** `DO_NOT_FORCE` (Matching is discrete identity; non-continuous).

### 6. Mechanic-Native Notes
- **Moving XO:** Reference displayed with 4 candidates clearly labeled (أ، ب، ج، د); phone shows 4 text buttons.
- **RYO:** Each distractor alters a specific feature (one changes color, one changes tip, one flips horizontally), giving each distractor plausible appeal.
- **Bomb:** Simpler feature sets solvable in 4–6 seconds.

### 7. Target Solve Time
5–8 seconds.

### 8. Difficulty Levers
- *Diagnostic Feature Subtlety:* Major shape change vs minor accessory/stripe alteration.
- *Number of Feature Dimensions:* 1 varying attribute (e.g. number of notches) vs multi-attribute variation (notches + color + tip).
- *Distractor Symmetry:* Asymmetric variations vs mirrored distractors.
- *Number of Candidates:* 3 candidates vs 4 candidates.

### 9. Variety Dimensions
Keys, postage stamps, heraldic crests, ancient coins, stylized snowflakes, tribal masks, intricate jewelry, sci-fi emblems.

### 10. Media Requirements
`REQUIRED` (High-resolution multi-panel image asset).

### 11. Answer Modes
`multiple_choice`.

### 12. Anti-Patterns
- Reject distractors whose difference is so tiny that it requires magnifying glasses.
- Reject rotation-based matching (matching via mental rotation belongs to `assembly-rotation`!). Figures must share the same orientation.
- Reject more than one identical match.

### 13. Distinction from Neighboring Families
- *vs `silhouette-match` (in `assembly-rotation`):* The candidates in `visual-match-scan` share the exact same orientation and 2D rendering style as the reference (no 3D projection or rotation).
- *vs `spot-the-difference`:* Compares 4 isolated candidate items against 1 target, rather than comparing two full scenes.

### 14. Scalability Rating
`HIGH` (High aesthetic flexibility, clean multiple-choice mapping).

---

## 11. `reflection-fidelity` (انعكاس المرآة والمسطحات)

### 1. Family ID
`reflection-fidelity`

### 2. Player Solve
Inspects an object and its ACTUALLY PRESENTED static reflection in a mirror, glass, or water surface to identify optical discrepancies, compare source/reflection details, or identify which candidate reflection is physically and optically correct.

### 3. Identity
Direct observation of optical reflection geometry. The player checks lateral inversion, angle of reflection, and feature consistency in a static visual presentation where the reflection is visibly depicted.

### 4. Example Interaction Shapes
- Compare a displayed analog clock and its rendered mirror reflection to determine whether the reflected hands are optically faithful or inverted incorrectly.
- Identify which of 4 candidate rendered mirror reflections of an asymmetrical figure or hand gesture is optically correct.
- Compare a storefront sign and its reflection in a wet puddle to spot the single letter that was reflected without lateral inversion.
- Identify which detail in a displayed mirror reflection contradicts the real subject's posture (e.g. raised left hand vs right hand).

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Instant solve; choices name the mismatched feature or identify the correct candidate reflection A, B, C, D).
- **RYO:** `EXCELLENT` (Lateral inversion tricks intuitive thinking; players who forget mirror reversal pick the un-inverted distractor).
- **Bomb:** `EXCELLENT` (Fast reflection check in 4–6s).
- **Closest:** `GOOD` (Can estimate reflected tilt angles or degrees of reflection deviation on an angular slider).

### 6. Mechanic-Native Notes
- **Moving XO:** A real object and its candidate reflection(s) are both displayed on the shared TV. Phone options provide clear text choices (e.g. «الانعكاس (ب) صحيح», or naming the mismatched feature «اليد المرفوعة»).
- **RYO:** Trap options exploit un-flipped or incorrectly flipped reflections.
- **Bomb:** Snappy reflection check: "أي انعكاس هو الصحيح؟" (أ / ب).

### 7. Target Solve Time
4–7 seconds.

### 8. Difficulty Levers
- *Symmetry of Subject:* Highly asymmetrical subject (clock hands, text) vs semi-symmetrical object.
- *Axis of Reflection:* Simple vertical plane (left-right flip) vs horizontal water plane (top-bottom flip) vs tilted angled mirror.
- *Detail Complexity:* Single clock hand vs person holding different colored items in left vs right hand.
- *Truth State:* Determining the correct reflection among candidates vs spotting the single error in a displayed reflection.

### 9. Variety Dimensions
Analog clocks, digital numbers, clothing logos, person gestures in mirrors, water puddles, shop window reflections, rear-view car mirrors.

### 10. Media Requirements
`REQUIRED` (Image asset showing subject and reflective surface side by side, or subject with candidate reflections).

### 11. Answer Modes
`multiple_choice`, `match`, `closest` (angular tilt/degrees).

### 12. Anti-Patterns
- **STRICT PROHIBITION:** Reject mental generation of unseen reflections (e.g. «الساعة تشير إلى 3:00، ماذا سيظهر في المرآة؟» without displaying the mirror reflection). Asking the player to mentally invert an unrendered image is a mental transformation task that belongs to `assembly-rotation`. In `observation-illusions`, the reflection MUST be physically rendered on screen.
- Reject requiring 3D spatial rotation of a solid volume (that belongs to `assembly-rotation`). This family evaluates 2D optical mirror plane reflection.
- Reject physically inaccurate reflections from amateur artists.
- Reject blurry water ripples that make checking reflection impossible.

### 13. Distinction from Neighboring Families
- *vs `assembly-rotation`:* `assembly-rotation` requires the player to mentally transform, rotate, or invert an unrendered object in their mind. `reflection-fidelity` in `observation-illusions` strictly inspects a reflection that is *already visually presented on screen*, evaluating whether the rendered reflection matches the source subject.
- *vs `spot-the-error`:* Does not require deducing an abstract group rule; tests optical consistency between a visible subject and its visible reflection.

### 14. Scalability Rating
`HIGH` (Rich everyday optical situations, clocks, signs, and character reflections).

---

## 12. `overlapping-boundary-trace` (تداخل الأشكال والمسارات المغلقة)

### 1. Family ID
`overlapping-boundary-trace`

### 2. Player Solve
Traces and disentangles overlapping, intertwined, or intersecting static geometric outlines and closed boundaries to identify complete shapes, count distinct loops, or find which boundary encloses a specific point.

### 3. Identity
Visual continuity and contour integration. Tests the brain's ability to maintain edge tracking across high-frequency visual intersections.

### 4. Example Interaction Shapes
- Count how many complete, unbroken circles exist in an array of intersecting ring outlines.
- Determine which letter/symbol is located inside the intersection of all three overlapping polygons.
- Trace which of 4 overlapping colored ribbons or loops is completely continuous from start to finish without breaks.
- Identify which shape contains the red dot when 4 complex irregular closed boundaries overlap.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Choices identify the enclosed shape, ribbon color, or integer count).
- **RYO:** `GOOD` (Boundary tracing under pressure creates uncertainty; players second-guess intersection points).
- **Bomb:** `GOOD` (Simple 3-shape intersections solvable in 4–6s).
- **Closest:** `EXCELLENT` (Estimating the count of overlapping loops, or estimating the percentage of area shared by an intersection).

### 6. Mechanic-Native Notes
- **Closest:** "كم دائرة متداخلة في هذا الشكل؟" Slider for count (5 to 15 loops).
- **Moving XO:** "في أي شكل يقع المربع الصغير؟" Choices: «المثلث والدائرة فقط», «المربع فقط», «جميع الأشكال الثلاثة», «خارج الأشكال».
- **RYO:** High distractor plausibility based on partial overlaps.

### 7. Target Solve Time
5–9 seconds.

### 8. Difficulty Levers
- *Line Continuity / Color Differentiation:* Monochromatic black line-art (high difficulty) vs distinct contrasting colored outlines (accessible).
- *Number of Intersections:* 3 intersecting shapes (6 intersection nodes) vs 6 intersecting shapes (15+ nodes).
- *Shape Regularity:* Perfect circles/ovals vs irregular wavy organic closed contours.
- *Line Thickness & Spacing:* Wide separation vs dense overlapping clusters.

### 9. Variety Dimensions
Venn diagrams, Olympic-style interlocking rings, Celtic knotwork loops, geometric polygons, transparent stained-glass facets, contour map elevation lines.

### 10. Media Requirements
`REQUIRED` (Clean vector line diagram).

### 11. Answer Modes
`multiple_choice`, `closest`.

### 12. Anti-Patterns
- Reject dynamic motion or flowing systems (flowing water, electricity, or moving marbles belong to `paths-motion`!). Here, boundaries are 100% static geometric enclosures.
- Reject lines so tangled that solving requires a physical stylus or tracing finger.
- Reject ambiguous line intersections where lines merge into solid blobs.

### 13. Distinction from Neighboring Families
- *vs `path-trace` (in `paths-motion`):* `path-trace` tests system outcome (which wire connects switch to bulb, which pipe pours water). `overlapping-boundary-trace` tests static visual boundary integration (which closed shape encloses a point, how many static loops overlap).

### 14. Scalability Rating
`HIGH` (Mathematically clean, easily tunable from easy to hard).

---

## 13. `visual-closure-fragment` (التعرف عبر الاكتمال البصري)

### 1. Family ID
`visual-closure-fragment`

### 2. Player Solve
Identifies a highly familiar everyday object, common tool, animal, food item, or stationery from an extreme macro crop, tight aperture view, or fragmented partial silhouette by applying Gestalt visual closure.

### 3. Identity
Visual pattern completion. Tests recognizing the holistic whole from diagnostic visual fragments of common items without requiring cultural, historical, or specialist recall.

### 4. Example Interaction Shapes
- Identify an everyday household item (e.g. cheese grater, zipper, lightbulb filament) shown under extreme macro magnification.
- Recognize a common animal (e.g. giraffe, zebra, honeybee) from a distinctive cropped fragment of its skin/coat/wing pattern.
- Identify a common stationery tool (e.g. stapler, paperclip, eraser) viewed through small circular apertures in an opaque mask.
- Recognize a familiar fruit or vegetable (e.g. strawberry, orange peel, kiwi) from a tight surface texture crop.
- Identify a common kitchen utensil (e.g. whisk, fork tine, peeler) from its fragmented line silhouette.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Instant recognition for players who spot the diagnostic texture; 4 text options).
- **RYO:** `EXCELLENT` (Macro crops induce great debate: players who recognize the texture are confident; others guess generic items).
- **Bomb:** `EXCELLENT` (Ultra-fast 3–5s visual recognition round).
- **Closest:** `DO_NOT_FORCE` (Identity recognition is discrete/nominal).

### 6. Mechanic-Native Notes
- **Moving XO:** Strictly restricted to common, everyday items (kitchen utensils, common tools, fruits, stationery). Choices list 4 everyday items (e.g. سحاب، مبشرة، مصفاة، مفتاح).
- **Bomb:** Snappy party game item: "وش هذا الشيء؟" (Macro photo of a toothbrush or pencil tip).
- **RYO:** Options list items with visually similar textures (e.g. for a strawberry surface: فراولة، توت، قماش، جلد).

### 7. Target Solve Time
3–6 seconds.

### 8. Difficulty Levers
- *Crop Granularity / Field of View:* 40% of object visible (easy) vs 15% diagnostic macro crop (challenging).
- *Aperture Masking:* Single clear zoom vs viewing through multiple scattered circular holes.
- *Everyday Familiarity of Texture:* Characteristic signature texture (tennis ball fuzz) vs more generic material (smooth plastic edge).
- *Plausibility of Distractor Textures:* Distinct items vs items made of identical material.

### 9. Variety Dimensions
Everyday kitchen utensils, stationery, macro nature textures (bark, honeycomb, feathers, citrus peel), textiles, sports balls, common household hardware. (Landmarks and specialist tools strictly excluded).

### 10. Media Requirements
`REQUIRED` (High-resolution authentic macro photograph or masked composition).

### 11. Answer Modes
`multiple_choice`, `match`.

### 12. Anti-Patterns
- **STRICT PROHIBITION:** Reject landmarks, famous monuments, buildings, or geographic sites (visual closure must test perceptual completion, never travel/cultural trivia).
- **STRICT PROHIBITION:** Reject specialist, medical, or trade-specific tools (e.g. surgical instruments, electronic circuit testers) that require domain recall.
- Reject micro-biology (cells, bacteria, histology slides) or obscure exotic fauna.
- Reject crops so extreme that the image is just generic flat color with zero diagnostic texture.
- Reject synthetic generated photos that distort authentic object physics.

### 13. Distinction from Neighboring Families
- *vs `hidden-detail`:* In `hidden-detail`, the entire object is present but camouflaged in a wider scene. In `visual-closure-fragment`, the object is zoomed in or masked so only a fragment is visible.
- *vs `silhouette-match` (in `assembly-rotation`):* Does not test 3D rotation or mental folding; tests surface texture and 2D contour closure.

### 14. Scalability Rating
`HIGH` (Thousands of everyday objects possess iconic, recognizable micro-textures).

---

## 14. `visual-asymmetry-detection` (ملاحظة كسر التناظر)

### 1. Family ID
`visual-asymmetry-detection`

### 2. Player Solve
Scans an otherwise strictly symmetrical visual pattern (bilateral or radial) to locate the single intentional flaw, mismatched element, or broken symmetry.

### 3. Identity
Visual symmetry perception. The human visual system processes symmetry pre-attentively; this family tests spotting the localized disruption of that symmetry.

### 4. Example Interaction Shapes
- Spot which quadrant or petal of an intricate symmetrical mandala contains a broken line or altered motif.
- Identify which wing of a symmetrical butterfly illustration has an extra spot or altered vein.
- Detect which column in a symmetrical classical building facade has an altered capital or base.
- Identify which corner of an ornate decorative Persian tile pattern breaks 4-fold radial symmetry.

### 5. Mechanic Fit
- **Moving XO:** `EXCELLENT` (Choices identify the location of the asymmetry: «أعلى اليمين», «أسفل اليسار», etc., or the specific altered feature).
- **RYO:** `EXCELLENT` (Scanning symmetry under pressure creates strong bluffing; finding the flaw yields complete certainty).
- **Bomb:** `GOOD` (Fast quadrant spotting if the asymmetry is prominent).
- **Closest:** `GOOD` (Estimating the angular direction of the asymmetry: clock-face 1:00 to 12:00 or degrees 0° to 360° on an angular slider).

### 6. Mechanic-Native Notes
- **Closest:** "في أي اتجاه يقع كسر التناظر؟" (Clock face angle 1:00 to 12:00, or degrees 0° to 360° on an angular slider). Spatial 2D touch tapping is not supported.
- **Moving XO:** 4 labeled quadrant badges (أ، ب، ج، د) on the mandala; phone choices: `الربع أ`, `الربع ب`, `الربع ج`, `الربع د`.
- **RYO:** High bluff tension: opponents who haven't spotted the flaw can't distinguish between real asymmetry and perceived optical noise.

### 7. Target Solve Time
5–9 seconds.

### 8. Difficulty Levers
- *Symmetry Order:* Simple bilateral mirror symmetry (left vs right) vs 4-fold or 8-fold radial symmetry.
- *Disruption Magnitude:* Missing major decorative petal vs slightly altered line curve.
- *Pattern Density:* Simple geometric motif vs intricate high-frequency mandala line-art.
- *Canvas Color/Contrast:* High contrast black-and-white vs polychromatic patterned tiles.

### 9. Variety Dimensions
Islamic geometric patterns, Persian tilework, butterfly wings, snowflake crystals, ornamental wrought iron gates, architectural facades, kaleidoscope images.

### 10. Media Requirements
`REQUIRED` (High-resolution symmetrical vector art or photograph).

### 11. Answer Modes
`multiple_choice`, `closest` (angular direction/degrees).

### 12. Anti-Patterns
- Reject natural organic imperfections in hand-drawn sketches (flaw must be deliberate, crisp, and unambiguous).
- Reject requiring players to infer a mathematical group rule (that belongs to `spot-the-error`). This family tests visual symmetry disruption in a single cohesive pattern.
- Reject patterns with more than one asymmetrical flaw.

### 13. Distinction from Neighboring Families
- *vs `spot-the-error`:* Spot-the-error presents a group of discrete items where 1 breaks an inferred abstract rule. `visual-asymmetry-detection` presents a single continuous symmetrical figure and tests noticing the broken symmetry in its geometry.
- *vs `spot-the-difference`:* `spot-the-difference` compares two separate pictures. `visual-asymmetry-detection` inspects one single image for internal left/right or radial asymmetry.

### 14. Scalability Rating
`HIGH` (Vast wealth of geometric patterns, mandalas, architectural ornaments, and natural symmetrical subjects).

---

## Consolidated Mechanic Compatibility Matrix

| # | Approved Family ID | Arabic Title | Moving XO | RYO | Bomb | Closest | Primary Media | Primary Answer Modes |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `hidden-detail` | التفصيلة المخفية والتمويه | GOOD | EXCELLENT | LIMITED | LIMITED | Image | MC, Closest (scalar) |
| 2 | `figure-ground-reversal` | انعكاس الشكل والأرضية والفضاء السلبي | EXCELLENT | EXCELLENT | GOOD | DO_NOT_FORCE | Image (Vector) | MC, Match |
| 3 | `illusory-contour` | الحدود والأشكال الوهمية | EXCELLENT | GOOD | EXCELLENT | LIMITED | Image (Vector) | MC, Match |
| 4 | `size-distortion-illusion` | خداع الحجم والأبعاد | EXCELLENT | EXCELLENT | GOOD | EXCELLENT | Image | MC, Closest (ratio/length) |
| 5 | `color-contrast-illusion` | خداع اللون والسطوع | EXCELLENT | EXCELLENT | GOOD | DO_NOT_FORCE | Image | MC, Match |
| 6 | `perspective-depth-trap` | فخ المنظور والعمق | EXCELLENT | EXCELLENT | GOOD | GOOD | Image (Photo/3D) | MC, Closest (depth) |
| 7 | `impossible-object-perception` | المجسمات والتراكيب المستحيلة | EXCELLENT | EXCELLENT | GOOD | DO_NOT_FORCE | Image (Line/3D) | MC |
| 8 | `count-in-clutter` | العدّ البصري في الزحام | EXCELLENT | EXCELLENT | LIMITED | EXCELLENT | Image | MC, Closest (count) |
| 9 | `spot-the-difference` | الفروقات بين المشهدين | EXCELLENT | EXCELLENT | GOOD | LIMITED | Image (Dual) | MC, Closest (count delta) |
| 10 | `visual-match-scan` | المطابقة البصرية الدقيقة | EXCELLENT | EXCELLENT | GOOD | DO_NOT_FORCE | Image (Multi) | MC |
| 11 | `reflection-fidelity` | انعكاس المرآة والمسطحات | EXCELLENT | EXCELLENT | EXCELLENT | GOOD | Image | MC, Match, Closest (angle) |
| 12 | `overlapping-boundary-trace` | تداخل الأشكال والمسارات المغلقة | EXCELLENT | GOOD | GOOD | EXCELLENT | Image (Vector) | MC, Closest (count/area) |
| 13 | `visual-closure-fragment` | التعرف عبر الاكتمال البصري | EXCELLENT | EXCELLENT | EXCELLENT | DO_NOT_FORCE | Image (Macro) | MC, Match |
| 14 | `visual-asymmetry-detection` | ملاحظة كسر التناظر | EXCELLENT | EXCELLENT | GOOD | GOOD | Image | MC, Closest (angle) |

---

## Closest Dedicated Review (Observation-Native Estimation)

In Puzzles World, Closest must remain **reasoning-derived visual/spatial estimation**, never trivia recall (§23.11).

**Runtime Contract:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders (numeric values, percentages, or angular directions).

### Natural Closest Interaction Types in Observation:
1. **Count & Enumeration (Subitizing Boundary):**
   - Supported Families: `count-in-clutter` (`EXCELLENT`), `overlapping-boundary-trace` (`EXCELLENT` — count of complete loops), `spot-the-difference` (`LIMITED` — difference in item count between scenes).
   - Interaction: Cluttered scenes with 12–25 items. Exact counting within 15 seconds is impossible; players estimate the count on a 1D numeric slider. Closest to true count wins.
2. **Proportion, Ratio & Scale Estimation:**
   - Supported Families: `size-distortion-illusion` (`EXCELLENT`), `overlapping-boundary-trace` (`EXCELLENT`).
   - Interaction: Estimating the actual percentage ratio between two elements (e.g. Müller-Lyer true ratio = 100%), or estimating the percentage of shared overlap area between two geometric shapes (e.g. 25% vs 40%) on a 0%–100% slider.
3. **Angle & Orientation Estimation:**
   - Supported Families: `visual-asymmetry-detection` (`GOOD`), `reflection-fidelity` (`GOOD`).
   - Interaction: Estimating the angular direction of an asymmetry (e.g. 0° to 360° or clock-face 1:00 to 12:00), or estimating the tilt angle of a reflected plane.
4. **Scalar Distance & Depth Along Ground Scale:**
   - Supported Family: `perspective-depth-trap` (`GOOD`).
   - Interaction: Estimating depth distance or height on a 1D metric slider based on visible perspective floor tiles or shadow offsets.

### Explicitly Rejected Fake Closest Adaptations:
- ❌ 2D minimaps, coordinate grids, or spatial screen tapping (completely unsupported in runtime).
- ❌ Asking for raw image pixel dimensions («كم بكسل عرض الشكل؟»).
- ❌ Forcing numeric sliders on binary or nominal perceptual switches (e.g. rating resemblance).
- ❌ Asking factual trivia about an optical illusion's discovery year or creator.

---

## Overlap Audit & Scope Routing Rules

To prevent authoring drift across Puzzles World, apply this strict 4-part scope routing invariant:

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **RULE:** The stimulus is static. The answer is directly visible before it is understood. **No rule inference, no dynamic physical motion, no mental transformation/rotation.** |
| **`assembly-rotation`**<br>(تركيب وتدوير) | **The player must mentally transform the object itself.** | **ROUTING:** If the player must rotate a 3D block, fold/unfold a net, slice/cross-section a solid, project 2D/3D silhouettes, or mentally assemble displaced pieces, route to **`assembly-rotation`**. |
| **`spot-the-error`**<br>(اكتشف الخطأ) | **The player must infer an objective rule, then locate what breaks it.** | **ROUTING:** If the player must deduce an abstract taxonomic, numerical, logical, or semantic rule governing a set and identify the outlier/violator, route to **`spot-the-error`**. (A visual asymmetry in a single cohesive symmetrical pattern stays in `observation-illusions`). |
| **`paths-motion`**<br>(مسارات وحركة) | **The player must simulate dynamic evolution across time or kinematic chain.** | **ROUTING:** If the outcome requires tracing dynamic physical causality (gears turning, fluids flowing through valves, electrical circuits completing, rolling balls, kinematic linkages), route to **`paths-motion`**. (Static overlapping geometric loops stay in `observation-illusions`). |

### Secondary Boundary Notes:
- **`numbers-estimation` (أرقام وتقدير):** If the challenge is primarily arithmetic calculation, number sequences, digital sums, or statistical order-of-magnitude estimation without visual perceptual illusion, route to **`numbers-estimation`**.
- **`wordplay-letters` (ألعاب لغوية وحروف):** If language itself (Arabic script morphology, anagrams, letter subtraction) is the manipulated material, route to **`wordplay-letters`**.

---

## Generation Scalability

| Scalability Tier | Sustained Volume | Families Included | Justification |
|---|:---:|---|---|
| **Tier 1: High Depth** | **100+ items** | `hidden-detail`, `count-in-clutter`, `spot-the-difference`, `visual-asymmetry-detection`, `visual-match-scan` | Infinite thematic variability across nature, architecture, art, objects, and graphic patterns without repeating visual topologies. |
| **Tier 2: Medium Depth** | **50+ items** | `size-distortion-illusion`, `color-contrast-illusion`, `reflection-fidelity`, `overlapping-boundary-trace`, `visual-closure-fragment` | Rich psychophysical and everyday scenarios; requires disciplined asset design to prevent perceptual fatigue. |
| **Tier 3: Specialized Depth** | **25+ items** | `figure-ground-reversal`, `illusory-contour`, `perspective-depth-trap`, `impossible-object-perception` | High-craftsmanship optical phenomena. Highly memorable party moments; best preserved by rotating sparingly rather than flooding batches. |

---

## Batch-Level Variety Rules

When generating or reviewing an authored batch for `observation-illusions`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Operation Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct cognitive modalities:
   - *Modality A (Optical Illusions):* `size-distortion-illusion`, `color-contrast-illusion`, `illusory-contour`, `impossible-object-perception`.
   - *Modality B (Visual Search / Clutter):* `hidden-detail`, `count-in-clutter`, `spot-the-difference`, `visual-match-scan`.
   - *Modality C (Structural / Spatial Observation):* `figure-ground-reversal`, `reflection-fidelity`, `overlapping-boundary-trace`, `visual-asymmetry-detection`, `visual-closure-fragment`.
4. **Zero Visual Topology Duplication:** Never repeat the same base diagram with merely colors or icon assets swapped in the same batch.
5. **Answer Option Position Balance:** In multiple choice, correct answers must be distributed evenly across `opt-a`, `opt-b`, `opt-c`, `opt-d`.

---

## Library Evolution Rules

The Puzzle Family Library is an authoring contract. It evolves through deliberate product governance, never through accidental generator expansion:

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 14 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against all neighboring Scopes (`spot-the-error`, `assembly-rotation`, `paths-motion`).
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
