# Catalog and Subject Health

These files hold cumulative operational summaries:

- `subject-health.json`: one record per Subject;
- `catalog-health.json`: Catalog aggregates derived from Subject records.

They do not change question schemas or canonical knowledge. Never fabricate
metrics that cannot be derived from generation reports, review history, cache
records, and files that were actually inspected.

Normalize historical Pattern labels through
`../skills/question-patterns/SKILL.md` before aggregating new coverage. Preserve
the original stored records and question schemas.

## Idempotent Updates

Update Subject Health after a completed batch, explicit approval or rejection,
Asset replacement, validation-state change, meaningful cache-state change, or
question deletion/supersession. Aggregate Catalog Health after Subject Health.

Do not count the same action twice. When no existing batch/review identifier is
available, use the combination of Subject, output path, generation/review
timestamp, and generation-report path as an update key. Store processed update
keys in the health record. Reprocessing the same key must replace or skip its
contribution, never add it again.

Questions without explicit review are `pending`, not approved.

## Subject Health

Track available values only:

- identity: Subject, Catalog, first/last generation, last successful batch,
  last review;
- volume: generated, approved, rejected, pending, approval/rejection rates;
- difficulty counts/percentages and expected-distribution deviation;
- Question Pattern counts/percentages, approval/rejection rates, overused,
  underused, and missing suitable Patterns;
- Media counts, approval rates, Asset quality by Media, missing failures, and
  low-quality exceptions;
- Direct Character Identification, Knowledge, and scene/event percentages;
- repeated answers, events, Assets, semantic duplicates, and important rejection
  reason counts;
- Primary Focus distribution, recognition-saturated focus count, Event Cluster
  and arc/stage coverage, normalized answer collisions, and Gameplay Pattern
  distribution;
- active Subject rejection rules and positive preferences, approval/rejection
  record counts, top reasons, strongest preferred/discouraged Patterns;
- unique/reused/new/rejected Assets, scores, cache hit rate, source types, and
  Media coverage;
- stale questions/Assets when detectable and unresolved warnings.

Gaming Subjects may additionally record observed title/version, era/subseries,
mode, map/weapon/sound class percentages, Gameplay Pattern distribution,
wrong-title failures, community-alias ambiguity, Asset score by mode, approved
or rejected gameplay experiences, and overrepresented titles. For Call of Duty,
store Multiplayer/Campaign/Zombies/Warzone separately and never fabricate a
baseline before a real report exists.

## Catalog Health

Aggregate without mixing records from other Catalogs:

- total Subjects and Subjects with content;
- generated, approved, rejected, pending, and overall approval rate;
- difficulty, Question Pattern, and Media distributions;
- average Asset score and cache hit rate;
- most common rejection reason, most successful and overused Patterns;
- highest-health and attention-required Subjects;
- Subjects with insufficient content, excessive Direct Character
  Identification, high duplicate rates, low Asset quality, or no recent review.

Question count alone never improves health.

## Transparent Health Score: 0–100

| Factor | Points |
|---|---:|
| Approval rate | 20 |
| Question Pattern diversity | 15 |
| Difficulty balance | 10 |
| Media suitability and coverage | 10 |
| Average Asset quality | 10 |
| Duplicate safety | 10 |
| Answer/event repetition safety | 5 |
| Hard-rule compliance | 10 |
| Review coverage | 5 |
| Freshness and unresolved warnings | 5 |

Record each component contribution and supporting evidence. This is an
operational signal, not scientific measurement.

Statuses: `Excellent` 90–100, `Healthy` 80–89, `Acceptable` 70–79,
`Needs Attention` 60–69, `Weak` 40–59, and `Critical` 0–39.

Unresolved hard failures prevent `Excellent`, including missing required local
Assets, known factual errors, invalid paths, severe duplicate contamination,
unresolved leakage, substantial unreviewed content, reuse of rejected Assets,
or Direct Character Identification above 15%.

## Evidence Confidence

- fewer than 5 reviewed questions: `Insufficient review data`;
- 5–19: `Early signal`;
- 20–49: `Moderate confidence`;
- 50 or more: `Strong confidence`.

Hard failures may create immediate warnings at any sample size. Do not declare a
Pattern highly preferred from one approval or a Subject unhealthy from one
ordinary rejection.

## Warnings and Recommendations

Warnings must state the observed metric and why it matters—for example,
`Direct Character Identification is 22%, above 15%`. Recommendations must be
small, actionable, and evidence-based. They may influence a future plan gently
but never modify content, override the user, or bypass hard rules.

## Human-Readable Requests

For `Show the Naruto health report`, read the existing Naruto Subject record and
render score, status, confidence, review volume, distributions, content quality,
Asset/cache quality, learning signals, warnings, and recommendations. State
`insufficient evidence` for missing sections; never invent example numbers.
