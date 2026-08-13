---
name: duplicate-checker
description: Detects semantic duplicate Akwaan ContentItems within a ContentItem Set and against available prior ContentItems.
---

# Duplicate Checker

Wording alone neither proves nor disproves duplication.

## Comparison Key

For each candidate normalize and compare:

- Subject;
- accepted answer or bounded answer set;
- underlying event and scene;
- tested observation or recalled fact;
- Content Pattern;
- Asset identity or clip interval;
- semantic meaning.
- normalized Primary Focus and answer aliases;
- Event Cluster and arc/season/timeline stage;
- Gameplay Pattern.

Use available previous ContentItem files when they are in scope. Normalize spelling,
case, punctuation, whitespace, and known aliases without collapsing genuinely
different entities.

Also compare active relevant records in
`../../learning/rejection-history.json`. A previously user-rejected ContentItem
must not return through minor wording changes. Use structured failure signature,
Subject, answer, event, Pattern, and Asset; do not reject on word overlap alone.

Use `../../health/subject-health.json` to identify cumulative concentration in
one event, answer, Asset, or approved structure. Health concentration is a
planning/attention signal unless the candidate also violates duplication or
batch-diversity rules.

## Decisions

Repeated generic wording is allowed when content and Assets differ and all batch
limits pass. Different wording is a duplicate when it tests the same moment and
answer set—for example, "Who entered the palace?" and "Name the people who went
inside" about the same entry.

Classify every collision as:

- `DUPLICATE_QUESTION`: same semantic challenge;
- `DUPLICATE_EVENT`: same event tested again without a distinct observation;
- `REPEATED_ANSWER`: answer repetition that weakens the batch;
- `DUPLICATE_ASSET`: same local/source Asset reused;
- `ACCEPTABLE_REUSE`: distinct valid observation or reuse in a separate batch.

Treat aliases and titles for the same entity as one answer. Different ContentItems
from the same battle, match, episode sequence, or incident belong to one Event
Cluster even when their Pattern differs. Event Cluster concentration can fail
batch diversity before two ContentItems become exact semantic duplicates.

The same Asset may be reused across batches. Inside one batch, limit reuse and
allow it only for genuinely different observations. Reusing the same answer can
still be valid in rare, meaningfully different patterns, but repeated answers
that weaken batch variety must be replaced.

Approval history can identify a successful reusable structure, but does not make
ContentItems about the same event, answer, or Asset distinct. Do not classify all
ContentItems sharing an approved structure as duplicates; compare the underlying
semantic challenge and observation.

Gameplay similarity is distinct from semantic duplication: three weapon
recognition ContentItems may have different answers yet still require rotation
because the player performs the same task each time.

Return `pass` or `duplicate` with the matched ContentItem and collision dimensions.
Also return the collision classification and whether rejection history matched.
On duplication, replace the weaker candidate and run the check again. Report
repeated-answer/event counts and duplicate replacements in generation metrics.
