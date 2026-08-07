---
patternId: bounded-identity
owningChallengeType: twenty-inquiries
---

# Pattern: Bounded Identity

- Experience goal: cooperative elimination of a familiar target.
- Interaction shape: private target plus deterministic yes/no exploration.
- ContentItem shape: target ID, candidate boundary, verified attributes.
- Answer payload: `{ "targetId": "...", "attributes": {...} }`.
- Machine resolution: exact target-ID match.
- Constraints: finite domain; stable binary attributes; recognizable target.
- Compatibility: entity-rich Scopes.
- Media: optional private target media.
- Tension levers: balanced attribute distribution and time pressure.
- Anti-patterns: unbounded sets, subjective traits, unstable affiliations.
- Valid example: identify one named playable character from a fixed roster.
- Invalid example: identify any historical person without a candidate boundary.
