---
name: challenge-type-odd-piece
description: Cars Signature authoring contract for القطعة الدخيلة — four car parts, three from one vehicle and one intruder.
---

# ChallengeType: Odd Piece / القطعة الدخيلة

Load this skill before authoring, reviewing, or validating Odd Piece content.
Read the Cars Scope profile you are authoring into, and
`.agents/skills/akwaan-media/SKILL.md` — this mechanic is media-native, and the
`ODD_PIECE_AUTHENTIC_PART_COMPOSITION` rules there are binding on every asset.

Odd Piece is the Cars **Signature**. Four car parts are shown; exactly three
belong to one vehicle and one belongs to a different vehicle. The teams race to
name the intruder.

This is **not** «وش اسم السيارة؟». It tests whether players can compare
automotive visual identity across headlights, interiors, steering wheels,
wheels, dashboards, rear lights and body details.

## Experience Goal

Create a simultaneous visual recognition race where both teams study the same
four parts and the faster, surer eye wins — then prove the answer with the real
car, so the room sees why it was right.

## Social Dynamic

Both teams discuss out loud at the same time, looking at one shared screen.
Nothing is private. The pressure is public and symmetric: anyone can press
«جاوب», and the first valid team claim takes priority.

## Player Emotion

"Wait — that interior isn't the same car." Recognition, then the nerve to commit
before the other team does. The reveal must make the losing team say "of course",
never "says who?".

## Interaction Pattern

The shared screen shows four numbered parts. Any player may claim for their team;
the first valid authoritative submission represents that team and locks their
teammates out of duplicate submissions. The claiming team then selects which of
the four is the intruder.

- Correct → that team wins the puzzle.
- Wrong → their attempt is consumed and the **opposing team gets the same
  puzzle**. They must still make their own selection; the point is not handed
  over because the first team failed.

Default open window is a configurable **30 seconds**
(`ODD_PIECE_DEFAULT_OPEN_SECONDS`) — a technical/playtest value, not locked
product design.

## Thinking Pattern

Compare design language across parts: light signatures, grille and vent
geometry, switchgear and screen layout, stitching and trim, wheel spoke design,
badge-free body lines. The answer comes from *automotive identity*, never from
image forensics.

## Success Pattern

A player recognises that one part's design language belongs to another marque or
era, commits, and can justify it in one sentence after the reveal.

## Failure Pattern

Both teams fail, or the first team answers wrong and the second also misses. The
reveal still runs in full — the proof is owed to the room regardless of outcome.

## Input Contract

Canonical ID and runtime key are `odd-piece`; Cars **Signature**; item answer
mode is `odd_piece` (`ChallengeAnswerMode.ODD_PIECE`), which is compatible only
with itself.

One Challenge is **exactly 3 ContentItems** (`ODD_PIECE_ITEM_COUNT`), each one
puzzle. Each item carries `mechanicPayload` of variant `odd-piece`:

| Field | Meaning |
| --- | --- |
| `targetVehicleIdentity` | canonical slug of the vehicle owning **three** pieces — server-only |
| `targetVehicleLabel` | player-facing name, shown **only** in the reveal |
| `targetVehicleReveal` | the full target-vehicle image — **mandatory** |
| `pieces[]` | exactly **4** (`ODD_PIECE_VISUAL_COUNT`) |

Each piece carries:

| Field | Meaning |
| --- | --- |
| `localId` | stable, unique within the puzzle; a recorded answer must never drift to another piece |
| `vehicleIdentity` | **server-only grading identity**; never projected while the puzzle is live |
| `vehicleLabel` | player-facing, used **only** in post-resolution proof |
| `media` | exactly **one** image asset |

**The identity split is exact: three pieces share the target identity, one does
not.** Expressed in code as a sorted count of `1,3`.

## Resolution Contract

The intruder is the single piece whose `vehicleIdentity` differs from
`targetVehicleIdentity`. Grading is server-authoritative; no client sees an
identity before resolution. Claim priority, lockout, timers, scoring,
Fair-Start generation and ownership are runtime-owned — authoring supplies
content only.

**Mandatory reveal.** After every puzzle resolves — correct, transferred, or
both teams failed — the shared result must show which piece was the intruder,
name the target vehicle, and display the **full target-vehicle image**. Missing
reveal media is a content-readiness failure, never a reason to skip the reveal.

## Content Structure

A Challenge of three puzzles rises in difficulty, and difficulty comes from
*visual proximity*, not obscurity:

| Puzzle | Relationship | Example shape |
| --- | --- | --- |
| 1 | clearly different vehicles / visual languages | German saloon vs Japanese kei car |
| 2 | closer class, maker, or design era | two German performance saloons |
| 3 | strong similarity — related models, shared platform, facelift siblings | same maker, adjacent generations |

Worked example (puzzle 1):

```
prompt:                 { ar: "ثلاث قطع من نفس السيارة. أي قطعة دخيلة؟" }
targetVehicleIdentity:  "bmw-m4-g82-2021"        # server-only
targetVehicleLabel:     "BMW M4 (G82)"           # reveal only
targetVehicleReveal:    1 image — the real, unedited M4
pieces:
  piece-1  bmw-m4-g82-2021   "BMW M4 (G82)"           headlight
  piece-2  bmw-m4-g82-2021   "BMW M4 (G82)"           steering wheel
  piece-3  bmw-m4-g82-2021   "BMW M4 (G82)"           wheel
  piece-4  mercedes-amg-c63-w205-2019  "Mercedes-AMG C63"  interior screen   ← intruder
```

Identity counts: `bmw-m4-g82-2021 → 3`, `mercedes-amg-c63-w205-2019 → 1`. Split
is `1,3`. ✅

## Allowed Content Patterns

- **Cross-marque contrast** — three parts from one car, intruder from a clearly
  different maker. Best for puzzle 1.
- **Same-class confusion** — intruder from a rival in the same segment.
- **Same-maker, different model** — hardest honest pattern; the intruder must
  still be identifiable from design detail, not from a badge.
- **Part-type diversity** — prefer four *different* part types (light, interior,
  wheel, detail) so the comparison is about identity, not about one feature.

## Content Safety Rules

No money, body shape or weight, religion, romantic relationships, intelligence
judgements, or awkward family-group topics. No identifiable people in the
frame — these are vehicle parts, not portraits. No number plates, VINs,
dealership names, or anything that identifies a private owner.

## Media Compatibility

Every piece and the reveal is **exactly one image asset** — `media.type: image`
with a single asset whose URL is non-empty. Audio, video and `none` are invalid.

Media intents, one per asset, stating: target vehicle (make, model, generation,
year), the part type, the required framing, and the leakage constraints.

**Visual fairness — the core rule of this mechanic.** The intruder must be
findable by *automotive knowledge alone*. It must never be findable by:

- resolution, sharpness, or compression mismatch
- lighting, white-balance, or colour-grade mismatch
- background or backdrop discontinuity
- crop style, aspect ratio, or zoom-level mismatch
- edit artifacts, halos, or obvious cut-outs

Harmonize the four pieces so they read as one set. This is why localized editing
is permitted — see `ODD_PIECE_AUTHENTIC_PART_COMPOSITION` in
`.agents/skills/akwaan-media/SKILL.md`. Editing exists to **remove** shortcuts,
never to create them.

**Leakage.** No badges, model names, marque logos, watermarks, UI overlays,
filenames or captions that identify a vehicle before the reveal. A visible
roundel on the headlight makes the puzzle trivial.

**Authenticity.** Every part must be a real part of a real vehicle. The reveal
must show the authentic target vehicle, unedited. Record source and licence
information for every asset.

## Scope Compatibility

Cars World only — `odd-piece` is bound to `cars` and is not intended to run in
other Worlds. Canonical Cars Scopes in the authoring manifest are `cars-mix`,
`german-cars`, `japanese-cars`, `supercars`. Respect each Scope's boundary: a
German-cars puzzle should contrast vehicles that belong in that Scope's world of
reference.

## Validation Rules

Backend `odd-piece-content.policy.ts` is the gate that actually holds:

| Blocker | Meaning |
| --- | --- |
| `ODD_PIECE_PAYLOAD_REQUIRED` | `mechanicPayload.variant` is not `odd-piece` |
| `ODD_PIECE_TARGET_REQUIRED` | target identity and reveal label both required |
| `ODD_PIECE_IMAGE_INVALID` | a piece or the reveal lacks exactly one image asset |
| `ODD_PIECE_VISUAL_COUNT_INVALID` | not exactly four pieces |
| `ODD_PIECE_LOCAL_IDS_INVALID` | missing or duplicate `localId` |
| `ODD_PIECE_IDENTITY_INVALID` | a piece lacks identity or label |
| `ODD_PIECE_IDENTITY_SPLIT_INVALID` | the split is not exactly three-plus-one |
| `ODD_PIECE_TARGET_MISMATCH` | `targetVehicleIdentity` does not own the three |
| `ODD_PIECE_PROMPT_REQUIRED` | a puzzle lacks Arabic copy |
| `ODD_PIECE_ITEM_NOT_READY` | an item in the launch set is not READY |
| `ODD_PIECE_WORLD_MISMATCH` | an item is outside the Challenge's World |
| `ODD_PIECE_REQUIRES_THREE_ITEMS` | a Challenge needs exactly three puzzles |

**Factual verification — required before approval.** For every piece, confirm
against evidence, not memory:

1. The part genuinely belongs to the vehicle named in `vehicleIdentity`,
   including generation and facelift. A facelift light cluster on a pre-facelift
   car is a factual error.
2. The intruder genuinely belongs to a *different* real vehicle, and is
   attributable to it.
3. The reveal image depicts the same vehicle as `targetVehicleIdentity`.
4. Identity slugs are internally consistent across all three puzzles of a
   Challenge.

Record the source for each claim. An unverifiable part identity is not
"probably fine" — it is unresolved, and unresolved content does not reach
players.

**Ambiguity prevention.** Before approval, check that:

- exactly one defensible answer exists — if two pieces could each be argued as
  the intruder, the puzzle is broken
- the three matching pieces are from the *same* vehicle identity, not merely the
  same marque or family
- the intruder is not so close (same platform, rebadged twin) that the
  distinction is a coin flip
- the crop retains enough genuine identity to be solvable at shared-screen
  distance

**Human visual inspection is mandatory.** `NO_FALSE_VISUAL_VERIFICATION`
applies: filenames, dimensions, OCR and download IDs never establish that an
image shows the right car.

## Anti-patterns

Common rejection reasons, in the order they actually occur:

- **Spot-the-difference** — the intruder is found by noticing an edit, a
  lighting change or a crop mismatch. Fatal; the mechanic has been replaced.
- **Badge leakage** — a visible logo or model name answers the puzzle.
- **Wrong part identity** — the asset depicts a different car than claimed.
  `WRONG_ASSET_IS_FATAL`; replace the item, do not patch it.
- **Two defensible answers** — ambiguity; the puzzle cannot be graded fairly.
- **Obscure-for-obscure** — a 1970s trim variant nobody can recognise. Hard is
  fine; unrecognisable is not.
- **Four parts of the same type** — four headlights makes the puzzle about one
  feature instead of vehicle identity.
- **Missing or mismatched reveal** — the reveal is mandatory and must show the
  authentic target vehicle.
- **Private-owner leakage** — plates, VINs, dealer branding, bystanders.
- **Synthesized vehicle or fabricated part** — prohibited outright.

## Contract Status

Mechanic implementation: ✅ **IMPLEMENTED & VERIFIED IN SOURCE** — plugin,
launcher, content policy, Admin authoring fields, shared-screen and phone
frontend, Fair-Start integration.

Cars World rollout and Production content/media: see
`GAME_NEW_SYSTEM_ROADMAP.md` §16.7. Public World availability does **not** prove
odd-piece content readiness or production gameplay.

Authoring contract: this file plus `ODD_PIECE_AUTHENTIC_PART_COMPOSITION` in
`.agents/skills/akwaan-media/SKILL.md`.
