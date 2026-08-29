# ركّبها — authoring contract (`rakkibha`, visual-assembly)

Backend-to-authoring handoff. Everything below is taken from the implemented and
tested backend (`rakkibha.plugin.ts`, `validateRakkibhaPayload`), not a design
sketch. It is the source of truth for the content Skill and its validator.

Do not create a second copy of these rules. Extend the existing Skill.

## Canonical identity

| | |
| --- | --- |
| ChallengeType slug | `rakkibha` |
| Runtime / plugin key | `rakkibha` |
| `mechanicPayload.variant` | `visual-assembly` |
| Answer mode | `rakkibha` (challenge type); the item's `answerPayload` stays a machine mode, e.g. `match` |
| Puzzles per launch | 3 |
| Team sizes | `[2, 3]` |

## The interaction

One shared visual puzzle, split into **private, asymmetric roles**:

- **Reference holder** — sees one incomplete reference (`reference.media`); no
  candidate controls. Describes the missing shape out loud.
- **Candidate holders** — each sees a private `candidateView` of 2–3 candidate
  pieces. Exactly **one** candidate globally is the true match; the other view may
  be distractor-only. The correct piece need not appear on every phone.

The team talks, decides which piece fits and who holds it, and that holder submits
it. Correct → next puzzle. Wrong → the existing five-second team lock.

This is **not** the retired three-segment / shared-fragment / intersection model.
There are no `segments`, no `fragments`, no `twoPlayerMergeOptions`, no
`publicPrompt`.

## `mechanicPayload` shape

```jsonc
{
  "variant": "visual-assembly",
  "family": "visual-assembly",
  "instruction": { "ar": "صفوا الشكل ثم اختاروا القطعة المطابقة" },
  "reference": { "media": { "type": "image", "assets": [{ "url": "/reference.png" }] } },
  "candidateViews": [
    { "id": "holder-1", "candidates": [
      { "localId": "one", "canonicalIdentity": "match",   "media": { "type": "image", "assets": [{ "url": "/t1.png" }] } },
      { "localId": "two", "canonicalIdentity": "wrong-1", "media": { "type": "image", "assets": [{ "url": "/t2.png" }] } }
    ] },
    { "id": "holder-2", "candidates": [
      { "localId": "one", "canonicalIdentity": "wrong-2", "media": { "type": "image", "assets": [{ "url": "/d1.png" }] } },
      { "localId": "two", "canonicalIdentity": "wrong-3", "media": { "type": "image", "assets": [{ "url": "/d2.png" }] } }
    ] }
  ],
  "correctCanonicalIdentity": "match",
  "supportedTeamSizes": [2, 3],
  "authorSafetyConfirmation": true
}
```

The `answerPayload` stays where every mechanic's answer lives (e.g.
`{ "mode": "match", "acceptedAnswers": ["…"] }`). The real resolution is
candidate-based via `canonicalIdentity`.

## Rules the backend enforces

- `instruction.ar` non-empty.
- `reference.media` is valid media with a non-empty asset URL.
- `candidateViews`: at least two, unique `id`s.
- Each view: 2–3 candidates, unique `localId`s; each candidate has a non-empty
  `canonicalIdentity` and valid media.
- **Exactly one** candidate across all views matches `correctCanonicalIdentity`.
- `supportedTeamSizes` is exactly `[2, 3]`.
- `authorSafetyConfirmation: true` before an item is `ready`.

## Privacy & anti-leakage

- `canonicalIdentity` / `correctCanonicalIdentity` are **server-side only** and
  never projected to a phone. Never write them into `instruction`, `prompt`, a
  view's `content`, or a candidate's `content`.
- The media must not encode the solution: no arrows, coordinate labels, `T/X/Y`
  metadata, "correct" markers, or written geometric descriptions. Solving comes
  from the geometry and the players' spoken descriptions.
- The mechanic payload carries no answer/truth or runtime field.

## Art direction

Vary the visual family across items — honeycomb clusters, tangram/crystal
silhouettes, pipe/conduit networks, tile clusters — while keeping the interaction
identical (describe → compare → identify the matching piece). Distractors must be
close enough to force discussion but readable on a phone.
