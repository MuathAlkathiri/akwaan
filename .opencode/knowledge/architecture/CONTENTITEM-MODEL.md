# ContentItem Model

```json
{
  "id": "stable-id",
  "scopeId": "world.scope",
  "compatibleChallengeTypeIds": ["read-your-opponent"],
  "patternId": "multiple-choice",
  "prompt": {"ar": "...", "en": "..."},
  "interactionPayload": {},
  "resolutionPayload": {},
  "media": null,
  "isReusableAcrossSessions": false,
  "metadata": {"sources": [], "validationStatus": "draft"}
}
```

Only the selected Pattern may refine the two payload objects. Explanations and
source notes belong in metadata and are never exposed before resolution.

## Native Distributed Information Shape

`distributed-information` uses the implementation-native separation:
`answerPayload` stores the one machine-resolvable truth and `mechanicPayload`
stores `three-segment-race` gameplay material. It does not duplicate these into
the conceptual interaction/resolution pair. Its dedicated schema follows the
authoritative backend-to-authoring contract, including the requirement that
every one of the three canonical 2+1 partitions be non-solving because the
runtime draws a random partition for two-player teams. `mechanicPayload` must
carry the machine-readable `candidateSets` safety record — per segment A/B/C
the finite candidate subset its clue leaves standing — whose geometry (segment
sets ≥2, pair intersections ≥2, triple intersection exactly the ground truth)
the validator enforces.
