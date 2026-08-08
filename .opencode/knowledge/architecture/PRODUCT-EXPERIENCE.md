# Product Experience Contract

## Match Shape

A match uses three player-selected Worlds. Each World contributes a
system-determined four-slot board:

- one exclusive Signature ChallengeType;
- two Read Your Opponent slots;
- one authored flex slot using Co-op or Relational.

Each standard ChallengeType uses three ContentItems. The complete match is
twelve challenges and thirty-six item equivalents. A continuous Signature unit
may replace its three discrete items while preserving the same pacing budget.

At least one Relational challenge must appear across the three selected Worlds.
Challenge order varies per match. Objective ContentItems do not repeat in
consecutive sessions for the same group; Relational ContentItems may repeat.

## Why Three Items

The first item teaches the interaction. The next two let teams develop tactics,
especially opponent reads. Two items spend too much of the challenge on initial
comprehension.

## Pacing

- Read Your Opponent: about 25 seconds per item, including a roughly 10-second
  blind window and reveal.
- Relational: about 25 seconds per item.
- Co-op: 45 seconds per item.
- Signature: mechanic-defined within the three-item envelope.
- Introduction: five to eight seconds maximum.

Target match duration is approximately forty to forty-five minutes and must be
verified through live play.

## World Differentiation

Shared mechanics remain one implementation but must not feel identical. Every
World gives a shared mechanic a distinct display name and differs from another
World in at least two of input type, timer, media profile, sound profile, or
reveal style. A color-only reskin is insufficient.

Before launch, a ten-second silent board clip should communicate its World.
Every World must also have one exclusive, auto-resolvable Signature mechanic.

## Automatic Resolution and Visibility

No default flow uses a human referee. All outcomes resolve through the central
runtime contract. The shared screen receives only public state; phones receive
only fields authorized for their team, seat, and phase. Values are never shipped
early and hidden in the interface.

Private phone sessions persist for the match. Authoring metadata must therefore
declare any seat- or team-specific payload visibility explicitly.

## Authoring Consequence

Generated output must serve the board rhythm. Read Your Opponent carries the
main decision load; Co-op and Relational break rhythm through dependency and
social recognition; Signature supplies World identity. Sets should escalate
familiarity with the interaction, vary thematic material, and make item three
feel tactically richer than item one.
# Distributed Information / ركّبها

This global mechanic is a simultaneous two-team race over exactly three
independent puzzles. Each ContentItem has one public prompt and exactly three
private segments, supporting team sizes two and three through safe 2+1 merges
or one segment per participant. The runtime deals a random two-plus-one
partition to two-player teams, so every one of the three canonical partitions
must be non-solving. Content owns only truth and distributed gameplay material.
Runtime owns random team orders, answerer assignment, the 135-second deadline,
five-second wrong-result locks, progress, timeout comparison, and the single
Match-point score event. There is no hint mechanic, and correct truth is never
revealed during play.
