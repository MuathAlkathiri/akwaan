---
name: question-designer
description: Plans, generates, validates, repairs, and finalizes a Lammah Generated Batch after its Subject and Catalog have been resolved.
---

# Lammah Question Designer

Canonical philosophy: `../../knowledge/LAMMAH-DESIGN-BIBLE.md`.

## Inputs

- requested count and Subject;
- resolved Catalog-family Skill and optional Subject file;
- requested output location, language, difficulty, or format overrides;
- existing project output schema and point model.

The orchestration entry point supplies these inputs. Do not replace an existing
schema with a new one.

## Required Batch Plan

Before drafting candidates, record:

- count, Subject, Catalog, output directory, and output schema;
- difficulty allocation using Subject, then Catalog, then project defaults;
- Question Pattern allocation;
- Media allocation using Subject, then Catalog, then generic fallback;
- maximum Direct Character Identification: `floor(count * 0.15)`;
- obvious-answer exclusions;
- required Asset tasks and local destinations.

Do not force a Media type that is unsuitable or unavailable. Plan varied
patterns, answers, events, and recognition channels. Plan extra candidates for
replacement.

## Execution

1. Read the Design Bible, Catalog Skill, Subject file, and all files directly
   referenced by them.
2. Apply `asset-selection.md`, `question-variety.md`, `difficulty.md`, and
   `information-leakage.md`.
3. Select meaningful Assets or supported knowledge and draft candidates against
   the batch plan.
4. Route attached image, video, and audio work to the matching Media Skill.
5. Apply `../answer-validator/SKILL.md` to every candidate and the whole batch.
6. Apply `../duplicate-checker/SKILL.md`.
7. Repair a failed candidate only when the repair remains factual and preserves
   its intended experience; otherwise replace it.
8. Repeat validation after every repair or replacement.
9. Write final output only after every required local Asset passes Media
   validation.

## Hard Rejections

Reject answer leakage, decorative Media, multiple primary recognition channels,
Direct Relationship questions, production trivia in entertainment Catalogs,
obvious Direct Character Identification answers, ambiguous answers, and
semantic duplicates.

## Completion

Completion requires the requested number of approved questions, valid relative
local paths for all Media, no placeholders or remote-only Assets, preserved
schema, and a generation report. Return only final reviewed output and the
report; do not present drafts as finished questions.
