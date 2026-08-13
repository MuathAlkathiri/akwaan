---
patternId: complementary-halves
owningChallengeType: split-clue
---

# Pattern: Complementary Halves

- Experience goal: make teammates depend on each other's distinct evidence.
- Interaction shape: two private clues combine into one submission.
- ContentItem shape: `privatePayloadBySeat` plus accepted results.
- Answer payload: `{ "acceptedAnswers": [...] }`.
- Machine resolution: normalized exact match.
- Constraints: neither half sufficient; both relevant; one bounded result.
- Compatibility: Scopes with composable attributes, events, or relationships.
- Media: optional per-seat assets.
- Tension levers: asymmetric vocabulary and complementary context.
- Anti-patterns: duplicated clues, sacred-text fragmentation, ambiguous merge.
- Valid example: one teammate has faction, the other a distinctive action.
- Invalid example: both teammates receive near-identical descriptions.
