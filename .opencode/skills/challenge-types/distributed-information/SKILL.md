---
name: challenge-type-distributed-information
description: Global two-team private-information race presented in Arabic as ركّبها.
---

# ChallengeType: Distributed Information / ركّبها

## Experience Goal
Create a fast cooperative full-picture moment where every participant owns necessary private information and teammates combine it before the opposing team.

## Social Dynamic
Two teams race simultaneously through urgent verbal exchange, clarification, correction, and one runtime-assigned answerer per item. Opponent pressure never exposes private information.

## Player Emotion
Confusion, urgency, discovery, an aha moment, relief, wrong-answer frustration, comeback tension, and shared victory.

## Interaction Pattern
Both teams receive the same three ContentItems in independently randomized runtime order. Each item has one public prompt and three private segments. Teammates communicate; only the runtime-assigned answerer submits.

## Thinking Pattern
Identify each holding, describe it precisely, combine A/B/C, reject misleading first interpretations, and agree on one machine-resolvable answer.

## Success Pattern
Every participant contributes necessary information, every approved 2+1 holding still needs the other participant, synthesis creates an aha moment, and the item works equally for team sizes two and three.

## Failure Pattern
One view solves alone, a 2-segment holder solves without the partner, contribution is decorative, combination is mere transcription, wording is ambiguous, private data leaks, or resolution needs host judgment.

## Input Contract
Canonical ID and runtime/plugin key are `distributed-information`; owned Pattern and variant are `three-segment-race`; wrapper answer mode is `distributed`. Each ContentItem stores native `answerPayload` and `mechanicPayload`. Supported inner answer modes are `match`, `closest`, and `multiple_choice`. Team sizes are exactly `[2,3]`.

## Resolution Contract
The first team to solve all three wins. At the 135-second deadline, more solved wins; if equal, the team that reached that count earlier wins; equal elapsed progress is a true tie. A non-tie winner receives one Match point. Wrong submissions cause a five-second team lock with unlimited later retries. Timing, progress, answerer schedule, order, lock state, and score events are runtime-owned.

## Content Structure
Exactly three independent ContentItems form one Challenge. Each item contains a localized public prompt, exactly three localized private segments identified A/B/C, at least one safe 2+1 merge, `[2,3]`, required author safety confirmation for ready status, and optional explanation. Correct truth exists only in `answerPayload`.

## Allowed Content Patterns
- `three-segment-race`

Safe constructions inside it include combined total, missing member, shared link, cross-reference, sequence/order, count after filtering, and deterministic visual assembly.

## Content Safety Rules
Every segment must be necessary, distinct, verbally describable, private, and insufficient alone. Reject sensitive fragmentation, subjective outcomes, spoiler/version violations, unsupported claims, and any item where knowledge replaces synthesis. Required confirmation: `راجعت التوزيع، ولا يستطيع لاعب واحد حل اللغز بمفرده.`

## Media Compatibility
Text-only is the default. Optional media belongs to its segment and is visible only to its assigned participant. Filenames, captions, subtitles, HUD text, alt text, labels, future-item media, shared screens, and player previews must not reveal private content or truth.

## Scope Compatibility
The mechanic is global; World, Scope, and Scope Knowledge provide only themed facts. Use stable, sourced relationships that can be split into necessary fragments. Respect every exclusion, spoiler boundary, and version boundary.

## Validation Rules
Validate canonical IDs; exact native objects; a non-empty Arabic public prompt; three unique A/B/C segments with content; `[2,3]`; at least one exhaustive non-overlapping 2+1 merge; safety confirmation when status is `ready`; supported inner mode; deterministic truth; no truth in mechanic data; no `metadata.notes`; no public/private leakage; Scope evidence; and three distinct items per Challenge.

## Anti-patterns
One sufficient segment, one-player-all-three distribution, unsafe merge, public fragment, teammate or opponent leakage, duplicated truth, JSON-string payload, authored participant IDs, answerer schedules, item orders, lock timestamps, progress, score events, host entry, host judgment, subjective result, or support for team size one or four.

## Contract Status

`fully_playable`: synchronized with the authoritative backend-to-authoring contract at `docs/content/DISTRIBUTED_INFORMATION_AUTHORING.md`.
