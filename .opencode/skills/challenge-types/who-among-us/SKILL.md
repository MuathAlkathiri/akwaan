---
name: challenge-type-who-among-us
description: Global relational team-voting mechanic for private roster-aware votes and simultaneous social reveal.
---

# ChallengeType: Who Among Us / مين فينا

## Experience Goal

Create an immediate, playful conversation in which teammates privately vote on
who best fits a harmless World-framed situation, then discover where the group
agrees or disagrees.

## Social Dynamic

Every eligible participant on the active team casts one private vote for one
eligible teammate. Several participants may select the same teammate. No actor
may submit twice. The public prompt creates anticipation while individual votes
remain private until the simultaneous tally reveal.

## Player Emotion

Recognition, curiosity, suspense, disagreement, affection, surprise, and
laughter without embarrassment or social pressure.

## Interaction Pattern

Public roster-aware prompt → private vote from each eligible actor → no partial
tally → resolve after all submissions or the runtime deadline → simultaneous
final tally and winner reveal.

## Thinking Pattern

Interpret a safe thematic situation, recognize teammates' harmless tendencies,
and choose the teammate who most naturally fits without searching for an
objectively correct result.

## Success Pattern

The prompt is understood within seconds, several votes are defensible, the
reveal starts conversation, and the same ContentItem remains enjoyable with a
different roster or later session.

## Failure Pattern

An objective result, factual recall, fixed participant, sensitive inference,
humiliation, partial vote leakage, unsupported timer or scoring behavior,
missing tie handling, or a two-person roster with no meaningful choice causes
failure.

## Input Contract

Authoring actor model: `active_team_all_eligible`. Each actor submits exactly one
`participantId` selected dynamically from the active team's eligible roster.
Duplicate selections by different actors are allowed. V1 authoring policy
forbids self-voting. Participant IDs and display names are never authored into
the ContentItem.

Minimum meaningful roster size is three eligible participants when self-voting
is forbidden. Two-person teams are incompatible with this authoring contract
because each actor would have only one legal target. Maximum size is not proven
in the permitted workspace and remains a runtime decision.

## Resolution Contract

Count votes by selected participant ID. The highest total wins the social
reveal. V1 authoring policy represents a tie as multiple winners; it never
invents a tiebreaker. The resolution payload must declare
`tiePolicy: multiple_winners` and `winnerCardinality: one_or_more`.

This policy is not backend-proven. Until the runtime confirms multiple-winner
support, roster enforcement, and reveal projection, every authored item remains
blocked with `runtime_contract_missing`.

## Content Structure

Three reusable ContentItems per challenge. Each item contains a localized,
roster-aware prompt; runtime roster binding; private-vote visibility policy;
team-size policy; machine-defined tally policy; tie policy; null timer fields;
optional neutral media; and blocked validation metadata.

ContentItems use `answerMode: vote`, `compatibleChallengeTypeIds:
["who-among-us"]`, and `patternId: team-consensus`. The runtime supplies the
current roster. Authored content never stores a teammate as the result.

## Allowed Content Patterns

- `team-consensus`

## Content Safety Rules

Keep prompts light, affectionate, and native to the selected Scope. Reject
appearance or body, health, religion, politics, sexuality, wealth, income,
trauma, crime, private relationships, intelligence, harsh incompetence,
humiliation, bullying, secrets, or any framing likely to create discomfort.

## Media Compatibility

Text-only is preferred. Optional public media may establish a harmless thematic
situation but cannot depict or imply the intended winner, include a roster
member, expose a vote, or become required to judge a teammate personally. Media
belongs only to the ContentItem.

## Scope Compatibility

The mechanic is global. World and Scope only theme the prompt. Reject Scopes
whose exclusions forbid relational play or whose material cannot produce safe,
roster-aware situations. Runtime behavior never changes by World.

## Validation Rules

- canonical IDs are `who-among-us`, `team-consensus`, and mode `vote`;
- prompt addresses the live team generically and contains no fixed name or ID;
- no objective correct participant or external truth exists;
- actor model, one-vote limit, self-vote policy, and minimum team size are explicit;
- individual votes and partial tallies remain private;
- resolution uses participant-ID tally and multiple winners on a tie;
- `timerSeconds` is null and `timeoutPolicy` is `runtime_contract_missing`;
- scoring is `social_reveal_only` with no authored Match points;
- `isReusableAcrossSessions` is true;
- all relational safety exclusions pass;
- metadata status is `blocked` with blocker `runtime_contract_missing`;
- default validation must fail readiness until a proven backend payload replaces
  the missing runtime fields.

## Anti-patterns

Factual recall, numeric estimation, teammate prediction by one partner, exact
answer matching, open text, public live votes, partial tally display, fixed
roster names, self-voting despite the declared policy, an invented timer,
invented timeout action, invented Match points, single-winner tie-breaking,
sensitive judgment, insults, appearance ranking, or a prompt meaningful only
for a particular real group.

## Runtime Readiness

Status: `runtime_contract_missing` / `authoring_only`.

The permitted workspace does not prove timer duration, timeout resolution,
maximum team size, roster eligibility rules, multiple-winner projection, or
scoring implementation. Content generation must remain blocked until those
runtime decisions are supplied and the schema and validator are updated.
