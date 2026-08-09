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
stores `shared-fragments` gameplay material: the localized team `instruction`,
exactly two private `fragments`, `[2,3]`, and the author safety confirmation. It
does not duplicate these into the conceptual interaction/resolution pair. Each
ContentItem is one shared puzzle. Distribution is runtime-owned: two
participants hold one fragment each with the instruction randomly attached to
one holder; three participants hold the two fragments plus an instruction-only
third. The host screen carries no puzzle material. The runtime contract is
`authoring_only` until the product backend migrates from the retired
`three-segment-race` payload; see the canonical ركّبها definition.
