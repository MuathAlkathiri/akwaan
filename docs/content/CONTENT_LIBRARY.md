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

## Anchored Closest

A Closest row can run between two anchors instead of plain numbers. The `Examples`
sheet maps to the code like this:

| Sheet column | Code |
|---|---|
| `interaction_mode` | `closestSlider.mode` |
| `anchor_left`, `anchor_right` | `leftAnchor`, `rightAnchor` |
| `range_min`, `range_max` | `min`, `max`, the real values of the two anchors |
| `answer_numeric` | `correctValue` |
| `anchor_step` (optional) | `step` |

**The anchor bank is the rule.** The `Anchors` sheet (`id`, `label_ar`, `year`,
`source_url`, `note`) is curated by a human, and that curation is what judges
anchor quality. A job pins its World's bank, the writer's schema allows only those
ids, and the range comes from their values. An anchor with no `year` has no
position, so it is never offered. Anchors must be distinct, bracket the target,
never equal it, and never state it. A fact bound to an anchored row covers only
that same scale. Worlds with no bank stay `numeric-range`.

An `Examples` row has no World, status or date of its own, so it defaults to the
`celebrities` World and `NEW_SCOPE`. It reaches generation only once the sheet
gives `scope_status` of `MATCH` and a `verified_on` date. `anchor_years_internal`
is stored and never sent to the writer.

Importing retires only rows dropped from the sheets a file carries, so a
Celebrities file cannot retire the football library, or the reverse.

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
- **The judge on UNRESOLVED:** the code runs it, and the integration test
  `skips the judge when retrieval fails outright` says it must not. C1 used to
  hide this. One of the two needs to change.
- **`never admits more than the cap`:** this test puts all 150 reservations on
  one job, so the per-job cap stops it before the monthly cap it means to test.
