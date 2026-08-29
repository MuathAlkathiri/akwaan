---
name: challenge-type-rakkibha
description: Asymmetric visual-assembly mechanic — one private reference, private candidate pieces, verbal coordination to select the matching piece.
---

# ChallengeType: ركّبها (Rakkibha)

## Experience Goal

A cooperative team races another team by describing what each player privately
sees and agreeing which piece completes a shared visual puzzle. Communication is
the mechanic: no single player can see the whole solution.

## Social Dynamic

Roles are asymmetric and private:

- **Reference holder** — sees one incomplete reference (a missing cutout, an
  incomplete shape/path). No candidate controls. Describes the gap out loud.
- **Candidate holders** (one or two) — each sees a private set of two or three
  candidate pieces. Exactly one candidate holder owns the true matching piece; the
  other view may be distractor-only. Holders describe their pieces; the team
  reasons about which piece fits and who holds it.

The UI never reveals which holder owns the correct piece — that emerges only from
the spoken description. Any candidate holder may submit one of *their* local
candidates; the server maps `(participant, localId) → canonicalIdentity` and
resolves correctness. Correct advances to the next puzzle; wrong applies the
five-second team lock (the existing race penalty).

## Content Contract

- `mechanicPayload.variant`: `visual-assembly`.
- `instruction`: short Arabic, e.g. `صفوا الشكل ثم اختاروا القطعة المطابقة`.
- `reference.media`: the reference image (reference holder only).
- `candidateViews`: ≥ 2 views, unique ids; each has 2–3 candidates with unique
  `localId`s, a server-side `canonicalIdentity`, and media.
- `correctCanonicalIdentity`: matches **exactly one** candidate across all views.
- `supportedTeamSizes`: `[2, 3]`. `authorSafetyConfirmation`: `true` before ready.

## Hard Rules

- The correct answer lives only as `canonicalIdentity`; it is never shown to any
  phone and never written into `instruction`, `prompt`, or any visible `content`.
- No solution hints, arrows, coordinate labels, or "correct" markers in media —
  solving comes from the geometry and the players' descriptions.
- Vary the visual family across items (honeycomb, tangram, pipe network, tiles);
  keep the interaction identical.
- Two-player mode never gives the reference and the true-candidate view to the
  same participant.
