# Entity Rotation and Coverage Ledger

The Coverage Ledger is internal batch-planning metadata. It does not add fields
to the project's question output schema.

## Track Per Planned or Approved Question

- canonical Question Pattern and Gameplay Pattern;
- Primary Focus and focus type;
- context entities separately;
- normalized answer and aliases;
- event and Event Cluster;
- arc, season, timeline, war, tournament, or equivalent story stage;
- location, object, weapon, organization/team, and ability when relevant;
- Media type and Asset identity.
- for gaming Subjects: official game title/version, era/subseries, gameplay
  mode, map/level, mission, streak, perk/equipment, and mode-specific location.

Normalize aliases before counting. `Naruto`, `Naruto Uzumaki`, and `Seventh
Hokage` are one answer when they refer to the same entity.

## Rotation Rules

- The same Primary Focus should normally not appear in consecutive questions.
- In a 10-question batch, one character should normally be Primary Focus once.
  A second use requires a different Pattern, Event Cluster, and gameplay
  experience, plus a recorded justification.
- Apply stricter rotation to protagonists and highly saturated characters.
- Context mentions do not consume Primary Focus coverage.
- Rotate Event Clusters; several questions from one battle remain repetitive
  even when Pattern or answer changes.
- Distribute suitable questions across arcs, seasons, wars, tournaments, or
  timeline stages rather than concentrating on the most famous one.
- Rotate answers, locations, objects, weapons, organizations, abilities, Media,
  Question Patterns, and Gameplay Patterns.

These are planning constraints, not permission to invent weak content. A
documented exception is allowed when the Subject lacks sufficient eligible
coverage, but it must still pass duplicate and diversity validation.

## Slot-by-Slot Use

1. Load cumulative health and the current batch ledger.
2. Choose an underrepresented allowed Question Pattern and Gameplay Pattern.
3. Find underrepresented eligible entities/events that support the Pattern.
4. Select the best Primary Focus and record context separately.
5. Reject saturated Event Clusters, answers, or focus entities unless a valid
   exception exists.
6. Acquire Media and validate the question.
7. Add only an approved candidate to committed coverage; keep rejected
   candidates in metrics without consuming final coverage.
8. Repeat for the next slot and audit final distribution.

## naruto_batch6 (2026-07-31)

Committed coverage for `output/naruto_batch6.json` (20 questions).

- **Counts**: easy 7 / medium 10 / hard 3; image 5 / video 3 / audio 2 / text 10.
  Direct Character Identification = 3 (Shikamaru, Tsunade, Zabuza quote) = cap.
- **Difficulty deviation**: plan was 5/12/3; final 7/10/3 (two extra easy image IDs,
  two fewer medium) — documented availability-driven change.
- **Answers**: Byakugan, Shikamaru, Tsunade, Evening Elephant, Mount Myoboku,
  Tengai Shinsei, Ice Mirrors, Zabuza, Rasenshuriken, Sadness and Sorrow,
  Hashirama, Team 10, ANBU, Gaara, Uzumaki, Sasuke's revenge motive, Five Kage
  Summit, Shukaku, Shannaro, forehead poke.
- **Event clusters**: Chunin-era (Byakugan, Team 10, Shannaro), Land of Waves
  (Ice Mirrors, Zabuza quote), Part 2 (Rasenshuriken, ANBU, Sasuke motive),
  War arc (Tengai Shinsei, Five Kage Summit, Guy vs Madara), backstory/family
  (Hashirama, Uzumaki clan, Shukaku, forehead poke).
- **Notable rotations**: no answer or event repeated inside the batch; Land of
  Waves has two questions with distinct observations (technique vs character
  moment); Zabuza arc also appears in batch5 (sword) but as a different answer.
- **Rejected during planning**: Killer Bee rap audio (would have pushed Direct
  Character ID to 4/20, over the cap); replaced with Sadness and Sorrow BGM.
- **Assets**: all in `output/naruto_batch6/{images,video,audio}`; every relative
  path resolves; verified via ffprobe, subtitle cues (Zabuza), and EBU R128
  loudness analysis (Meteors, Bee replacement not used); visual spot-check by a
  human still pending.

## call-of-duty-batch1 (2026-08-01)

Committed coverage for `output/call-of-duty-batch1.json` (20 questions).
Subject: Call of Duty; Catalog: Gaming. Output schema and 200/400/600 points
preserved from the project model.

### Generation Report

- **Difficulty**: easy 5 / medium 12 / hard 3 (1000 + 4800 + 1800 = 7600 pts);
  plan 5/12/3, no deviation.
- **Media**: image 8 / audio 6 / video 4 / text 2 — exactly the 40/30/20/10
  Subject planning target. Every Media slot required a local-download and
  openability check.
- **Modes**: Multiplayer 17/20 (85%), Campaign 1/20 (5%, Q17 All Ghillied Up),
  Zombies 2/20 (10%, Q11 Mystery Box, Q14 Richtofen). Combined Campaign+Zombies
  = 3/20 = 15%, at cap; ≥17 Multiplayer satisfied (17).
- **Direct Character Identification**: 1/20 (Q14 Richtofen via voice) ≤
  floor(20×0.15) = 3.
- **Question Patterns**: MAP_RECOGNITION 3 (Q01-Q03), WEAPON_RECOGNITION 3
  (Q04-Q06), PERK_RECOGNITION 1 (Q07), EQUIPMENT_RECOGNITION 1 (Q08),
  SOUND_RECOGNITION 5 (Q09-Q13), VOICE_RECOGNITION 1 (Q14),
  GAME_MODE_RECOGNITION 2 (Q15-Q16), MISSION_RECOGNITION 1 (Q17),
  GAME_IDENTIFICATION 1 (Q18, via title-distinctive scorestreak UI),
  OBJECTIVE_RECALL 1 (Q19), KNOWLEDGE 1 (Q20). All from the Subject allowlist.
- **Gameplay Patterns**: 3× visual map identification, 3× visual weapon
  identification, 1× perk icon, 1× equipment placement, 5× audio
  identification (UI hitmarker, MW2 streaks ×2, Zombies object, Zombies voice),
  2× mode-from-gameplay, 1× mission-from-gameplay, 1× title-from-UI, 1× number
  recall, 1× equipment-function recall.
- **Titles**: CoD4 (Q03 Shipment, Q05 M16, Q07 Juggernaut, Q17 mission) = 4;
  MW2 (Q01 Rust, Q04 MP5, Q06 Intervention, Q08 Claymore, Q10 Harrier,
  Q12 Sentry, Q20 Tactical Insertion) = 7; BO1 (Q11 Mystery Box, Q13 Attack
  Dogs, Q14 Richtofen) = 3; MW3 (Q15 Kill Confirmed, Q19 +100) = 2; BO2
  (Q02 Nuketown, Q09 Hitmarker, Q16 Hardpoint, Q18 scorestreak UI) = 4.
- **MW2 dominance (7/20)**: documented reason — MW2 is the franchise's most
  recognizable Multiplayer era and supplies most of the Subject's model answers
  (Harrier Strike audio, UMP-45-class weapons); its slots span distinct
  Patterns (maps ×1, weapons ×2, streak audio ×2, equipment, equipment-recall)
  and distinct gameplay; the remaining 13 slots cover CoD4/BO1/BO2/MW3. No
  title below cap except WaW (0 slots; no suitable asset was stronger than
  selected BO1/MW3 options).
- **Answer-class ceilings (≤3/20)**: maps 3, weapons 3, streaks 3 (Harrier,
  Sentry, Dogs), modes 2, equipment 2, sounds/objects 2, characters 1,
  titles 1, missions 1, perks 1, numbers 1. No class exceeds 3.
- **Rotation**: no answer repeated; Kill Confirmed appears as answer (Q15) and
  as context (Q19) with distinct observations (mode recognition vs point-value
  recall) — documented as ACCEPTABLE_REUSE; MW2 and BO1 each carry two streak
  sounds with distinct answers; no consecutive same-Primary-Focus adjacency.
- **Rejected during planning**: MW2 Tactical Insertion spawn-beep audio
  (9VQdxTUybcQ — no clean tonal pattern in 1.8 kHz bandpass scan); WaW dogs
  clip (0t8PlT38o8E — noisy capture). Juggernaut-perk and Nuketown/sign image
  text-leakage risk managed by frame selection + entropy picking, pending human
  spot-check.
- **Learned-rule/rejection memory**: no applicable active CoD rejection rules
  (rejection history is Naruto-scoped); no preference boosts applied beyond
  Subject defaults. Health-informed deviation: none.
- **Assets**: all in `output/call-of-duty-batch1/{images,audio,video}`; every
  relative path resolves; audio verified via EBU R128 (-13.4 to -19.2 LUFS) and
  spectral checks; videos verified via ffprobe (h264/aac, 15-35 s) and scene
  detection; image frames picked by maximum-entropy heuristic from
  tightly-titled gameplay sources. Human visual spot-check still pending for:
  Q02 Nuketown (in-map NUKETOWN sign), Q07 Juggernaut perk icon (name text
  risk), Q17 ghillie mission (HUD objective text), Q18 scorestreak UI (game
  logo text), and weapon frames (pick-up/killfeed text).

### Review Outcomes (2026-08-01)

Human review produced the records below; they were merged around a parallel
session that repaired the Q07/Q08 Assets. Reviewed: Q01-Q03, Q07-Q08, Q11, Q16
(7/20). Approved 1, question-level rejected 4, Asset-level rejected 3
(2 repaired, 1 pending replacement).

- **Rejected — Recognition Saturation (subject)**: Q01 Rust, Q02 Nuketown,
  Q03 Shipment famous-map direct IDs (`QUESTION_TOO_OBVIOUS`,
  `RECOGNITION_SATURATION`, `UNFAIR_DIFFICULTY`). Arabic feedback:
  "أشهر المابات طالعة سهلة جدًا."
- **Rejected — announcer leakage (global + asset)**: Q16 Hardpoint clip
  `q16_hardpoint.mp4` (JCBSBMpCUFA 8-43s) — the announcer speaks the answer
  (`AUDIO_ANSWER_LEAKAGE`, `ANSWER_LEAKAGE`, `INVALID_MEDIA_SEGMENT`). Arabic
  feedback: "المعلق يقول اسم هاردبوينت في بداية المقطع." Repaired on 2026-08-01
  (see "Asset-evidence repair review").
- **Rejected (Asset), then repaired by parallel session**: Q07 Juggernaut
  original frame and Q08 Claymore original killcam failed the Blind Asset Test
  (`INSUFFICIENT_ASSET_EVIDENCE`, `TARGET_NOT_VISIBLE` /
  `TARGET_NOT_VISUALLY_DOMINANT`, `AMBIGUOUS_ASSET`). Arabic feedback:
  "صورة البيرك لا توضح البيرك المطلوب." and "صورة الكلايمور لا تظهر الأداة أصلًا."
  Repaired frames `q07_juggernaut_repaired.png` / `q08_claymore_repaired.png`
  pass and are referenced by the batch JSON.
- **Approved**: Q11 Mystery Box sound (audio, Zombies object) — concept
  approved (`GOOD_AUDIO_RECOGNITION`, `STRONG_MEDIA_DEPENDENCY`,
  `GOOD_OBJECT_QUESTION`); difficulty corrected medium → Easy
  (`DIFFICULTY_MISCLASSIFIED`). Arabic feedback: "سؤال الصندوق الغامض جميل
  لكنه سهل."
- **Non-destructive audit warnings (no permanent memory)**: Q04 MP5 and Q05 M16
  are famous-weapon direct IDs — borderline Recognition-Saturated, watch on
  reuse; Q06 Intervention frame may not show the weapon body (target-visibility
  risk); Q15 Kill Confirmed clip may carry announcer/HUD mode text; Q17 ghillie
  and Q18 scorestreak clips may carry mission/HUD/game-logo text; Q20
  Tactical Insertion is a function-definition question (semantic-leakage
  borderline). All require spot-check confirmation, none became learned rules.
- **OCR verification (macOS Vision)**: Q16 Hardpoint HUD displays `Hardpoint:`
  text at 10s and 30s, confirming the segment leaks the answer both on-screen
  and (per review) via the announcer — irreparably invalid without re-clipping.
  Q15, Q17, Q18 sampled frames show no answer text (Q18 has no game logo text).
  Repaired Q07 frame is text-free; repaired Q08 frame shows only the device's
  real-world `M18A1` marking, never the word "Claymore". Q06 frame is a
  killfeed-heavy wide gameplay view; whether the weapon body is visible needs a
  human look.
- **Learned**: new global codes (INSUFFICIENT_ASSET_EVIDENCE, TARGET_NOT_VISIBLE,
  TARGET_NOT_VISUALLY_DOMINANT, AUDIO_ANSWER_LEAKAGE, INVALID_MEDIA_SEGMENT,
  RECOGNITION_SATURATION, DIFFICULTY_MISCLASSIFIED), Blind Asset Test made
  mandatory across Media designers and the validator, and CoD-subject rules for
  Recognition Saturation / Community Memory / Player-Memory-First Selection.

## call-of-duty-batch2 (2026-08-01)

Committed coverage for `output/call-of-duty-batch2.json` (15 questions).
Subject: Call of Duty; Catalog: Gaming. Output schema preserved from batch1.

### Generation Report

- **Difficulty**: easy 4 / medium 8 / hard 3; plan 4/8/3, no deviation. Easy =
  Castle (image), Lobby (audio), Pack-a-Punch (audio), Sleight of Hand (text).
- **Media**: image 5 / audio 5 / video 3 / text 2 — deviation from the nominal
  40/30/20/10 split documented: the planned 6th image (Sleight of Hand) had no
  suitable frame, so the text slot grew by one and the image slot dropped by one
  (5/5/3/2). Bouncing Betty was dropped during planning (unverifiable target
  visibility, consistent with the batch1 equipment/perk
  `TARGET_NOT_VISIBLE` rejections).
- **Modes**: Multiplayer 13/15 (87%), Zombies 2/15 (13%, Pack-a-Punch, Nacht);
  no Campaign. Combined non-MP 2/15 = 13%, under the cap.
- **Direct Character Identification**: 0/15 ≤ floor(15×0.15) = 2.
- **Question Patterns**: MAP_RECOGNITION 3 (Castle, Array, Interchange),
  WEAPON_RECOGNITION 2 (STG-44, Galil), SOUND_RECOGNITION 5 (lobby music,
  Airstrike, M1 Garand ping, RC-XD, Pack-a-Punch), GAME_MODE_RECOGNITION 1
  (Search & Destroy), KILLSTREAK_RECOGNITION 1 (Predator Missile, video),
  GAME_FEATURE_RECOGNITION 1 (Final Killcam, video), PERK_RECOGNITION 1
  (Sleight of Hand function recall, text), KNOWLEDGE 1 (Nacht der Untoten).
- **Gameplay Patterns**: 3× visual map identification, 2× visual weapon
  identification, 5× audio identification (music, 2× streak SFX, weapon sound,
  Zombies object), 1× mode-from-gameplay, 1× streak-from-gameplay,
  1× feature-from-gameplay, 1× perk-function recall, 1× knowledge recall.
- **Titles**: CoD4 (Lobby, Airstrike, Sleight of Hand) = 3; WaW (Castle,
  STG-44, Garand, Pack-a-Punch, Nacht) = 5; MW2 (Predator Missile, Final
  Killcam) = 2; BO1 (Array, Galil, RC-XD) = 3; MW3 (Interchange, S&D) = 2.
  Deliberately reduced MW2 (7/20 in batch1 → 2/15) and raised WaW (0 → 5) per
  the batch1 health recommendation; no title dominates.
- **Answer classes (≤3 each)**: maps 3 (Castle, Array, Interchange),
  weapons 3 (STG-44, Galil, Garand), streaks 3 (Airstrike, RC-XD, Predator),
  modes 2 (S&D, Final Killcam), Zombies objects 1 (Pack-a-Punch),
  Zombies maps 1 (Nacht), perks 1 (Sleight), music 1 (Lobby). No class >3.
  No answer overlaps batch1 (which answered Rust, Nuketown, Shipment, MP5,
  M16, Intervention, Juggernaut, Claymore, Hitmarker, Harrier, Mystery Box,
  Sentry Gun, Attack Dogs, Richtofen, Kill Confirmed, Hardpoint, All Ghillied
  Up, BO2, +100, Tactical Insertion).
- **Recognition-saturation compliance**: batch2 avoids the saturated top-4 maps
  (Rust/Nuketown/Shipment/Terminal) entirely; famous items (STG-44, Galil,
  Garand ping, Airstrike, RC-XD, PAP, Lobby) are all Medium except Castle /
  Lobby / PAP / Sleight at Easy, each requiring a recall moment rather than an
  instant ID.
- **Learned-rule/rejection memory match**: no `AUDIO_ANSWER_LEAKAGE` (all
  audio/video speech-free or muted); `INSUFFICIENT_ASSET_EVIDENCE` applied —
  Garand recut below; `DISTINCTIVE_AUDIO_OBJECT` positive preference matched by
  Pack-a-Punch (Easy, analogous to the approved Mystery Box sound).
- **Rejected during planning**: Bouncing Betty (frames could not show the
  deployed device clearly); `cod4airstrike2` (contains "airstrike on the way"
  — answer leak); initial STG-44/Galil frames s_157/g_249 replaced by
  weapon-dominant s_078/g_238; `killcam.mkv` French title band cropped away.
- **Repairs (asset-level, no question-level rejections)**: `garand_ping.mp3`
  original 0-1.6s cut ended right before the ping (source 1.7-1.9s), which
  would have failed the Blind Asset Test; re-cut to 0.4-2.2s (shots + ping),
  re-verified speech-free and loudness-normalized.
- **Blind Asset Test**: all 13 media assets verified in isolation via OCR
  (text leaks), pixel/entropy rendering (target dominance), whisper (speech),
  RMS/spectral (content). Video leaks: snd shows only "PLANTING" text; killcam
  has no "VICTOIRE" band (crop below y610; "BONUS DE MATCH" and team-eliminated
  messages are not the answer); predator muted. RC-XD whisper output is
  scattered single-word hallucinations on the ticking motor, no coherent
  speech. Human visual spot-check still recommended for all 13 assets.
- **Assets**: all in `output/call-of-duty-batch2/{images,audio,video}`; every
  relative path resolves; audio loudnorm I=-16:TP=-1.5:LRA=11 @44.1k joint
  stereo; videos verified via ffprobe (snd 640x360/aac, predator 640x360,
  killcam 1280x610, no audio on predator/killcam).

### Asset-evidence repair review (2026-08-01)

- Q07 original `q07_juggernaut.png`: hard-rejected with
  `INSUFFICIENT_ASSET_EVIDENCE` and `TARGET_NOT_VISIBLE`; the combat frame did
  not show a Perk icon. Question idea preserved. Repaired with
  `q07_juggernaut_repaired.png`, an answer-label-free close crop of the dominant
  Juggernaut icon from a verified Create-a-Class frame. Blind Asset Test: pass.
- Q08 original `q08_claymore.png`: hard-rejected with
  `INSUFFICIENT_ASSET_EVIDENCE` and `TARGET_NOT_VISIBLE`; the killcam did not
  show a Claymore. Question idea preserved. Repaired with
  `q08_claymore_repaired.png`, a 1280×720 first-person frame where the M18A1
  device is centered and held in both hands. Blind Asset Test: pass.
- Q16 original `q16_hardpoint.mp4` (JCBSBMpCUFA 8-43s): hard-rejected with
  `AUDIO_ANSWER_LEAKAGE` and `INVALID_MEDIA_SEGMENT` — the BO2 announcer
  voices the answer constantly and the HUD shows `Hardpoint:` text. Since
  whisper-tiny STT (now downloaded) confirmed announcer "Hardpoint" callouts
  occur throughout the entire match, no leak-free interval exists; repaired by
  re-clip to JCBSBMpCUFA 56-91s with the top 320px HUD band cropped (removes
  the persistent `Hardpoint: MM:SS` timer at y 217-245, the `Hardpoint
  Captured!` popups at y 285-310, and the match-start title) and the audio
  track removed. Verified: frame-by-frame OCR over all 35 frames finds zero
  on-screen "Hardpoint" text; the clip has no audio stream; team-colored hill
  zone discs are visible in sampled frames (blue at t≈5-12s, red at t≈24s).
  Blind Asset Test: pass. Human spot-check still recommended.
- Repair metrics: rejected Assets 3, repaired questions 3, pending Asset
  repairs 0. Passing repair validation does not count as explicit question
  approval.
