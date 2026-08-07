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
- required Asset tasks and local destinations;
- active learned-rule constraints and rejected Asset exclusions;
- active Subject/Catalog positive preferences and their evidence confidence;
- current Subject Health, including overrepresented events/answers, overused or
  missing suitable Patterns, Media performance, and pending review coverage;
- expected cache/ranking metrics and permitted quality exceptions.

Load `../question-patterns/SKILL.md`, resolve the Catalog/Subject
`allowedQuestionPatterns`, and initialize `coverage-ledger.md`. Do not generate
from an entity-first list.

Do not force a Media type that is unsuitable or unavailable. Plan varied
patterns, answers, events, and recognition channels. Plan extra candidates for
replacement.

Apply positive preferences as small target boosts only when the preferred
Pattern, Media type, Asset source, or query strategy remains suitable and below
its diversity limit. One approval is a weak signal; with insufficient review
evidence, rely primarily on Catalog defaults and the Design Bible.

Do not boost an already overrepresented Pattern, answer, event, or Asset merely
because similar questions were approved. Health recommendations influence the
plan gently and never override the request, rejection memory, hard limits, or
Media availability.

## Execution

1. Read the Design Bible, Catalog Skill, Subject file, and all files directly
   referenced by them.
2. Apply `asset-selection.md`, `question-variety.md`, `difficulty.md`, and
   `information-leakage.md`.
3. For each batch slot, use the Coverage Ledger to choose an underrepresented
   allowed Question Pattern and Gameplay Pattern first.
4. From knowledge eligible for that Pattern, choose the best underrepresented
   Primary Focus, answer, Event Cluster, arc/stage, and supporting entities.
   Record context separately from Primary Focus.
5. Read and apply the selected Pattern Skill.
6. For every planned Media question, create an intent and apply
   `../asset-search-planner/SKILL.md`.
7. Check Search Cache, rank results with
   `../asset-quality-ranker/SKILL.md`, then check Asset Cache.
8. Route reuse, download, and local validation to the matching Media Skill.
9. Draft question candidates against the batch plan and selected Assets or
   supported knowledge.
10. Compare candidates with active rejection-memory rules.
11. Compare otherwise valid candidates with positive success signatures. Record
   the match and planning influence, but never auto-approve by similarity.
12. Apply `../answer-validator/SKILL.md` to every candidate and the whole batch.
13. Apply `../duplicate-checker/SKILL.md`, including cumulative Subject Health
   signals for repeated events, answers, Assets, and formulaic structures.
14. Repair a failed candidate only when the repair remains factual and preserves
   its intended experience; otherwise replace it.
15. Commit approved coverage, update the ledger, and repeat from Pattern
    selection for the next slot.
16. Repeat validation after every repair or replacement.
17. Write final output only after every required local Asset passes Media
   validation.

## Hard Rejections

Reject answer leakage, decorative Media, multiple primary recognition channels,
Direct Relationship questions, production trivia in entertainment Catalogs,
obvious Direct Character Identification answers, ambiguous answers, and
semantic duplicates.

Also reject unknown or disallowed Pattern IDs and semantic answer leakage where
the wording defines, translates, decomposes, or paraphrases the answer name.

## Completion

Completion requires the requested number of approved questions, valid relative
local paths for all Media, no placeholders or remote-only Assets, preserved
schema, and a generation report. Return only final reviewed output and the
report; do not present drafts as finished questions.

The report must include Asset ranking, cache, rejection, learned-rule match, and
batch-quality metrics required by the orchestrator, including preference boosts,
matches, conflicts, hard-rule overrides, and health-informed deviations.
Automatic success or failure affects metrics only and must not become permanent
approval or rejection memory.
