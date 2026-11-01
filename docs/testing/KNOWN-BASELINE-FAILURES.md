# Known baseline integration failures

One backend integration suite fails for reasons unrelated to the Match
orchestration work. It is recorded here so a red gate is never mistaken for a
regression — and so it is never quietly accepted as permanent.

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
| Date verified | 2026-11-01 |
| Verified against | `feat/content-library` under Node 20 on the Compose network, with a clean `origin/main` comparison for the failing suite |
| Result | 1 suite / 1 test. `games` and `music` now pass and have been removed from the table below. |
| Match-slice suites at the same run | `match-api`, `match-persistence`, `match-top10`, `world-content`, `world-content-migration`, `questions`, `auth-catalogs`, `top10-variant-migration` all pass |

## The failures

| Suite | Failing tests | Category | Blocks Match work? | Follow-up owner |
| --- | --- | --- | --- | --- |
| `test/integration/manual-question-architecture.integration-spec.ts` | 1 | Disabled AI generation returns 400 where the test expects a structured 503 | No — unrelated module | _unassigned_ |

**Total: 1 failing test across 1 suite.**

## Rules for this file

- A failure may only be listed here after it has been reproduced on an unchanged
  tree, and the reproduction must be dated.
- If a listed failure changes shape (different test, different assertion), treat
  it as a new regression and investigate before updating this table.
- Deleting a row requires the test to pass, not the test to be removed.
