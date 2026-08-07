# OpenCode Config Migration — Akwaan

This configuration was migrated from the legacy Akwaan question pipeline to the
Akwaan content model.

## Renamed source-of-truth modules

- `knowledge/AKWAN-CONTENT-BIBLE.md` → `knowledge/AKWAN-CONTENT-BIBLE.md`
- `question-generation-orchestrator` → `content-generation-orchestrator`
- `question-designer` → `content-item-designer`
- `question-patterns` → `content-patterns`
- `lammah-style-guide` → `akwan-style-guide`
- `answer-validator` → `content-validator`
- image/audio/video question designers → content designers

## Removed assumptions

- 200/400/600 tiers
- Easy/Medium/Hard persistence
- host-judged free-text answers
- flat category ownership
- mechanic-owned or World-owned question media
- per-World RYO naming/timer/presentation

## New assumptions

- `World → Scope → ChallengeType → ContentItem`
- media belongs only to ContentItem and is optional
- canonical RYO supports `multiple_choice` and `closest`
- every item must resolve automatically
- Scope exclusions and mechanic compatibility are mandatory
- output must follow the repository's current ContentItem DTO

Derived cache and health JSON should be regenerated after installation.
