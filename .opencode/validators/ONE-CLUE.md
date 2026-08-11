# One Clue / بدليل واحد Validation

Validate One Clue items with `validate_one_clue.py` after the shared ContentItem
gates and before readiness. The validator mirrors the production contract and
decides only what a machine can decide.

## Canonical Contract

- Compatible challenge type: `one-clue`; Pattern: `progressive-clues`; wrapper
  answer mode: `one_clue`.
- One ContentItem is one knowledge-recognition ladder; a Challenge is exactly
  three distinct items.
- Native payloads: `answerPayload` with `mode: match` and nonempty
  `acceptedAnswers`; `mechanicPayload` with exactly five `clues`.
- Clue fields: `order` 1..5 and `value` 5, 4, 3, 2, 1 in exact per-order
  sequence; nonblank Arabic `text`.
- Two teams, 7-second stages, cumulative clue reveal, one assigned answerer per
  team, elimination on a wrong lock, automatic normalized-text resolution.
  These are runtime-owned and never authored.
- Runtime contract is production-ready: `metadata.runtimeContractStatus` is
  `fully_playable` with an empty `runtimeBlocker`.

## Machine Checks

- canonical IDs (`one-clue`, `progressive-clues`, `one_clue`);
- `answerPayload.mode` is `match`; `acceptedAnswers` present, nonblank, and
  distinct after normalization;
- exactly five clues; unique orders exactly `[1, 2, 3, 4, 5]`; values exactly
  `[5, 4, 3, 2, 1]`; nonblank Arabic text;
- no duplicated clue text after normalization;
- no literal answer leakage in the prompt or any clue (same normalization as the
  backend; short-alias policy documented in LEAKAGE.md);
- no truth or runtime-owned fields inside `mechanicPayload`; no legacy fields;
- `media` is `null`; `isReusableAcrossSessions` is `false`;
- supported status and matching `metadata.validationStatus`.

## Reasoning Gates

The validator does not and cannot prove factual correctness, relative
difficulty, clue usefulness, semantic duplication, or monotonic identification.
Those are Reviewer and QA gates recorded in the workflow stage files.

## Fixtures

`examples/one-clue.valid.json` is a synthetic schema fixture (not production
content). `examples/one-clue.invalid-fixtures.json` and
`test_one_clue_fixtures.py` cover wrong clue counts, swapped order, wrong
values, blank text, duplicated text, literal leakage, wrong pattern/mode,
reuse, runtime status, and legacy fields.
