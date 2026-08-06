# Known baseline integration failures

Four backend integration suites fail on `main` for reasons unrelated to the Match
orchestration work. They are recorded here so a red gate is never mistaken for a
regression — and so they are never quietly accepted as permanent.

**None of these tests are skipped, disabled, or had their expectations relaxed.**

## How to reproduce

```bash
docker compose -f docker-compose.test.yml run --rm backend-integration
```

The suites need the Compose replica-set database (`mongodb-test`); running them
from the host fails to connect, because the replica set advertises its member as
`mongodb-test:27017`.

## Verified

| | |
| --- | --- |
| Date verified | 2026-08-05 |
| Verified against | `main` with all Match changes stashed (`git stash push -u`), then again with them applied |
| Result | 3 suites / 6 tests. `world-content-migration` now passes and has been removed from the table below. |
| Match-slice suites at the same run | `match-api`, `match-persistence`, `match-top10`, `world-content`, `world-content-migration`, `questions`, `auth-catalogs`, `top10-variant-migration` all pass |

## The failures

| Suite | Failing tests | Category | Blocks Match work? | Follow-up owner |
| --- | --- | --- | --- | --- |
| `test/integration/games.integration-spec.ts` | 4 | Legacy Game HTTP lifecycle — auth/validation/subscription rules, board creation, scoring/skip/complete, optimistic concurrency | No — the Match layer imports nothing from `modules/games`, asserted by `match.architecture.spec.ts` | _unassigned_ |
| `test/integration/music.integration-spec.ts` | 1 | Music HTTP lifecycle: list/update/normalized answers/soft delete | No — unrelated module | _unassigned_ |
| `test/integration/manual-question-architecture.integration-spec.ts` | 1 | Disabled AI generation returns 400 where the test expects a structured 503 | No — unrelated module | _unassigned_ |

**Total: 6 failing tests across 3 suites.**

## Rules for this file

- A failure may only be listed here after it has been reproduced on an unchanged
  tree, and the reproduction must be dated.
- If a listed failure changes shape (different test, different assertion), treat
  it as a new regression and investigate before updating this table.
- Deleting a row requires the test to pass, not the test to be removed.
