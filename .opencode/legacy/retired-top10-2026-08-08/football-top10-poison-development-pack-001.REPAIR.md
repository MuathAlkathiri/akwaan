# Top 10 Development Pack Repair Report

- Pack: `football-top10-poison-development-pack-001`
- Review type: structural and content-contract review only
- Pack mutation: none
- Production approval: none

## Pack-wide blockers

All three ContentItems use noncanonical IDs:

- `challengeType: top-10-poison` must become `top-10`;
- `compatibleChallengeTypeIds` must contain `top-10`;
- `patternId: top-10-poison` must become `poison-deck`;
- `answerMode: split` must become `top_10`.

All prompts instruct players to rank candidates manually. Poison deck requires
a membership-oriented prompt because players choose KEEP or POISON and never
submit a ranking.

All payloads require reconstruction into the canonical contract: variant,
title, ranking basis, source label and URL, as-of date, fourteen candidates,
runtime constants, ten `rankedEntries`, four `decoyCandidateIds`, reveal and
scoring constants, social metrics, and four decoy-review records.

Each source is only a prose label, not a preserved URL. Every as-of date is
2022-12-31. Repair must either state an explicit through-2022 boundary in the
player-facing prompt or refresh the ranking and evidence before approval.

## Item classifications

### `top10-wc-appearances-010` — rejected

Reasons:

- equal values are assigned different ranks without an authoritative stored
  tiebreaker: 18 appearances at ranks 3–4, 16 at ranks 6–8, and 14 at ranks 9–10;
- the staged reveal therefore has unsupported unique ordering;
- prompt, IDs, mode, payload, source URL, and decoy review all fail the active contract.

The idea may be replaced or rebuilt only if an authoritative secondary
tiebreaker uniquely orders all ten positions. Otherwise select a different
ranking basis with unique ranks.

### `top10-wc-goals-010` — requires content repair

Positive evidence:

- fourteen unique candidate IDs;
- ten distinct displayed values for valid entries;
- four separate decoy IDs;
- candidate values appear ordered without an internal tie in the supplied data.

Required repair:

- replace IDs, mode, prompt, and payload;
- preserve an authoritative source URL and verify the effective date;
- verify that decoys are the actual adjacent source positions;
- document cutoff distances of 7, 18, 25, and 26 goals and explain why the
  latter three remain plausible rather than easy;
- run the canonical schema and deep validator.

### `top10-cl-standings-010` — requires content repair

Positive evidence:

- fourteen unique candidate IDs;
- ten unique displayed ranks and values;
- decoys appear to occupy positions immediately after the cutoff;
- Arsenal at 389 versus Inter at 392 creates strong cutoff uncertainty.

Required repair:

- replace IDs, mode, prompt, and payload;
- define the points formula and competition boundary precisely;
- replace the prose source label with an authoritative preserved URL;
- refresh or explicitly freeze the as-of boundary because later seasons change
  an all-time table;
- document cutoff distances of 3, 21, 36, and 57 points and assess whether the
  lower three decoys remain sufficiently plausible;
- run the canonical schema and deep validator.

## Final disposition

- Valid after identifier/prompt-only repair: 0
- Requires content repair: 2
- Rejected in current form: 1
- Approved: 0

No content was regenerated. Source freshness and factual values still require
human-authorized research before any repaired record can reach review-ready status.
