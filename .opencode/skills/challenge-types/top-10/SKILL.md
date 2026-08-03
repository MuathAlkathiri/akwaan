---
name: top-10
description: Author, audit, migrate, and extend the canonical Top 10 challenge without breaking classic ranked-list gameplay.
---

# Top 10 challenge skill

Use this skill for every Top 10 implementation or content change in Lammah.

## Required workflow

1. Read `GAME_NEW_SYSTEM_ROADMAP.md` and the relevant pattern in `PATTERNS/`.
2. Audit both legacy `ranked_list` and new-system `top_10` call sites before editing.
3. Treat a missing variant as `classic`; never reinterpret existing content as poison deck.
4. Keep correctness, deck order, internal scores, and unrevealed classifications server-owned.
5. Persist every turn, deadline, assignment, reveal cursor, metric, and ScoreEvent through the live runtime transaction boundary.
6. Use `ScoringService` with the pattern's declared rule. A mechanic may not mutate Match points directly.
7. Run backend and frontend typechecks, focused tests for both patterns, migration dry-run/apply/idempotency tests, and the Docker smoke check.

## Pattern registry

- `classic`: legacy free-text ranked-list round; see `PATTERNS/classic.md`.
- `poison-deck`: 14-card keep-or-poison live round; see `PATTERNS/poison-deck.md`.

The machine-readable contract is `top-10.patterns.schema.json`. New patterns must add a document under `PATTERNS/`, extend that schema, and provide an explicit migration that defaults existing records safely.

## Alignment audit

Before completion, confirm:

- legacy ranked-list point values, strikes, normalization, host controls, and final score behavior are unchanged;
- the new variant is one continuous ContentItem and does not create 14 question documents;
- projections never contain `rankedAnswerJson`, `decoyCandidateIdsJson`, or deck order;
- phone actions are authorized for the active team only;
- timeouts resolve to KEEP at six seconds;
- reveal order is rank 10 through rank 1, then four decoys;
- ties emit no Match ScoreEvent;
- no migration creates or changes a World signature assignment.
