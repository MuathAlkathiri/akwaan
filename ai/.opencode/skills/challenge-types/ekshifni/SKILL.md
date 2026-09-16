---
name: challenge-type-ekshifni
description: Signature Celebrities World mechanic featuring progressive reveal of a real-person photograph under six numbered masks.
---

# ChallengeType: اكشفني (ekshifni)

## Identity & Player Experience
A progressive reveal game. Teams take turns buying information by lifting one of six numbered masks covering a celebrity photograph. The less information bought, the higher the points scored.

## Item Structure
`itemStructure: discrete_triple`
Three items per challenge. The core payload contains exactly ONE authentic real-person image asset and EXACTLY SIX author-defined masks.

## Payload Contract
`mode: ekshifni`
- `targetAnswer`: The primary name of the celebrity.
- `acceptedAnswers`: An array of strings representing valid answer aliases (e.g. Arabic variations, English name).
- `regions`: Exactly 6 region objects representing the masks. Each must have:
  - `localId`: A unique stable identifier (e.g. "region-1")
  - `role`: Exactly one of: `eyes`, `hair-head`, `mouth-facial-hair`, `outfit`, `background`, `distinctive-detail`. Each role must appear exactly once.
  - `shape`: A geometry object with `x`, `y`, `width`, `height` defined as fractions of the natural image dimensions (between 0.0 and 1.0).

## Content Semantics & Mask Geometry
- **Authentic Real Person:** ONLY authentic real-person photography. No AI-generated, synthetic, lookalike, or generic models.
- **Subject Prominence:** The celebrity must dominate the frame, with a clear face/upper body.
- **Progressive Reveal:** Masks must be designed to create tension. Avoid one mask giving away the entire face, or masks covering purely irrelevant background.
- **Fractional Coordinates:** Mask shapes MUST strictly fall within `0.0` to `1.0`. `x + width <= 1.0` and `y + height <= 1.0`.

## Modality Constraints
- Allowed: `image`
- FORBIDDEN: `audio`, `video`, `none`

## Anti-Patterns
- Fixed-ratio cropping that breaks the fractional geometry.
- Text or logos leaking identity outside of masked regions.
- Background masks that provide zero value to the players.
- Masks that overlap accidentally leaving key identifying features visible.

## QA Gates
- `AUTHENTIC_REAL_PERSON_ONLY`
- `EKSHIFNI_REGION_COUNT_VALID`
- `EKSHIFNI_REGION_ROLES_UNIQUE`
- `EKSHIFNI_GEOMETRY_FRACTIONAL`
