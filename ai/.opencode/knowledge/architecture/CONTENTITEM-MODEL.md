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

## Native Rakkibha Shape

`rakkibha` uses `mechanicPayload.variant: visual-assembly`: neutral instruction,
one private reference, private candidate views, server-only canonical identities,
`[2,3]`, and author safety confirmation. Authoring metadata records the actual
interaction pattern and expected player exchange; it does not branch runtime.
The host screen carries no puzzle material. See the canonical ركّبها definition.

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
