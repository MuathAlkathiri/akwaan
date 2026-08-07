# Call of Duty Subject Skill

Parent Catalog: `SKILL.md`  
Canonical Subject: `Call of Duty`  
Identity: primarily Multiplayer recognition through maps, weapons, streaks,
equipment, modes, HUD/UI, and distinctive audio. Campaign and Zombies are
strong secondary experiences, never the default center of a general batch.

## allowedQuestionPatterns

This Subject narrows the Gaming Catalog to:

- `MAP_RECOGNITION`
- `WEAPON_RECOGNITION`
- `KILLSTREAK_RECOGNITION`
- `SCORESTREAK_RECOGNITION`
- `GAME_IDENTIFICATION`
- `SOUND_RECOGNITION`
- `VOICE_RECOGNITION`
- `HUD_RECOGNITION`
- `UI_RECOGNITION`
- `PERK_RECOGNITION`
- `EQUIPMENT_RECOGNITION`
- `ICON_RECOGNITION`
- `GAME_MODE_RECOGNITION`
- `MISSION_RECOGNITION`
- `OBJECTIVE_RECALL`
- `WHAT_HAPPENED_NEXT`
- `WHAT_HAPPENED_BEFORE`
- `WHO_DID`
- `COMPLETE_QUOTE`
- `DIALOGUE`
- `EVENT`
- `LOCATION_RECOGNITION`
- `ORGANIZATION`
- `CHARACTER_IDENTIFICATION`
- `WHY_DID`

Historical labels normalize to canonical behavior: Action Attribution →
`WHO_DID`; Quote Attribution → `DIALOGUE`; Dialogue Completion →
`COMPLETE_QUOTE`; Event Recall → `EVENT`; Faction Recognition →
`ORGANIZATION`. Campaign/Zombies prefixes are mode qualifiers, not new Pattern
IDs: for example Zombies Map Recognition is `MAP_RECOGNITION` with mode
`Zombies`, and Campaign Mission Recognition is `MISSION_RECOGNITION` with mode
`Campaign`.

## Mode Gate

Apply during planning and again to the final batch:

- Multiplayer target: 85–100%; it includes standard Multiplayer and may include
  Warzone only when the planned question is explicitly tagged `Warzone`.
- Campaign + Zombies combined: 0–15%, optional and never required.
- 6 questions: normally 6 Multiplayer; at most one Campaign or Zombies.
- 10 questions: 9–10 Multiplayer; at most one combined Campaign/Zombies slot so
  the hard 15% cap is preserved. Never round the cap upward to two slots.
- 20 questions: at least 17 Multiplayer; Campaign + Zombies combined at most 3.

Report actual Multiplayer, Campaign, Zombies, and Warzone counts/percentages.
Treat title, era/subseries, gameplay mode, Content Pattern, and Gameplay
Pattern as separate dimensions.

## Title Integrity and Community Aliases

Every fact and Asset must be bound internally to an official title/version
before wording. Never move a map, weapon, streak, HUD, mission, Zombies map, or
mechanic across titles because it appears elsewhere in the franchise. Validate
remasters, remakes, ports, and Warzone integrations explicitly.

Supported community-number aliases are a controlled wording layer, not factual
keys. These mappings are locked for this Subject and must be rechecked against
the title chronology/evidence when used:

| Official title | Common short title | Common Arabic title | Verified community number | Accepted aliases |
|---|---|---|---|---|
| Call of Duty 4: Modern Warfare | COD4 / Modern Warfare | مودرن وورفير | كود 4 | COD4, MW (2007) |
| Call of Duty: World at War | World at War / WaW | ورلد أت وور | كود 5 | WaW |
| Call of Duty: Modern Warfare 2 (2009) | MW2 | مودرن وورفير 2 | كود 6 | MW2, Modern Warfare 2 |
| Call of Duty: Black Ops | Black Ops / BO1 | بلاك أوبس | كود 7 | BO1, Black Ops 1 |
| Call of Duty: Modern Warfare 3 (2011) | MW3 | مودرن وورفير 3 | كود 8 | MW3 |
| Call of Duty: Black Ops II | Black Ops 2 / BO2 | بلاك أوبس 2 | كود 9 | BO2, Black Ops II, Black Ops 2 |

For every other title, use the official title or an unambiguous common short
title unless a mapping is explicitly verified and added here. Never guess a
number. If community usage varies, record the ambiguity and omit the number.
Do not include a game title/number when it exposes the answer or conflicts with
official naming.

## Content and Gameplay Priorities

Multiplayer: maps, weapons, killstreaks/scorestreaks, hitmarkers, announcers,
HUD/UI, perks, equipment, modes/objectives, lobby/menu sounds, and memorable
match states. Map frames need distinctive layout/landmarks; weapon frames must
not show the name. Streak audio must be distinctive and must not speak the full
answer. Game identification requires title-distinguishing evidence, never
generic gunfire or shared franchise visuals.

Campaign (inside the combined cap): famous missions, betrayals, major events,
explicit motivations, objectives, distinctive locations, dialogue/voice,
action attribution, and bounded before/next clips. Avoid generic character
portraits, actors, release dates, minor lore, or visible mission titles.

Zombies (inside the combined cap): maps, perks, Wonder Weapons, round cues,
character voices, Pack-a-Punch, Mystery Box, power activation, iconic objects,
locations, and mechanics. Avoid obscure Easter-egg steps except fair Hard
questions. A future dedicated Zombies Subject may override this cap.

Direct character naming is rare because this Subject's identity is gameplay.
Prefer voice, quote, campaign event, action, or sequence. Reject promotional
portraits of Price, Ghost, Soap, or other central characters used only to ask a
name. Reject developer/publisher/actor/release/sales/award trivia by default.

## Accessibility and recognition calibration

Call of Duty content has no Easy/Medium/Hard or 200/400/600 field. Calibrate each
ContentItem by player familiarity, recognition saturation, media clarity, number
of reasoning steps, and fairness under the mechanic timer.

- Familiar content should still require a brief recall moment rather than being an instant logo/name giveaway.
- Regular-player content may use recognizable weapons, perks, maps, modes, HUD elements, and match situations.
- Dedicated-player content may use fair audio/title identification, less common but memorable events, or multi-step recognition.

Never use blur, tiny crops, guessed community values, version ambiguity, or obscure
production facts to manufacture challenge.

## Recognition Saturation

The CoD community has always-on memory for the franchise's most famous maps
(`Rust`, `Nuketown`, `Shipment`, `Terminal`, `Firing Range`), weapons (`MP5`,
`ACR`, `Intervention`), streaks, perks, and sounds; nearly any casual CoD
player identifies them instantly from a single distinctive frame or clip.
Direct identification of a Recognition-Saturated item is trivially easy and
unfair (`QUESTION_TOO_OBVIOUS`, `UNFAIR_DIFFICULTY`).

- Do not use famous top-recognition direct IDs as Easy answers.
- Cap famous direct-recognition items per batch regardless of the 3/20
  answer-class ceiling.
- When a famous item is needed, require a recalled observation (a distinctive
  corner or landmark, a specific behavior, a weapon's reload or sound) instead
  of "what is this famous thing".
- Source: 3 rejection records (2026-08-01: Rust, Nuketown, Shipment).

## Community Memory and Player-Memory-First Selection

CoD is replayed, montaged, and discussed endlessly; community recognition runs
ahead of general gaming knowledge. Run the Community Memory test on every
direct-recognition question before finalizing: "would most casual CoD players
answer this instantly from the Media alone?" If yes, it is
Recognition-Saturated — replace it.

Select answers from Player Memory, not from the Asset's obviousness: choose
items a player remembers *using* (a specific corner they fought over, a
distinctive reload or sound, a niche perk or equipment use) rather than items
identified because the image itself is iconic. The Asset must stay essential —
the question must recall, not merely show.

## Media Profile and Search

Planning target: Image 40%, Audio 30%, Video 20%, Text 10%. Adjust for real
availability, learned preferences, and health, but never add decorative or weak
audio to hit a percentage. Multiplayer should dominate every channel.

Strong query forms:

- `Call of Duty Black Ops 2 Raid map gameplay screenshot`
- `Modern Warfare 2 UMP45 first person gameplay screenshot`
- `Black Ops Galil weapon gameplay frame`
- `Call of Duty Firing Range map screenshot no HUD text`
- `Modern Warfare 2 Harrier Strike killstreak sound`
- `Black Ops 2 multiplayer hitmarker sound`
- `Call of Duty Black Ops 2 lobby sound`
- `MW2 announcer enemy UAV audio`
- `Call of Duty map gameplay short clip`
- `Modern Warfare 2 Campaign mission official clip`
- `Black Ops Zombies perk gameplay clip`

Add negative terms: `fan edit`, `montage`, `reaction`, `meme`, `TikTok`,
`Shorts`, `compilation`, `remastered music`, `cover`, `fake`, `mod`, and
`custom map`, unless explicitly required. Prefer clean first-person gameplay,
in-game spectator frames, official gameplay stills, original gameplay clips,
and original/extracted sounds. Reject wrong-title media, answer-text
thumbnails, collages, watermarked edits, fan art, modified weapon skins,
custom maps presented as official, remixes/covers, noisy captures, commentary,
and promotional art that trivializes the answer. A remote URL is never a
completed Asset: download, open, inspect, and validate the local file.

## Rotation and Batch Diversity

Extend the Coverage Ledger per slot with official game title, era/subseries,
mode, map, weapon, streak, perk, equipment, mission, Zombies map, Event Cluster,
Gameplay Pattern, and answer aliases. For 10 questions, normally use an exact
game no more than twice; never repeat the same map, weapon, streak, mission, or
Zombies map. For 20, use broad title coverage; more than two slots from one
title requires a report reason. Do not force weak titles merely for equality.

For a standard 10-question batch: maximum 2 direct map recognition, 2 direct
weapon recognition, 2 direct sound/game identification, and 1 direct character
identification; include at least 4 gameplay experiences when suitable. For 20,
no more than 3 direct recognition questions of one answer class when diversity
allows. Avoid consecutive weapons from one title, repeated sounds from one
game, Raid/Firing Range saturation, and Black Ops 2 dominance. Pattern,
gameplay, title, mode, and Media distributions all require independent review.

## Accepted Answers

Accept the official English name, verified abbreviation, common Arabic
transliteration, verified community alias, and minor spelling variants. Do not
accept a title for a weapon, a weapon class for a specific weapon, or a broad
related concept. Canonical spellings remain exact.

- `UMP-45`: UMP-45, UMP45, يو إم بي 45, يو ام بي 45.
- `Harrier Strike`: Harrier Strike, هارير سترايك. Never canonicalize the typo
  `Harrier Stike`.

## Subject Validation and Health

Reject wrong-title maps/weapons/streaks/HUD/missions, generic audio, non-unique
HUD, visible answers, decorative Media, guessed numbering, modified/custom
content presented as canonical, bad aliases, challenge manufactured by poor asset quality,
production trivia, missing/unopenable local Assets, secondary modes above 15%,
unjustified title dominance, or monotonous gameplay.

For Perk Recognition, require a dominant close-up icon, a readable selection
screen with the target visually dominant, or a uniquely identifying in-game
effect. For Equipment Recognition, require the actual device clearly in hand,
placed in-world, close-up, or visibly used. Tiny HUD icons, ordinary combat
screenshots, and frames from a match where the item was merely equipped fail the
global Blind Asset Test with `INSUFFICIENT_ASSET_EVIDENCE`.

Health may track only observed values: mode percentages; title distribution;
map/weapon/sound percentages; Gameplay Pattern distribution; wrong-title
failures; community-number ambiguity; average Asset score by mode; approved and
rejected gameplay experiences; and overrepresented titles. Preserve global
learning, rejection/success memory, Search/Asset Cache, and Catalog/Subject
health behavior. Do not create baseline metrics before a real batch or review.

## Seed Examples (Guidance, Not Generated Output)

1. Easy/image: `ما اسم هذا الماب؟` → `Raid`.
2. Easy/image: `ما اسم هذا الماب؟` → `Firing Range`.
3. Medium/image: `من كود 6، ما اسم هذا السلاح؟` → `UMP-45`; internally bind
   Call of Duty: Modern Warfare 2 (2009).
4. Medium/image: `من كود 7، ما اسم هذا السلاح؟` → `Galil`; internally bind Call
   of Duty: Black Ops.
5. Hard/audio: `من كود 6، ما اسم هذا الكيلستريك؟` → `Harrier Strike`.
6. Hard/audio: `هذا الصوت من أي جزء؟` → `Black Ops 2`; accepted contextual
   alias `كود 9`.

These work because Media is essential, the memory is player-facing and familiar
but not always immediate, and the answers represent maps, weapons, streaks, and
sounds rather than production trivia. Each still requires title-correct factual
and Asset verification when actually generated. The famous-map Easy examples
(1-2) are concepts only: `Raid` and `Firing Range` are borderline
Recognition-Saturated and must pass the Community Memory test before use.

## Non-Generating Acceptance Plan: 20 Questions

Reserve 17 Multiplayer slots and at most 3 combined Campaign/Zombies slots;
Campaign/Zombies may be zero. Plan 8 image, 6 audio, 4 video, and 2 text intents
as the initial 40/30/20/10 target. Rotate multiple titles/eras and consider maps,
weapons, sounds, HUD/UI, streaks, equipment/perks, modes/objectives, and events.
Cap any direct answer class at 3 when eligible variety exists. Every Media slot
must include a local-download/openability requirement. Before drafting, verify
official title bindings and omit unverified community numbers. The report must
show Pattern, Gameplay Pattern, title, mode, and Media distributions plus any
availability-driven deviation. This is a planning test only: it creates no
questions, Assets, cache records, or health metrics.
