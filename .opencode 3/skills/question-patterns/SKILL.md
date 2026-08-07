---
name: question-patterns
description: Canonical reusable Question Pattern registry and routing contract for Pattern-driven Lammah generation.
---

# Question Pattern System

Generation order is: Catalog/Subject allowlist → underrepresented Pattern →
underrepresented eligible entity/event → Media → question. Never choose a
famous character first and then search for a Pattern that fits it.

## Canonical Pattern IDs

- `WHY_DID` → `why-did/SKILL.md`
- `WHO_DID`, `WHO_STOPPED`, `WHO_SAVED`, `WHO_KILLED`, `WHO_BETRAYED` →
  `action-attribution/SKILL.md`
- `WHAT_HAPPENED_NEXT` → `what-happened-next/SKILL.md`
- `WHAT_HAPPENED_BEFORE` → `what-happened-before/SKILL.md`
- `WHO_WAS_WITH` → `who-was-with/SKILL.md`
- `WHAT_WAS_THE_GOAL` → `what-was-the-goal/SKILL.md`
- `COMPLETE_QUOTE`, `DIALOGUE` → `dialogue/SKILL.md`
- `VOICE_RECOGNITION` → `voice-recognition/SKILL.md`
- `SOUND_RECOGNITION` → `sound-recognition/SKILL.md`
- `SCENE_RECOGNITION` → `scene-recognition/SKILL.md`
- `OBJECT_RECOGNITION`, `WEAPON_RECOGNITION` →
  `object-recognition/SKILL.md`
- `LOCATION_RECOGNITION` → `location-recognition/SKILL.md`
- `MAP_RECOGNITION` → `map-recognition/SKILL.md`
- `GAME_IDENTIFICATION` → `game-identification/SKILL.md`
- `KILLSTREAK_RECOGNITION`, `SCORESTREAK_RECOGNITION` →
  `streak-recognition/SKILL.md`
- `HUD_RECOGNITION`, `UI_RECOGNITION`, `ICON_RECOGNITION` →
  `interface-recognition/SKILL.md`
- `PERK_RECOGNITION`, `EQUIPMENT_RECOGNITION` →
  `equipment-recognition/SKILL.md`
- `GAME_MODE_RECOGNITION`, `OBJECTIVE_RECALL` →
  `mode-objective/SKILL.md`
- `MISSION_RECOGNITION` → `mission-recognition/SKILL.md`
- `ABILITY_RECOGNITION` → `ability-recognition/SKILL.md`
- `ORGANIZATION`, `TEAM` → `organization-team/SKILL.md`
- `EVENT`, `SEQUENCE`, `TIMELINE`, `ARC` → `event-sequence/SKILL.md`
- `CHARACTER_IDENTIFICATION` → `character-identification/SKILL.md`
- `KNOWLEDGE` → `knowledge/SKILL.md`

Catalog and Subject files declare `allowedQuestionPatterns` using only these
IDs. A Subject declaration overrides the Catalog list when explicitly marked;
otherwise it narrows or inherits it. Unknown IDs are invalid. Pattern Skills
own reusable execution behavior; Catalogs own eligibility; Subjects own facts,
exceptions, and priorities.

Preserve legacy question schemas. Canonical Pattern IDs are internal planning
and reporting values unless the existing output already has a compatible field.
Normalize known historical labels before coverage/health comparison, including:

- `character_identification` / Character Recognition →
  `CHARACTER_IDENTIFICATION`;
- `object_identification` / Object Recognition → `OBJECT_RECOGNITION`;
- `ability_identification` / Technique Recognition → `ABILITY_RECOGNITION`;
- `knowledge_question` → `KNOWLEDGE`;
- Scene Recognition → `SCENE_RECOGNITION`;
- Event Recall / Event Recognition → `EVENT`;
- Quote Attribution / Dialogue Completion → `DIALOGUE` or
  `COMPLETE_QUOTE` according to the actual gameplay.
- HUD and UI Recognition → `HUD_RECOGNITION` or `UI_RECOGNITION` according to
  the required observation; Map Recognition → `MAP_RECOGNITION`; Sound
  Identification → `SOUND_RECOGNITION`; Mission Recognition →
  `MISSION_RECOGNITION`; Objective Recall → `OBJECTIVE_RECALL`.

## Shared Pattern Contract

Every selected Pattern must define its Primary Focus, context entities, Event
Cluster, Gameplay Pattern, answer, required observation, suitable knowledge,
and Media dependency before drafting. Apply the Design Bible, validator,
duplicate checker, learning rules, health signals, and Coverage Ledger after the
Pattern-specific rules.
