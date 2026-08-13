---
patternId: ordered-groups
owningChallengeType: split
---

# Pattern: Ordered Groups

- Experience goal: classification plus sequence reasoning.
- Interaction shape: place six to nine items into ordered stages or eras.
- ContentItem shape: item set, ordered group labels, canonical mapping.
- Answer payload: `{ "orderedGroups": [...], "itemToGroup": {...} }`.
- Machine resolution: exact mapping with fixed group order.
- Constraints: chronology or progression must be explicit and stable.
- Compatibility: Scopes with reliable eras, stages, or sequences.
- Media: optional.
- Tension levers: adjacent stages with recognizable distinctions.
- Anti-patterns: simultaneous events, disputed chronology, arbitrary ordering.
- Valid example: events grouped into three named tournament stages.
- Invalid example: characters ordered by subjective importance.
