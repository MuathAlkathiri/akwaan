# Question Craft Contract

## 0. Canonical Principle

> **"Never begin by asking what trivia facts can I write.**
> **Begin by asking what interaction/question shape would be fun to play.**
> **Then find a recognizable, fair fact that fits that shape."**

Content in Akwaan exists to create active gameplay moments: rapid recognition, suspense, bluffing, cooperation, lively team debate, and memorable reveals. A question that is merely an encyclopedia fact wrapped in `"ما هو / من هو"` is a failure of question craft.

---

## 1. The 12 Pillars of Question Craft

Every authored question must be evaluated against these 12 core standards:

1. **Immediate Understandability**:
   The player must grasp the question premise and target in <3 seconds. Pacing is paramount in multiplayer party games.
2. **Fun Reveal**:
   The answer reveal must trigger an emotional payoff: a laugh, an "aha!" eureka moment, a fist-pump, or playful team banter.
3. **Recognizable Knowledge**:
   Test salient, culturally resonant, or deeply authentic franchise lore—never obscure footnote trivia chosen merely for artificial difficulty.
4. **Short, Readable Wording**:
   Keep player-facing prompts concise, punchy, and mobile-screen friendly (<120 characters preferred for rapid mechanics).
5. **Group Discussion & Spectator Readability**:
   Questions should provoke spontaneous verbal reactions among teammates and remain easily followable for spectators watching the big screen.
6. **Pace & Rhythm Suitability**:
   Calibrate question structure to the mechanic time envelope (e.g. 5–10s rapid reflex for Bomb vs 25s bluffing for RYO vs 45s puzzle-solving for Co-op).
7. **Varied Cognitive Interaction**:
   Rotate the mental task required: name fragment completion, sequence deduction, visual detail recognition, reverse association, attribute recall, or category triangulation.
8. **Difficulty != Fun**:
   Difficulty and fun are independent axes. A simple question can be wildly fun (e.g. `"بيلينغهام... وش اسمه الأول؟" -> جود`); a hard question must be deeply satisfying and fair, not tedious.
9. **Low Ambiguity & Single Truth**:
   The question must point deterministically to exactly one indisputable canonical answer. Subjective superlatives ("الأفضل", "الأجمل") are forbidden unless anchored to objective metrics.
10. **Zero Answer Leakage**:
    Absolute prohibition against prompts, clues, media, filenames, or option sets leaking or trivially hinting at the answer target.
11. **Natural Conversational Arabic Copy**:
    Use clean, natural, Saudi-friendly phrasing suited for spoken group play (e.g. `"وش اسمه الأول؟"` instead of verbose classical phrasing like `"ما هو الاسم الأول لهذا اللاعب؟"`).
12. **Defensible Answer Normalization**:
    Every question must provide a canonical answer plus all legitimate Arabic spellings, transliterations, and English variants in `acceptedAnswers`.

---

## 2. Decoupling Question Archetype from Difficulty

Archetype and difficulty are **separate axes**:
- The same question archetype can be authored across Easy, Medium, or Hard levels.
- What creates legitimate Hard difficulty:
  - **Deeper Domain Recall**: Requires specific, authentic knowledge of secondary characters, historical milestones, or advanced mechanics.
  - **High Plausible Alternatives**: Demands precision to distinguish between close canonical concepts.
  - **Reduced Clue Directness**: The prompt is tight and concise without gratuitous descriptive giveaways.
- What is **FORBIDDEN** as Hard difficulty:
  - Obscure developer trivia, release patch numbers, or background minutiae.
  - Vague, trick, or misleading syntax.
  - Unusably tiny or cropped images.

---

## 3. The 10 Question Quality Anti-Patterns

| Anti-Pattern ID | Name | Description & Violation |
| :--- | :--- | :--- |
| `ANTI_FACT_FIRST` | **Fact-First Trivia** | The agent finds an arbitrary fact in a wiki and wraps it mechanically in `"ما هو / من هو"`. |
| `ANTI_OBSCURE` | **Obscure-For-Obscure** | Creating artificial difficulty by asking for irrelevant minutiae (e.g. room numbers, shoe sizes, release dates of minor patches). |
| `ANTI_WIKIPEDIA` | **Wikipedia Sentence** | Dense, academic, or robotic encyclopedia prose that drains energy from the room. |
| `ANTI_LEAKAGE` | **Answer Leakage** | Prompt text, quote excerpts, or media assets that give away the answer to an attentive player without domain knowledge. |
| `ANTI_FAKE_DIFF` | **Fake Difficulty** | Making an easy fact artificially hard through convoluted syntax or microscopically tiny unreadable image crops. |
| `ANTI_SAME_SHAPE` | **Same Interaction, New Fact** | Authoring a batch of 15 questions that test different facts but feel identical in play (e.g. 15 consecutive "Who is this player?" questions). |
| `ANTI_HOST_AMBIG` | **Host-Dependent Ambiguity** | Questions where the answer is debatable or requires human referee interpretation. |
| `ANTI_OVER_SPEC` | **Over-Specified Clue** | Providing excessive overlapping clues that make the answer trivially obvious even to non-fans. |
| `ANTI_UNDER_SPEC` | **Under-Specified Clue** | A vague prompt where multiple different answers are equally defensible. |
| `ANTI_WALL_TEXT` | **Mobile Wall of Text** | Overly verbose prompts that force players to read multi-line paragraphs on their phones during high-pressure rounds. |

---

## 4. The 4 Canonical QA Gates (Playtest Lessons)

Every authored question must pass these four fundamental quality invariants before product review:

1. **Scope-Native Alignment**:
   The core fact and knowledge target must meaningfully belong to the selected Scope, not merely to the overarching World. (e.g. A generic club-career fact must not be placed in Champions League without a genuine Champions League connection; Arabic music collaborations must not be placed in Gulf Music).
2. **Unique-Answer Defensibility**:
   Every question must have exactly ONE indisputably correct answer. If a knowledgeable player could give another equally valid answer (e.g. under-specified nicknames or ambiguous title completions), the question must be rewritten or replaced. Never use `acceptedAnswers` to patch prompt ambiguity.
3. **Media Earns Its Place**:
   For `IMAGE` and `AUDIO` questions, the media asset must carry the primary cognitive challenge. If removing the media allows solving the question from text alone (e.g. giveaway nicknames or full descriptive clues in prompt), the prompt must be stripped of the giveaway. Media must never be decorative.
4. **Difficulty Trust**:
   For risk-choice mechanics (especially Marhala), difficulty labels must be genuinely calibrated. Hard must require deeper recognizable fandom recall, not obscure wiki minutiae or confusing wording. Evaluate comparatively (Easy vs Medium, Medium vs Hard) from the player's risk/reward perspective.

---

## 5. Media Pipeline Separation

- **Authoring Agent Responsibility**: Authors the game question, prompt copy, accepted answers, and precise structured `mediaIntent` (subject, asset type/excerpt, duration, and zero-leakage constraints).
- **Media Enrichment Service Responsibility**: Downstream media tools/Wigolo services retrieve, crop, normalize, and attach actual binary assets. Authoring agents never search external video/audio platforms or download media binaries directly.

---

## 6. Multimodal Question Craft & Media Integration

### 6.1 The 7-Step Multimodal Authoring Flow
1. **Identify the Franchise Gameplay Hook**: Anchor to core fan-shared memories, competitive cues, or sensory landmarks.
2. **Determine the Natural Modality**: Text, Image, or Audio based on what best expresses the interaction.
3. **Draft the Neutral Prompt**: Let the media carry the challenge without prompt spoilers.
4. **Define the Media Intent**: Specify asset requirements, timestamp/framing, and anti-leakage rules.
5. **Validate difficulty calibration**: Apply the `ICONIC ≠ HARD` rule and framing depth.
6. **Validate zero leakage**: Strictly enforce the `SELF_ANSWERING_MEDIA` blocking QA rule.
7. **Human game-feel review**: Verify emotional payoff, fairness, and recognizability.

---

### 6.2 Blocking QA Rule: `SELF_ANSWERING_MEDIA`
**BLOCKING QA FAILURE**: Media is invalid when the intended answer can be deterministically extracted from literal text or speech inside the media rather than recognized through domain gameplay knowledge.

- **Audio Semantic Leakage**:
  - ❌ **INVALID**: Audio literally speaks *"Enemy AC-130 above!"* for a question asking *"Which Killstreak is this?"* (Answer: AC-130).
  - ❌ **INVALID**: Audio literally speaks *"Friendly UAV is online"* for a question asking *"Which streak was activated?"* (Answer: UAV).
  - ❌ **INVALID**: Audio literally speaks *"Tactical Nuke incoming"* for a question asking *"What is this siren?"* (Answer: Tactical Nuke).
  - ✅ **VALID**: Distinctive AC-130 105mm/40mm heavy cannon firing sound signature with zero spoken name.
  - ✅ **VALID**: RC-XD electric motor revving & acceleration whine without speech.
  - ✅ **VALID**: Tactical Nuke pure klaxon alarm bursts with zero spoken announcer words.
  - ✅ **VALID**: Foreign-language hostile ultimate callouts (e.g. Sombra *"¡Apagando las luces!"*, Sigma *"Het universum zingt voor mij!"*) where the hero name is never spoken.

- **Visual Text Leakage**:
  - ❌ **INVALID**: A player card retaining the player's name bar when asking *"Who is this player?"*.
  - ❌ **INVALID**: A multiplayer map image containing large map name street signs or HUD banners.
  - ❌ **INVALID**: A promo event card retaining the written event title logo when asking *"What event is this?"*.
  - ✅ **VALID**: Player card with the name bar cleanly blanked using authentic blank-card composition.
  - ✅ **VALID**: Map landmark or objective area with signage cropped or absent.
  - ✅ **VALID**: Promo card design showcasing the unique border art/palette with event text stripped.

---

### 6.3 Difficulty Principle: `ICONIC ≠ HARD`
- An iconic or famous entity does **NOT** become Hard merely because it occupies a Hard slot in a batch (e.g. Nuketown, Shipment, CJ, basic ultimate lines are naturally Easy/Medium).
- Difficulty is determined by **THE EXACT INTERACTION + THE EXACT MEDIA FRAMING**:
  - **Easy**: Full, clean, unmistakable silhouette, standard Gold card (with nationality visible), or iconic broad vista.
  - **Medium**: Specific ability icon, mid-tier promo event, or core mechanical cue.
  - **Hard**: Partial crop of an iconic weapon receiver, secondary objective landmark, special/promo/icon card (with nationality hidden), or foreign hostile ultimate sound cue.

---

### 6.4 Franchise Media-Native Interaction Libraries

#### FIFA / EA FC (Target: ≥7/9 Image, FUT Player-Card Centric)
1. **Identify the Event**: Display authentic promo card art (TOTY, Future Stars, Shapeshifters, TOTS, FUT Birthday) with event name stripped $\rightarrow$ Prompt: `"وش اسم هذا الحدث؟"`.
2. **Identify the Player from Card**: Display real FUT card with name and portrait blanked out (stats, rating, position intact) $\rightarrow$ Prompt: `"مين هذا اللاعب؟"`.
3. **Guess the Missing Stat**: Display specific edition card with one key attribute hidden (`PAC = ?`) $\rightarrow$ Prompt: `"كم تقييم سرعة (Pace) مبابي في بطاقته الذهبية الأساسية والموضحة بـ (؟)؟"`.
4. **Identify the Missing PlayStyle**: Display authentic player card with target PlayStyle+ hidden as `?` $\rightarrow$ Prompt: `"وش الـPlayStyle+ الناقص؟"`.
5. **Historical Legacy FUT Cards**: Recognize classic overpowered or promo cards.

##### Permanent FIFA Authoring & QA Invariants:
- **`AUTHENTIC_BLANK_CARD_COMPOSITION`**: All FIFA player-card questions (`"مين هذا اللاعب؟"`) MUST use authentic blank-card composition. Never use blur, 2D inpainting, censor bars, silhouettes, striped fills, checkerboards, or obvious patches. Sourcing must use a matching clean blank-card shell from the same card family/edition/promo. If a matching authentic blank card cannot be sourced, reject the candidate.
- **`PLAYER_IDENTITY_MASKING_AND_DIFFICULTY`**:
  - Always hide: player portrait and player name.
  - **EASY / Base-Gold Cards**: Nationality flag STAYS VISIBLE. Overall rating, position, and all six face stats stay visible.
  - **HARD / Special-Promo-Icon-Hero Cards**: Portrait and name hidden; nationality and direct identity metadata may be hidden. Rating, position, and all six face stats stay visible.
  - **Visible Card Data Integrity**: Position (e.g. ST must not become CT), rating, and stats must remain 100% undamaged, correctly aligned, and authentic.
  - **Difficulty Calibration**: Masking quality never determines difficulty. Difficulty comes strictly from the card variant (Base/Gold $\rightarrow$ Easy; Special/Promo/Icon $\rightarrow$ Hard).
- **`EVENT_RECOGNITION_VISUAL_TRUTH`**: For FIFA promo event recognition questions (`"وش اسم هذا الحدث؟"`), the prompt must remain neutral and the media itself must carry the challenge. Use a real visual belonging to that exact promo event. `WRONG_EVENT_ASSET_IS_FATAL` — a mismatch between event visual and target event is a fatal defect.
- **`WRONG_ASSET_IS_FATAL`**: If the underlying media depicts a different player, event, weapon, map, vehicle, or location than the authored answer, the item is invalid and must be completely replaced.
- **`NO_FALSE_VISUAL_VERIFICATION`**: Never claim an item or media asset is visually verified based solely on file presence, dimensions, container headers, or assumed download IDs. Verification requires forensic inspection of the rendered pixels, text layers, and human product review.
- **`FUTURE_BATCH_HARD_GATE`**: A FIFA `PLAYER_FROM_CARD` item is incomplete unless it has: (1) authentic player-card factual reference, (2) matching authentic blank-card foundation, (3) final composed player-facing asset, (4) exact verified gameplay values, (5) no portrait, (6) no name, (7) difficulty calibrated by card variant, (8) final visual QA, (9) human product review.
- **`TARGET_ONLY_MASKING`**: Mask strictly and completely the tested field across its entire bounding area, ensuring zero residual characters or secondary answer leaks remain visible anywhere on the asset.
- **`CLEAN_CARD_CROP`**: All game assets must be cleanly cropped of web companion UI, external sidebars, tooltips, hover widgets, and synthetic overlays.

#### Call of Duty (Multiplayer-First: ≥70–80% MP)
1. **Weapon Profile / Cropped Receiver**: Identify weapon from clean silhouette/side profile.
2. **Map Landmark**: Identify map from recognizable combat zone/objective area without name signs.
3. **Perk / Killstreak Recognition**: Identify active multiplayer Perk icon or Killstreak symbol.
4. **Mastery Camo Progression**: Identify prestigious Mastery Camos (Damascus, Dark Matter, Orion).
5. **Non-Verbal Combat & Streak Audio**: Recognize non-spoken sound cues (Hitmarkers, RC-XD electric motor, Klaxon sirens, missile descent whistles).

#### Overwatch (Multimodal-First: Map / Hero / Ability / Ultimate Audio)
1. **Hero Recognition via Framing**: Partial armor, weapon, or signature pose crop.
2. **Map Recognition via Landmark**: Objective capture point or distinct architecture without wide postcard giveaways.
3. **Ability UI Recognition**: Distinct ability icon or visual deployment effect.
4. **Hostile Ultimate Sound Cues**: Foreign language callouts and mechanical audio charges that reward active competitive game sense.

#### GTA (Vehicle / Landmark / Character / SFX)
1. **Vehicle Silhouette**: Recognize iconic sports cars, helicopters, or hydras.
2. **Landmark / Casino**: Recognize distinct city landmarks or Las Venturas casinos.
3. **Gameplay Sound Effects**: Recognize authentic death cues (*Wasted* SFX) or mission markers.

---

### 6.5 Sourcing & Modality Policy
- **Wigolo MCP Integration**: When authentic media discovery or extraction cannot be performed reliably through basic paths, use Wigolo MCP (`search`, `fetch`, `research`, `extract`) to source verified canonical in-game audio/visual material.
- **No Rigid Global Ratio**: Modality mix is driven by the franchise's real gameplay DNA (e.g. FIFA is heavily visual/card-centric, Overwatch is balanced audio-visual, text is used when gameplay systems are genuinely best expressed in text). Every batch must maintain meaningful modality diversity.

