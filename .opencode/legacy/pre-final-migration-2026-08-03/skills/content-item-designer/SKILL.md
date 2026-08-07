---
name: content-item-designer
description: Plans, creates, validates, and finalizes Akwaan ContentItem sets after World, Scope, and compatible mechanics are resolved.
---

# ContentItem Designer

Read `../../knowledge/AKWAN-CONTENT-BIBLE.md` first.

## Inputs

Resolve:

- requested count;
- World and Scope;
- compatible Challenge Types;
- allowed answer modes;
- requested language;
- current ContentItem schema;
- optional output directory;
- media availability and project asset conventions.

## Design process

1. Create a coverage ledger.
2. Select a valid underrepresented Content Pattern.
3. Select an eligible event/entity that fits the Scope.
4. Choose answer mode compatible with every target Challenge Type.
5. Decide whether media is genuinely needed.
6. Build the structured answer payload.
7. Write concise player-facing Arabic.
8. Validate automatic resolution, ambiguity, leakage, asset evidence, and duplicates.
9. Repair or replace failures.
10. Mark ready only when all blockers pass.

Use:

- `asset-selection.md`
- `content-variety.md`
- `accessibility-and-pacing.md`
- `coverage-ledger.md`

## RYO-specific rules

For `multiple_choice`:

- 2–4 options;
- exactly one correct option ID;
- plausible same-class distractors;
- no answer leakage through option length or wording.

For `closest`:

- finite numeric correct value;
- visible unit;
- deterministic tolerance where required;
- explicit edition/timeframe/measurement basis.

Do not generate free-text judged answers.

## Media

Media is optional and belongs only to ContentItem.

- text-only: no media object;
- image: validated local/served image asset;
- audio: validated clip;
- video: validated clip.

Use one media channel unless the mechanic genuinely requires otherwise.

## Finalization

Final output must contain no legacy points, difficulty, host-decision, or flat
category fields. Preserve the repository's current DTO exactly.
