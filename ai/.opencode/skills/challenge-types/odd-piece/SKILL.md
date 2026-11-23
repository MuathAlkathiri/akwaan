---
name: challenge-type-odd-piece
description: Cars Signature authoring contract for القطعة الدخيلة — one photograph of a real vehicle with exactly one part changed, and the team points at it.
---

# ChallengeType: Odd Piece / القطعة الدخيلة

Load this skill before authoring, reviewing, or validating Odd Piece content.
Read the Cars Scope profile you are authoring into, and
`.agents/skills/akwaan-media/SKILL.md` — this mechanic is media-native, and the
`ODD_PIECE_AUTHENTIC_PART_COMPOSITION` rules there are binding on every asset.

Odd Piece is the Cars **Signature**. The players see **one photograph of a real
vehicle in which exactly one part is not its own** — the front grille, the
headlights, the exhaust tips, the steering wheel, the gear selector, a wheel, a
mirror, a tail-light. The teams race to point at the part that does not belong.

This is **not** «وش اسم السيارة؟», and it is not a spot-the-difference between
two pictures. Nobody is shown the original until the reveal. It tests whether
players know a car well enough to see that one of its parts is wrong.

There is one contract. An earlier one — four separate part images, pick the
intruder — was retired and removed; do not author, describe or migrate to it.

## Experience Goal

Create a simultaneous visual recognition race where both teams study the same
photograph and the surer eye wins — then prove the answer by showing the real,
untouched car, so the room sees why it was right.

## Social Dynamic

Both teams discuss out loud at the same time. The photograph is on the shared
screen and on every eligible phone, and anyone may zoom and pan from the start.
Nothing is private. The pressure is public and symmetric: anyone can press
«جاوب», and the first valid team claim takes the answer.

## Player Emotion

"Wait — that's not this car's grille." Recognition, then the nerve to commit
before the other team does. The reveal must make the losing team say "of
course", never "says who?".

## Interaction Pattern

1. **Discussion.** The photograph appears for both teams. Default window is a
   configurable **30 seconds** — a technical/playtest value, not locked product
   design.
2. **Claim.** Any player may press «جاوب» for their team. The first valid
   authoritative claim owns the answer and stops the discussion clock for good.
3. **Answer.** The claiming team gets **five seconds** and **one tap** on the
   photograph, on the part they believe is the intruder.
4. **Handoff.** A wrong tap or a timeout gives the other team its own
   independent five-second attempt at the **same** puzzle. They never see where
   the first team tapped, and the point is never handed over automatically.
5. **Reveal.** The changed part is outlined on the photograph, named, and
   compared with the original image.

One Challenge is **three puzzles**: one easy, one medium, one hard, played in
that order. If nobody claims before the discussion ends, the puzzle resolves
with no points.

## Thinking Pattern

Know the car, then check it part by part: light signature, grille and vent
geometry, wheel design, exhaust layout, steering wheel and switchgear, gear
selector, screen layout, stitching and trim, body lines. The answer comes from
*automotive identity*, never from image forensics.

## Success Pattern

A player recognises that one part's design language belongs to another car or
era, commits, taps it, and can justify it in one sentence after the reveal.

## Failure Pattern

Both teams tap wrong, time out, or nobody claims. The reveal still runs in full
— the proof is owed to the room regardless of outcome.

## Input Contract

Canonical ID and runtime key are `odd-piece`; Cars **Signature**; item answer
mode is `odd_piece` (`ChallengeAnswerMode.ODD_PIECE`), which is compatible only
with itself. `answerPayload` is exactly `{ mode: "odd_piece" }`.

One ContentItem is one puzzle. Each item carries `mechanicPayload`:

| Field | Requirement |
|---|---|
| `variant` | `odd-piece` |
| `version` | `2` — the only contract. A payload with no version, or version 1, is refused |
| `difficulty` | `easy`, `medium` or `hard` |
| `targetVehicleIdentity` | canonical slug of the vehicle in the photograph — server-only |
| `targetVehicleLabel` | its player-facing name, shown only in the reveal |
| `intruderVehicleIdentity` | canonical slug of the vehicle the changed part comes from — server-only; must differ from the target |
| `intruderVehicleLabel` | its player-facing name, shown only in the reveal |
| `intruderPartIdentity` | canonical slug of the changed part (`front-grille`, `gear-selector`) — server-only |
| `intruderPartLabel` | the part's Arabic name, shown only in the reveal |
| `modifiedImage` | the photograph players see, with the part changed |
| `originalImage` | the same photograph, untouched — the proof shown at reveal |
| `hotspot.polygon` | at least 3 points, each `x`/`y` between 0 and 1, tracing the changed part |
| `hotspot.tolerance` | how far outside the outline a tap still counts; 0 to 0.25 |

Each image (`modifiedImage`, `originalImage`) carries:

| Field | Requirement |
|---|---|
| `media` | exactly one image asset with a non-empty URL |
| `width`, `height` | positive integers, the image's real pixel size |
| `orientation` | `landscape`, `portrait` or `square`, matching the dimensions |
| `provenance.assetOrigin` | `authentic` or `ai-edited` |
| `provenance.sourceUrl` | required |
| `provenance.editedRegion`, `provenance.editModel` | required when `assetOrigin` is `ai-edited` |

The two images must have **identical dimensions**: the hotspot is stored as
fractions of the image, and the reveal lays one over the other.

## Resolution Contract

A tap is correct when it lands inside `hotspot.polygon`, or within
`hotspot.tolerance` of it. Grading is server-authoritative. No client receives
the hotspot, the original image, or any identity before resolution, and a wrong
tap's coordinates are never stored or shown. Claim priority, lockout, timers,
scoring, Fair-Start and ownership are runtime-owned — authoring supplies
content only.

**Mandatory reveal.** After every puzzle resolves — correct, transferred, timed
out, or unclaimed — the shared result outlines the changed part, names it,
names both vehicles, and shows the original. A missing original is a
content-readiness failure, never a reason to skip the reveal.

## Content Structure

One Challenge needs exactly **three** READY items in the same World: one
`easy`, one `medium`, one `hard`. They are played easy → medium → hard.

Worked example — one puzzle:

```
prompt:                  "أين القطعة الدخيلة؟"
difficulty:              easy
targetVehicleIdentity:   bmw-m4-g82-2021        "BMW M4 (G82)"
intruderVehicleIdentity: mercedes-amg-c63-w206  "Mercedes-AMG C63 (W206)"
intruderPartIdentity:    front-grille           "الشبك الأمامي"
modifiedImage:           the M4, front three-quarter, wearing the C63's grille
originalImage:           the same photograph, untouched
hotspot.polygon:         traces the grille only
hotspot.tolerance:       0.02
```

The prompt asks *where*. It never names a vehicle or a part.

## Allowed Content Patterns

Difficulty comes from how close the two vehicles are and how small the part is,
never from obscurity:

- **Easy — cross-marque, large part.** A grille, a full headlight cluster or a
  wheel from a clearly different maker.
- **Medium — same class, medium part.** A rival's tail-light, exhaust layout or
  steering wheel.
- **Hard — same maker or sibling model, small part.** A gear selector, mirror
  cap or light signature from a closely related car. It must still be decidable
  from design detail by someone who knows the cars, not a coin flip.

Vary the part across a Challenge's three puzzles: three grilles in a row is a
drill, not a game. Exterior and interior photographs are both valid.

## Content Safety Rules

No money, body shape or weight, religion, romantic relationships, intelligence
judgements, or awkward family-group topics. No identifiable people in the
frame. No number plates, VINs, dealership names, or anything that identifies a
private owner.

## Media Compatibility

Two images per puzzle, each exactly one image asset. Audio, video and `none`
are invalid.

**One change, and only one.** Exactly one part differs between the modified
image and the original. No second edit, however small. The changed part must
not also appear unchanged elsewhere in the frame — a car showing both its own
wheel and the intruder wheel answers itself.

**Visual fairness — the core rule of this mechanic.** The changed part must be
findable by *automotive knowledge alone*. It must never be findable by:

- a visible seam, halo, blur or cut-out edge
- a mismatch in lighting, shadow, reflection, white balance or colour grade
- wrong perspective, scale or fitment
- a resolution, sharpness or compression difference from the rest of the image

This is why localized editing is permitted — see
`ODD_PIECE_AUTHENTIC_PART_COMPOSITION` in `.agents/skills/akwaan-media/SKILL.md`.
Editing exists to make the swap indistinguishable from a photograph, never to
leave a tell.

**Leakage.** No badges, model names, marque logos, watermarks, UI overlays or
captions that identify either vehicle before the reveal. Asset URLs, file names
and alt text must not contain a vehicle or part identity either — the policy
rejects them (`ODD_PIECE_ANSWER_LEAK`).

**Authenticity.** The photograph is of a real vehicle, and the changed part is
a real part of a different real vehicle. The original image is the authentic,
unedited photograph. Record source and licence information for both images.

**Hotspot.** Trace the changed part itself, tightly. It has to be tappable on a
phone, so a very small part needs a sensible tolerance — but a tolerance that
swallows the neighbouring parts makes a wrong answer correct.

## Scope Compatibility

Cars World only — `odd-piece` is bound to `cars` and is not intended to run in
other Worlds. Canonical Cars Scopes in the authoring manifest are `cars-mix`,
`german-cars`, `japanese-cars`, `supercars`. Respect each Scope's boundary: a
German-cars puzzle should use vehicles that belong in that Scope's world of
reference, for the target and for the part's donor.

## Validation Rules

Backend `odd-piece-content.policy.ts` is the gate that actually holds:

| Blocker | Meaning |
|---|---|
| `ODD_PIECE_V2_PAYLOAD_REQUIRED` | `variant` is not `odd-piece`, or `version` is not `2` |
| `ODD_PIECE_DIFFICULTY_INVALID` | difficulty is not easy, medium or hard |
| `ODD_PIECE_TARGET_REQUIRED` | target vehicle identity or label missing |
| `ODD_PIECE_INTRUDER_REQUIRED` | intruder vehicle or part identity or label missing |
| `ODD_PIECE_IDENTITIES_MUST_DIFFER` | target and intruder are the same vehicle |
| `ODD_PIECE_IMAGE_INVALID` | an image lacks exactly one image asset |
| `ODD_PIECE_IMAGE_DIMENSIONS_INVALID` | width or height is not a positive integer |
| `ODD_PIECE_IMAGE_ORIENTATION_INVALID` / `_MISMATCH` | orientation missing or contradicts the dimensions |
| `ODD_PIECE_IMAGE_DIMENSIONS_MISMATCH` | modified and original images differ in size |
| `ODD_PIECE_PROVENANCE_INVALID` | `assetOrigin` is not `authentic` or `ai-edited` |
| `ODD_PIECE_SOURCE_REQUIRED` | no `sourceUrl` in the provenance record |
| `ODD_PIECE_EDIT_PROVENANCE_REQUIRED` | an AI-edited image lacks `editedRegion` or `editModel` |
| `ODD_PIECE_ANSWER_LEAK` | an identity appears in the prompt or in the modified image's URL, path, file name or alt text |
| `ODD_PIECE_HOTSPOT_INVALID` | the outline has fewer than 3 points, a point outside 0–1, or has a zero-length or self-crossing edge |
| `ODD_PIECE_HOTSPOT_TOLERANCE_INVALID` | tolerance outside 0–0.25 |
| `ODD_PIECE_ITEM_NOT_READY` | an item is not READY at launch |
| `ODD_PIECE_PROMPT_REQUIRED` | no Arabic prompt |
| `ODD_PIECE_WORLD_MISMATCH` | an item is outside the Challenge's World |
| `ODD_PIECE_REQUIRES_THREE_ITEMS` | a Challenge needs exactly three distinct puzzles |
| `ODD_PIECE_DIFFICULTY_SET_INVALID` | the three are not one easy, one medium, one hard |

**Factual verification — required before approval.** Confirm against evidence,
not memory:

1. The photograph is the vehicle named in `targetVehicleIdentity`, including
   generation and facelift.
2. The changed part genuinely belongs to the vehicle named in
   `intruderVehicleIdentity`. A facelift part on a pre-facelift donor is a
   factual error.
3. The part named in `intruderPartIdentity` is the part that was changed, and
   the only one.
4. The original image is the same photograph before the change.

Record the source for each claim. An unverifiable identity is not "probably
fine" — it is unresolved, and unresolved content does not reach players.

**Ambiguity prevention.** Before approval, check that:

- exactly one part is defensibly wrong — if a second part could be argued as
  not belonging (an aftermarket wheel on the original car, a rare factory
  option), the puzzle is broken
- the donor is not so close (same platform, rebadged twin, shared parts bin)
  that the part is genuinely fitted to both cars
- the part is large and clear enough to be judged at shared-screen distance
- the outline covers the changed part and nothing a wrong answer would hit

**Human visual inspection is mandatory.** `NO_FALSE_VISUAL_VERIFICATION`
applies: filenames, dimensions, OCR and download IDs never establish that an
image shows the right car, or that an edit is clean.

## Anti-patterns

Common rejection reasons:

- **Spot-the-difference** — the part is found by noticing an edit, a lighting
  change or a seam. Fatal; the mechanic has been replaced.
- **Badge leakage** — a visible logo or model name answers the puzzle.
- **More than one change** — a second altered part makes the answer ambiguous.
- **The part is shown twice** — the original part is still visible elsewhere.
- **A shared part** — the "intruder" is also fitted to the target car.
- **Wrong identity** — the photograph or the part is not what the payload
  claims. `WRONG_ASSET_IS_FATAL`; replace the item, do not patch it.
- **Obscure-for-obscure** — a 1970s trim variant nobody can recognise. Hard is
  fine; unrecognisable is not.
- **Loose or sloppy outline** — a hotspot that includes neighbouring parts, or
  a tolerance large enough to make wrong taps correct.
- **Missing or different original** — the original is mandatory and must be the
  same photograph at the same size.
- **Private-owner leakage** — plates, VINs, dealer branding, bystanders.
- **Synthesized vehicle or fabricated part** — prohibited outright.
- **Four separate part images** — the retired contract. Never author it.

## Contract Status

Mechanic implementation: ✅ **IMPLEMENTED & VERIFIED IN SOURCE** — one gameplay
plugin, launcher, content policy, Admin authoring with a hotspot editor,
shared-screen and phone frontend, Fair-Start integration.

Cars World rollout and Production content/media: see
`GAME_NEW_SYSTEM_ROADMAP.md` §16.7. Public World availability does **not** prove
odd-piece content readiness or production gameplay.

Authoring contract: this file plus `ODD_PIECE_AUTHENTIC_PART_COMPOSITION` in
`.agents/skills/akwaan-media/SKILL.md`.
