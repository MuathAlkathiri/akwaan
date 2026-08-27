---
name: akwaan-content
description: >-
  Master workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow

## 0. Canonical Authoring Principle

> **"Never begin by asking what trivia facts can I write.**
> **Begin by asking what interaction/question shape would be fun to play.**
> **Then find a recognizable, fair fact that fits that shape."**

Akwaan is a multiplayer party game. Content exists to create active gameplay moments: rapid recognition, suspense, bluffing, cooperation, lively team debate, and memorable reveals. A question that is merely an encyclopedia fact wrapped in `"ما هو / من هو"` is a failure of question craft.

---

## 1. Mandatory 7-Step Authoring Flow

Every authoring task must progress through this sequential 7-step pipeline:

```text
1. GLOBAL QUESTION CRAFT (ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md)
   ↓ Apply 12 pillars of question craft, anti-pattern gates, natural Arabic copy
2. QUESTION ARCHETYPE SELECTION (ai/.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md)
   ↓ Choose an engaging play shape from the 20 canonical archetypes (NAME_FRAGMENT, REVERSE_QUESTION, CAREER_PATH, etc.)
3. WORLD GUIDANCE (ai/.opencode/skills/worlds/<world>/WORLD.md)
   ↓ Consult the World Question Palette and rotate across content dimensions
4. SCOPE & KNOWLEDGE GUIDANCE (ai/.opencode/skills/worlds/<world>/scopes/<scope>/KNOWLEDGE.md)
   ↓ Ground in authentic, durable canonical lore and respect scope boundaries
5. MECHANIC COMPATIBILITY (ai/.opencode/knowledge/architecture/MECHANIC-COMPATIBILITY.md)
   ↓ Enforce exact mechanic contract (Bomb, Combo, Marhala, RYO, Closest, One Clue, Top-5, Distributed Info)
6. BATCH VARIETY REVIEW (ai/.opencode/knowledge/architecture/BATCH-VARIETY.md)
   ↓ Ensure max archetype share <= 35%, entity type rotation, and varied prompt openings
7. FACT, ANSWER & ZERO LEAKAGE QA (.agents/skills/akwaan-content-qa/SKILL.md)
   ↓ Validate 100% factual accuracy, comprehensive accepted answers, and zero prompt leaks
```

---

## 2. Authoring-Side Metadata Specification

Newly authored Question Craft items must carry lightweight authoring metadata in their source artifact:

```json
{
  "id": "item-id",
  "prompt": { "ar": "..." },
  "authoring": {
    "questionArchetype": "NAME_FRAGMENT",
    "contentDimension": "players"
  }
}
```

- **`authoring.questionArchetype`**: Must be one of the 20 canonical archetypes in `QUESTION-ARCHETYPES.md`. Used for batch variety and diversity auditing.
- **`authoring.contentDimension`** (Optional): Category tag (e.g. `players`, `stadiums`, `weapons`, `lore`) to assist in entity spread auditing.
- **Runtime Note**: Authoring metadata lives in source JSON review artifacts; it is **not** required to mutate production runtime schemas and is stripped/ignored during DB promotion.

---

## 3. Decoupling Archetype from Difficulty

Archetype and difficulty are **separate axes**:
- A mechanic stage or tier specifies the **required cognitive depth**, not a required archetype shape.
- **Combo**: Stage 1 to Stage 4 represents increasing difficulty ($S1 < S2 < S3 < S4$), with each stage allowing a diverse palette of compatible archetypes across the run.
- **Marhala**: Easy (1–2 tiles), Medium (2–4 tiles), and Hard (4–6 tiles) represent risk/movement tiers:
  - *Hard standard*: Requires deeper but still meaningful and recognizable domain recall. Never create Hard difficulty from irrelevant minutiae or obscure trivia.

---

## 4. Zero Answer Leakage Invariant (Strict Gate)

A question must **NEVER leak its own answer**:
1. **No Explicit or Near-Verbatim Leaks**: Target name, entity, or synonym must never appear in the prompt text.
2. **No Quote Leaks**: Never include a famous quote if the answer is contained within that quote.
3. **No Embedded Formulas**: Never include arithmetic that trivially calculates the answer.
4. **Bomb Visual Purity**: Character/image prompts must be neutral (`"من هذه الشخصية؟"` / `"ما اسم هذا الملعب؟"`), never describing powers, titles, or lore in text.
5. **RYO Stem Isolation**: Never state the correct option text in the prompt stem.
6. **Core Leakage Test**: *If a player does not know the fact, but can deduce the answer from prompt wording alone, the item FAILS.*

---

## 5. Active Mechanic Contracts

- **Bomb (`bomb`)**: Rapid-fire item loop under a continuous clock. Supports `none` (text-only prompt), `image` (1 asset with valid URL), or `audio` (1 asset with valid URL). Rapid prompt (recommended <70 chars), `mode: 'match'`, 1–10 accepted answers (≤120 chars).
- **Combo (`combo`)**: 4 monotonic difficulty stages (`comboStage: 1|2|3|4`), `mode: 'match'`, accepted answers.
- **Marhala (`marhala`)**: Exact 3/3/3 split (Easy / Medium / Hard), `mode: 'match'`.
- **One Clue (`one-clue`)**: Exactly 5 progressive clues ($C1 < C2 < C3 < C4 < C5$), `mode: 'match'`.
- **RYO (`read-your-opponent`)**: 3 items per challenge, `mode: 'ryo'` with either `options: [{ id, text }]` + `correctOptionId` or numeric estimate `correctValue` + optional `acceptedTolerance`.
- **Closest (`closest`)**: `mode: 'closest'` with numeric `correctValue`.
- **Top 5 (`top-5`)**: 10-card deck (5 real ranks, 5 plausible traps) in top-5 payload format.
- **Distributed Information (`distributed-information`)**: 3 shared puzzles, team instruction + 2 secret complementary fragments.

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

