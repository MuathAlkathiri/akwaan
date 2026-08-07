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
authoritative backend-to-authoring contract.
