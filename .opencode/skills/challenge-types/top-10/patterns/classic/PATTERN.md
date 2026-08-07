---
patternId: classic
owningChallengeType: top-10
---

# Pattern: Classic Compatibility

- Experience Goal: preserve the existing ranked-list runtime without changing
  its established strikes, eliminations, point ladder, normalization,
  compatibility host controls, or legacy game-score finalization.
- Interaction shape: the existing compatibility runtime collects normalized
  ranked-list responses under its established flow.
- ContentItem shape: one compatibility ContentItem with exactly ten uniquely
  ranked entries.
- Interaction payload: `variant: classic` plus the established compatibility
  fields accepted by the runtime adapter.
- Resolution payload: ten ranked entries and normalized accepted responses.
- Machine resolution: the existing Arabic normalization and classic runtime
  rules remain unchanged.
- Constraints: exactly ten ranked entries; a missing variant resolves to
  `classic` only inside the compatibility adapter and never for new poison-deck
  authoring.
- Scope compatibility: only previously supported compatible material.
- Media compatibility: unchanged from the compatibility runtime.
- Valid example: an existing content record that already passes the classic
  adapter without transformation.
- Invalid example: a poison-deck record with its discriminator removed.
- Anti-patterns: generating new poison-deck behavior through classic fields,
  reinterpreting existing records, or silently changing scoring.

Classic is isolated compatibility behavior. Active poison-deck authoring never
defaults to or migrates through this Pattern.
