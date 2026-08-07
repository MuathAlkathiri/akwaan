---
name: content-generation-orchestrator
description: Entry point for generating Akwaan ContentItems for a World and Scope using the canonical content architecture.
---

# Content Generation Orchestrator

This skill operates only inside an assigned ContentItem Writer stage governed
by `.opencode/README.md`, a valid batch manifest, and the cooperative workflow.
It may write only the Writer-owned draft output. It never replaces Research,
Review, Asset Curation, QA, or human approval.

Simple requests are sufficient, for example:

- "Generate 20 RYO ContentItems for Anime → Naruto"
- "Create 12 image-based ContentItems for Football → World Cup"

Do not ask the user to repeat global validation, media, duplicate, or leakage rules.

## Required resolution

Resolve:

1. requested count;
2. World;
3. Scope/Subject;
4. target Challenge Type(s), defaulting to canonical RYO only when explicitly appropriate;
5. allowed answer modes;
6. language;
7. output location and current project schema.

Read, in order:

1. `../../knowledge/AKWAN-CONTENT-BIBLE.md`;
2. this orchestrator;
3. resolved World-family Skill;
4. resolved Subject file when present;
5. `../content-item-designer/SKILL.md`;
6. applicable Content Pattern Skills;
7. applicable media designer;
8. `../content-validator/SKILL.md`;
9. duplicate, asset, learning, cache, and health guidance.

## Architecture contract

Generate `ContentItem` records, not legacy Questions.

Each item must resolve to:

```text
World (derived through Scope)
Scope
compatibleChallengeTypeIds
prompt
answerPayload
optional media
isReusableAcrossSessions
status
metadata
```

Do not emit legacy fields:

- `points`
- `score`
- `difficulty` (forbidden legacy field)
- `correctAnswer` free text
- host judgment fields
- flat category IDs

## RYO planning

Canonical RYO content supports:

- `multiple_choice`
- `closest`

RYO has one global name and one global timer. Do not generate per-World RYO
presentation, timer, media, or naming configuration.

Media is optional and belongs to the ContentItem.

## Planning order

1. Build a coverage ledger for the requested set.
2. Select underrepresented allowed Content Patterns.
3. Select eligible underrepresented events/entities.
4. Decide text-only vs. image/audio/video based on genuine gameplay value.
5. Acquire or define an answer-bearing asset when media is required.
6. Draft the prompt and structured answer payload.
7. Validate compatibility, automatic resolution, leakage, evidence, and duplicates.
8. Repair or replace failures.
9. Finalize only ready items.

## Output

Preserve the repository's exact current ContentItem DTO/schema. If it cannot be
discovered, stop and report the missing contract rather than inventing one.

Return:

- ContentItem output;
- generation report;
- coverage summary;
- rejected/replaced candidates;
- media validation results;
- unresolved facts or assets requiring manual work.
