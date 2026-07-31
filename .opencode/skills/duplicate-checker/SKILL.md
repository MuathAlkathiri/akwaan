---
name: duplicate-checker
description: Detects semantic duplicate Lammah questions within a Generated Batch and against available prior questions.
---

# Duplicate Checker

Wording alone neither proves nor disproves duplication.

## Comparison Key

For each candidate normalize and compare:

- Subject;
- accepted answer or bounded answer set;
- underlying event and scene;
- tested observation or recalled fact;
- Question Pattern;
- Asset identity or clip interval;
- semantic meaning.

Use available previous question files when they are in scope. Normalize spelling,
case, punctuation, whitespace, and known aliases without collapsing genuinely
different entities.

## Decisions

Repeated generic wording is allowed when content and Assets differ and all batch
limits pass. Different wording is a duplicate when it tests the same moment and
answer set—for example, "Who entered the palace?" and "Name the people who went
inside" about the same entry.

The same Asset may be reused only for genuinely different observations. Reusing
the same answer can still be valid in rare, meaningfully different patterns, but
repeated answers that weaken batch variety must be replaced.

Return `pass` or `duplicate` with the matched question and collision dimensions.
On duplication, replace the weaker candidate and run the check again.
