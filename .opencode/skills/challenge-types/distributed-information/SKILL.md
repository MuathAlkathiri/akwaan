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
Both teams receive the same three ContentItems in independently randomized runtime order. Each item has one public prompt and three private segments. Teammates communicate; only the runtime-assigned answerer submits. Wrong submissions lock that team for five seconds while the main clock keeps running; the answer is never revealed during the item.

## Thinking Pattern
Identify each holding, solve its mini-puzzle alone to derive a World clue, describe the clue precisely, combine the three derived clues with World knowledge, reject misleading first interpretations, and agree on one machine-resolvable answer.

## Success Pattern
Every participant solves a genuine mini-puzzle and contributes necessary derived information, every possible two-player holding still needs the partner, synthesis creates an aha moment, and the item works equally for team sizes two and three.

## Failure Pattern
One view solves alone, a two-segment holder solves without the partner, contribution is decorative (mere transcription or read-aloud), a clue is the final answer rather than a derived World fact, the puzzle resolves by counting or arithmetic instead of World knowledge, wording is ambiguous, private data leaks, or resolution needs host judgment.

## Input Contract
Canonical ID and runtime/plugin key are `distributed-information`; owned Pattern and variant are `three-segment-race`; wrapper answer mode is `distributed`. Each ContentItem stores native `answerPayload` and `mechanicPayload`. Supported inner answer modes are `match`, `closest`, and `multiple_choice`. Team sizes are exactly `[2,3]`, and each Challenge uses exactly three ContentItems that both teams play in independently randomized order.

## Resolution Contract
The first team to solve all three wins. At the 135-second deadline, more solved wins; if equal, the team that reached that count earlier wins; equal elapsed progress is a true tie. A non-tie winner receives one Match point. Wrong submissions cause a five-second team lock; the clock continues and retries remain unlimited. Three-player teams each answer once in random order; two-player teams alternate from a random start. The runtime deals a random two-plus-one holding to two-player teams, so every one of the three possible partitions must be non-solving. Timing, progress, order, answerer, lock state, and score events are runtime-owned. There is no hint mechanic and no in-race reveal of correct truth.

## Content Structure
Exactly three independent ContentItems form one Challenge. Each item contains a localized public prompt, exactly three localized private segments identified A/B/C with distinct content, at least one exhaustive non-overlapping 2+1 merge, `[2,3]`, the required author safety confirmation for ready status, and optional explanation. Correct truth exists only in `answerPayload`.

## Allowed Content Patterns
- `three-segment-race`

The canonical creative construction is the personal-puzzle model. Each segment is an independent mini-puzzle that one player solves alone using World, Scope, and Scope Knowledge; the puzzle's answer is a derived World clue the player announces. The three derived clues plus shared World knowledge isolate exactly one answer. Mini-puzzles must be self-contained, solvable alone, and never count, sum, measure frequency, total lists, or apply arithmetic; the final resolution is World-grounded deduction, never aggregation. Any construction must leave every single clue and every two-clue holding unable to resolve alone.

## Content Safety Rules
Every segment must be necessary, distinct, verbally describable, private, and insufficient alone; every two-plus-one partition must also be insufficient alone because the runtime draws it at random. Reject sensitive fragmentation, subjective outcomes, spoiler/version violations, unsupported claims, and any item where knowledge replaces synthesis. Required confirmation: `راجعت التوزيع، ولا يستطيع لاعب واحد حل اللغز بمفرده.`

## Media Compatibility
Text-only is the default. Optional media belongs to its segment and is visible only to its assigned participant. Filenames, captions, subtitles, HUD text, alt text, labels, future-item media, shared screens, and player previews must not reveal private content or truth.

## Scope Compatibility
The mechanic is global; World, Scope, and Scope Knowledge provide only themed facts. Use stable, sourced relationships that can be split into necessary fragments. Respect every exclusion, spoiler boundary, and version boundary.

## Validation Rules
Validate canonical IDs; exact native objects; a non-empty Arabic public prompt; three unique A/B/C segments with distinct content; `[2,3]`; at least one exhaustive non-overlapping 2+1 merge with all three canonical partitions safe; safety confirmation when status is `ready`; supported inner mode; deterministic truth; no truth in mechanic data; no runtime-owned fields; no public/private leakage; no string-truth workaround; Scope evidence; and three distinct items per Challenge.

## Anti-patterns
One sufficient segment, one-player-all-three distribution, any two-segment holding that solves alone, unsafe merge, public fragment, teammate or opponent leakage, duplicated truth, JSON-string payload, authored participant IDs, answerer schedules, item orders, lock timestamps, progress, score events, host entry, host judgment, subjective result, support for team size one or four, authored hints, count/sum/frequency/list-total constructions, decorative read-aloud segments, a segment whose answer is the final truth instead of a derived clue, or any authored state that only the runtime may produce.

## Contract Status

`fully_playable`: synchronized with the authoritative backend-to-authoring contract at `docs/content/DISTRIBUTED_INFORMATION_AUTHORING.md`.
