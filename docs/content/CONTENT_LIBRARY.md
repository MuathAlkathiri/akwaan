# Verified Question Library

The library holds human-verified facts for the Content Engine. It is imported
from a workbook into `engine_library_rows` and `engine_library_hooks`, keyed by
row id. Authoring rules still live in the Skills under `ai/.opencode/skills/`.

## Importing

```bash
npm run import:content-library --workspace backend -- <workbook.xlsx>
```

This is a dry run: it validates the file, prints what it derived and writes
nothing. Writing needs `--apply --database=<name>`, and the name must match the
database `MONGODB_URI` reaches. One bad row refuses the whole workbook.

## Which rows reach generation

Only rows that are `APPROVED`, have `scope_status` of `MATCH`, and have the role
`FACT_SEED` or `EXEMPLAR_CANDIDATE`. Every other row is stored and gated. Only
`EXEMPLAR_CANDIDATE` rows show their wording to the writer as a style model.

`source_url` may hold two URLs separated by ` | `. The first is the lead source.
A row citing a host in `LIBRARY_WEAK_SOURCE_HOSTS` stays usable and carries a
`WEAK_SOURCE` warning into review.

## Generation

A request splits into a library-anchored job and an exploratory job, because one
provider call sees one prompt and exploratory candidates must never see rows.

| Setting | Default | Meaning |
|---|---|---|
| `ENGINE_LIBRARY_ANCHORED_PERCENT` | 70 | Share of a request that is anchored |
| `ENGINE_LIBRARY_MAX_USES_PER_ROW` | 3 | Candidates one row may lead |
| `ENGINE_LIBRARY_COPY_THRESHOLD` | 0.5 | Similarity at which a copy is rejected |

## Copy detection

A candidate is rejected as `LIBRARY_ROW_COPY` only when it has the row's answer,
names the row's entity, and scores at or above the threshold on word and
character n-gram similarity. The check is deterministic and runs on generation,
edit and re-screen. It catches reordering and light rewording. It does not catch
a full rewrite in different words, so a reviewer is still the last check.

Review shows each anchored candidate's highest similarity to a pinned row, so a
near miss is visible even when it passes. `library-copy-detector.spec.ts` records
the known misses as known-gap tests. They do not fail the build, and one turns
red when the detector starts catching it.

## Top-5 rows

Library Top-5 content follows stricter rules than the mechanic's own contract.
They apply to library content only.

- **Rank means recency.** Correct answers rank most recent win first, not by
  position in a table. This differs from the Top-5 Skill, where rank is a
  position in a ranking and traps are usually positions 6-10.
- Traps come only from the approved `top5_traps_5` list.
- The question states its window, and carries no `اختر` or `(5 من 10)` wording.
- Cards carry names only, with no years or notes.

## Open items

- **H5, semantic answer leakage:** the screen catches exact leaks only, and
  anchored writers now see the answer. Separate task after the integration pass.
- **Top-5 generation:** the validator exists and nothing feeds it yet.
- **`revalidateAfter`:** stored and carried through promotion. Nothing acts on it
  yet, and "since" questions stay open-ended until something does.
- **Two-run batches:** a request can create two jobs, each started by hand.
- **A no-op edit clears `fact_blocked`:** harmless until something can produce
  CONTRADICTED, and must be fixed before an evidence assessor is added.
