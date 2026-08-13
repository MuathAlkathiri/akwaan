---
name: content-patterns
description: Canonical reusable Content Pattern registry for Akwaan ContentItem generation.
---

# Content Pattern System

Generation order:

```text
World/Scope allowlist → underrepresented Content Pattern
→ underrepresented eligible entity/event → optional media → ContentItem
```

## Canonical Pattern IDs

- `WHY_DID` → `why-did/SKILL.md`
- `WHO_DID`, `WHO_STOPPED`, `WHO_SAVED`, `WHO_KILLED`, `WHO_BETRAYED` → `action-attribution/SKILL.md`
- `WHAT_HAPPENED_NEXT` → `what-happened-next/SKILL.md`
- `WHAT_HAPPENED_BEFORE` → `what-happened-before/SKILL.md`
- `WHO_WAS_WITH` → `who-was-with/SKILL.md`
- `WHAT_WAS_THE_GOAL` → `what-was-the-goal/SKILL.md`
- `COMPLETE_QUOTE`, `DIALOGUE` → `dialogue/SKILL.md`
- `VOICE_RECOGNITION` → `voice-recognition/SKILL.md`
- `SOUND_RECOGNITION` → `sound-recognition/SKILL.md`
- `SCENE_RECOGNITION` → `scene-recognition/SKILL.md`
- `OBJECT_RECOGNITION`, `WEAPON_RECOGNITION` → `object-recognition/SKILL.md`
- `LOCATION_RECOGNITION` → `location-recognition/SKILL.md`
- `MAP_RECOGNITION` → `map-recognition/SKILL.md`
- `GAME_IDENTIFICATION` → `game-identification/SKILL.md`
- `KILLSTREAK_RECOGNITION`, `SCORESTREAK_RECOGNITION` → `streak-recognition/SKILL.md`
- `HUD_RECOGNITION`, `UI_RECOGNITION`, `ICON_RECOGNITION` → `interface-recognition/SKILL.md`
- `PERK_RECOGNITION`, `EQUIPMENT_RECOGNITION` → `equipment-recognition/SKILL.md`
- `GAME_MODE_RECOGNITION`, `OBJECTIVE_RECALL` → `mode-objective/SKILL.md`
- `MISSION_RECOGNITION` → `mission-recognition/SKILL.md`
- `ABILITY_RECOGNITION` → `ability-recognition/SKILL.md`
- `ORGANIZATION`, `TEAM` → `organization-team/SKILL.md`
- `EVENT`, `SEQUENCE`, `TIMELINE`, `ARC` → `event-sequence/SKILL.md`
- `CHARACTER_IDENTIFICATION` → `character-identification/SKILL.md`
- `KNOWLEDGE` → `knowledge/SKILL.md`

These IDs are internal planning metadata unless the current ContentItem schema
has a compatible metadata field. They are not mechanics and do not create new
Challenge Types.

Each selected Pattern must define primary focus, event cluster, answer, required
observation, media dependency, and compatible answer mode before drafting.
