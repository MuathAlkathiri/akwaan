---
patternId: team-consensus
owningChallengeType: who-among-us
---

# Pattern: Team Consensus

## Experience Goal

Reveal a harmless shared perception through private roster-aware voting and a
simultaneous tally.

## Interaction Shape

Show one public thematic prompt. Bind choices to the active team's eligible
runtime roster. Collect one private participant-ID vote from every eligible
actor, hide submissions and partial totals, then reveal the final tally after
all submissions or the unresolved runtime deadline.

## ContentItem Shape

- `compatibleChallengeTypeIds` contains `who-among-us`;
- `patternId` is `team-consensus`;
- `answerMode` is `vote`;
- localized prompt is roster-aware and has no fixed teammate;
- interaction payload declares dynamic roster binding, actor model, submission
  limit, self-vote policy, visibility, team-size support, and unresolved timer;
- resolution payload declares tally, highest-vote winners, multiple-winner tie
  handling, and social-only scoring;
- reuse is true;
- metadata remains blocked by `runtime_contract_missing`.

## Interaction Payload Shape

```json
{
  "runtimeContractStatus": "runtime_contract_missing",
  "actorModel": "active_team_all_eligible",
  "rosterBinding": "active_team_eligible_roster",
  "voteValueType": "participant_id",
  "submissionLimitPerActor": 1,
  "duplicateSelectionsAllowed": true,
  "selfVotePolicy": "forbidden",
  "minimumTeamSize": 3,
  "maximumTeamSize": null,
  "timerSeconds": null,
  "timeoutPolicy": "runtime_contract_missing",
  "individualVoteVisibility": "private_until_reveal",
  "partialTallyVisibility": "hidden",
  "revealTrigger": "all_submitted_or_runtime_deadline",
  "hardcodedParticipantIds": [],
  "hardcodedParticipantNames": []
}
```

## Resolution Payload Shape

```json
{
  "resolution": "participant_vote_tally",
  "winnerPolicy": "highest_vote_total",
  "tiePolicy": "multiple_winners",
  "winnerCardinality": "one_or_more",
  "revealPayload": "final_tally_only",
  "scoringPolicy": "social_reveal_only",
  "matchPointValue": null
}
```

## Private Vote Behavior

The server accepts at most one vote per eligible actor and derives legal targets
from the current roster. Several actors may select the same target. Authored
content never contains participant IDs or names.

## Reveal Behavior

The shared screen receives no individual vote or partial tally. The final tally
and every highest-voted participant reveal together only after resolution.

## Resolution and Tie Policy

Count votes by participant ID. Return all participants sharing the highest
total. Do not choose a random, earliest, or host-selected winner. Runtime support
for this multi-winner projection is unproven, so readiness remains blocked.

## Team-size Compatibility

Minimum: three eligible participants under the no-self-vote policy. Maximum:
unresolved. A two-person roster has no meaningful target choice and must skip or
substitute this ChallengeType until product/runtime policy changes.

## Safety Constraints

Reject appearance, body, health, religion, politics, sexuality, wealth, income,
trauma, crime, private relationships, intelligence, humiliation, bullying,
secrets, harsh incompetence, or socially coercive framing.

## Media Compatibility

Text-only is preferred. Optional public thematic media must be neutral, contain
no roster member, and reveal no intended vote.

## Leakage Rules

Never expose individual votes, submitter-to-target mapping, partial totals,
leading participant, completion state by actor, or inferred winner before final
resolution.

## World and Scope Examples

Examples are thematic demonstrations only, not production ContentItems:

- Anime / Naruto: من في الفريق سيحاول إقناع الجميع بخطة جريئة مثل ناروتو؟
- Anime / Bleach: من فيكم سيبقى هادئًا عند ظهور خصم أقوى؟
- Anime / Attack on Titan: من في الفريق سيتخذ القرار الأسرع تحت الضغط؟
- Anime / One Piece: من فيكم سيقترح المغامرة نحو الجزيرة الأخطر؟
- Video Games / Call of Duty: من في الفريق سيختار الاندفاع أولًا؟
- Video Games / GTA: من فيكم سيحوّل الخطة البسيطة إلى مطاردة كبيرة؟
- Video Games / Overwatch: من في الفريق سيغيّر دوره لمساعدة البقية؟
- Video Games / EA Sports FC: من فيكم سيحاول تسجيل هدف استعراضي؟

## Valid Example

“من في الفريق سيختار الطريق الأكثر مخاطرة داخل هذا العالم؟” It is short,
roster-aware, thematic, safe, and permits several defensible votes.

## Invalid Examples

- “من سجّل أهدافًا أكثر؟” — external factual truth.
- “من فيكم وزنه أكبر؟” — sensitive body framing.
- “صوّتوا لأحمد.” — fixed participant and no social decision.
- A payload with no tie policy — non-deterministic resolution.
- A projection showing the current leader before reveal — privacy leakage.

## Anti-patterns

Objective correctness, fixed roster data, sensitive traits, forced negativity,
free text, early vote projection, hidden human judgment, single-winner tie
selection, two-person deterministic choice, or speculative runtime constants.
