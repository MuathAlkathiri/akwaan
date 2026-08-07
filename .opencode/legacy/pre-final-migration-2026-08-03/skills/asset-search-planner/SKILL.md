---
name: asset-search-planner
description: Converts a Akwaan question intent into ranked, Media-specific Asset search queries.
---

# Asset Search Planner

Use this Skill before any image, video, or audio search. It plans queries; it
does not select, download, or approve Assets.

Load applicable `query-strategy` approvals from
`../../learning/approval-history.json`. Repeated successful query structures may
receive a small ranking boost at the same Subject or Catalog scope. One result
does not make a source or query globally trusted, and current intent/rejection
rules always take precedence.

## Input Contract

Receive or infer:

- Subject and Catalog;
- Content Pattern and intended answer;
- scene, event, action, object, location, or sound;
- target Media type and audience accessibility;
- required observation that makes the Media essential;
- visible text, names, subtitles, spoilers, or overlays to exclude.

Do not expose the internal search query to players. An answer may appear in an
internal query only when necessary to locate the correct scene, but it must
never be copied into a player-visible filename, caption, title, or description.

## Query Planning

Produce several candidates, ranked from narrowest and most faithful to broadest:

1. exact scene or event;
2. character plus action;
3. location plus event;
4. episode, gameplay, match, broadcast, or official-clip context;
5. broader fallback that still preserves the intended event.

Queries should be compact noun/action phrases rather than question prose. Never
search only the Subject name or `<Subject> image`.

Media-specific preferred terms:

- image: `episode screenshot`, `scene frame`, `gameplay screenshot`,
  `official still`, `match photo`, `close-up`, `in-game`, `episode frame`;
- video: `official clip`, `episode scene`, `gameplay clip`, `match highlight`;
  use `official trailer` only when no better scene source is available;
- audio: `official audio`, `isolated dialogue`, `voice line`, `soundtrack`,
  `commentary clip`, `song excerpt`.

Default negative terms:

`poster`, `wallpaper`, `edit`, `fan edit`, `fan art`, `tribute`, `AMV`,
`compilation`, `reaction`, `meme`, `TikTok`, `Shorts`.

For Call of Duty, bind every query to the verified official title and intended
mode before searching. Combine title + exact content class + required item or
observation + `gameplay screenshot`, `gameplay frame`, `original game audio`,
or `short gameplay clip`. Useful forms include `Black Ops 2 Raid map gameplay
screenshot`, `Modern Warfare 2 UMP45 first person gameplay screenshot`, and
`Modern Warfare 2 Harrier Strike killstreak sound`. Add `montage`, `remastered
music`, `cover`, `fake`, `mod`, and `custom map` to negative terms. Never use an
Arabic community number as the only title discriminator.

Remove a negative term only when the resolved Catalog or Content Pattern
explicitly requires that source type. Do not substitute actor names for
character names, join unrelated scenes, or optimize for promotional material.

## Output Contract

Return an internal Asset search plan:

```json
{
  "primaryQuery": "Naruto Sasuke Valley of the End battle episode screenshot",
  "fallbackQueries": [
    "Naruto Sasuke final valley fight scene frame",
    "Naruto Valley of the End episode still"
  ],
  "negativeTerms": ["poster", "wallpaper", "fan art", "edit"],
  "desiredSourceTypes": ["episode screenshot", "official scene still"],
  "rejectedSourceTypes": ["poster", "fan art", "AI-altered image"],
  "targetMediaType": "image",
  "sceneIntent": "observe the action in the Valley of the End battle",
  "leakageRisks": ["subtitles naming the answer", "answer in thumbnail text"]
}
```

Before searching, normalize the intent from Subject, event/scene, required
observation, Content Pattern, and Media type, then check
`../../cache/search-history.json`. A Subject-only match is insufficient.

Record `POOR_SEARCH_QUERY` when a query is generic, mixes events, targets the
wrong Media type, or repeatedly returns rejected source types.

Return any positive query-strategy match and boost for generation metrics.
Query success never bypasses current search-cache validity or Asset ranking.
