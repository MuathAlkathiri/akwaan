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
exactly two private `fragments`, `[2,3]`, the author safety confirmation, and an
optional `puzzleFamily` tag naming the solving operation. It
does not duplicate these into the conceptual interaction/resolution pair. Each
ContentItem is one shared puzzle. Distribution is runtime-owned: two
participants hold one fragment each with the instruction randomly attached to
one holder; three participants hold the two fragments plus an instruction-only
third. The host screen carries no puzzle material. The runtime contract is
`authoring_only` until the product backend migrates from the retired
`three-segment-race` payload; see the canonical ركّبها definition.

## Native One Clue Shape

`one-clue` uses the same implementation-native separation: `answerPayload`
stores the one machine-resolvable truth (`mode: match` with `acceptedAnswers`)
and `mechanicPayload` stores `progressive-clues` gameplay material: exactly five
localized `clues` with `order` 1..5 and `value` 5, 4, 3, 2, 1. The truth is
never duplicated into `mechanicPayload`, the prompt, or metadata. One ContentItem
is one recognition ladder; a Challenge is exactly three items. Stage timing,
cumulative reveal, answerer assignment, elimination, progress, and score events
are runtime-owned. The runtime contract is `fully_playable`; see the canonical
بدليل واحد definition.
