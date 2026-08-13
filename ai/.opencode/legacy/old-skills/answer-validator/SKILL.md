---
name: answer-validator
description: Validates and repairs individual Lammah questions and complete Generated Batches.
---

# Answer and Batch Validator

Read `../../knowledge/LAMMAH-DESIGN-BIBLE.md` and validate against the resolved
Catalog and Subject files. Preserve the existing output schema.

Before validation, load active applicable records from
`../../learning/rejection-history.json` and operational summaries from
`../../learning/learned-rules.md`. Match by structured scope, Subject, answer,
event, Question Pattern, Asset, and visible failure—not generic word overlap.

Load applicable active approvals from `../../learning/approval-history.json`
only as preference evidence. Distinguish:

- hard validity: mandatory pass/fail rules;
- rejection memory: an applicable explicit negative constraint;
- positive preference: a ranking signal;
- health recommendation: planning advice.

A candidate must not fail solely because it lacks a preferred Pattern, and a
valid less-preferred candidate may be retained for diversity.

## Per-Question Checks

Reject when any condition is true:

- the answer is unsupported, ambiguous, overly broad, or has unhandled aliases;
- the answer or an unmistakable equivalent appears in the question, visible
  context, title, caption, subtitle, filename, metadata, or Media;
- the setup already states the answer or names both sides and asks for one;
- Media and text independently reveal the same identity;
- removing attached Media leaves the question equally answerable;
- more than one primary recognition channel is used;
- it is an obvious Direct Relationship question;
- it directly identifies an obvious, title, central, mascot, or top-five
  recognizable character;
- an entertainment question uses an actor where the character is intended, or
  defaults to production trivia;
- Media is promotional artwork that makes identification automatic;
- the Asset path is missing, remote-only, fabricated, unreadable, unsupported,
  or points outside the intended output;
- the mandatory Blind Asset Test fails: with answer, filename,
  `mediaDescription`, rationale, query, and hidden metadata concealed, the
  actual Asset lacks enough visible/audible evidence for a target player to
  identify the intended answer (`INSUFFICIENT_ASSET_EVIDENCE`);
- the Asset itself exposes the answer through spoken audio — announcer calls,
  dialogue, voice lines, lyrics, or narration (`AUDIO_ANSWER_LEAKAGE`); such a
  segment is an `INVALID_MEDIA_SEGMENT` and the question is not complete until
  it is re-clipped or replaced and passes the leakage check;
- the asked-about target is absent from the Asset (`TARGET_NOT_VISIBLE`) or
  present but not visually/audibly dominant (`TARGET_NOT_VISUALLY_DOMINANT`),
  so the Asset alone cannot support the answer;
- difficulty comes from ambiguity, bad wording, unreadable Media, or unfair
  concealment;
- a reviewed question plays far easier or harder than its label, including an
  Easy question that nearly any casual player answers instantly from the Media
  alone (`RECOGNITION_SATURATION`), or a label that does not match actual play
  (`DIFFICULTY_MISCLASSIFIED`); correct the label and recalibrate instead of
  keeping the mismatch;
- a Group Recall answer set is not closed and provable;
- the Asset Search Planner produced only a generic, wrong-scene, or wrong-Media
  query plan;
- selected Asset ranking contains a hard failure or no quality score;
- cached search or Asset records are rejected, stale under changed rules, point
  to a missing file, or do not match the current event and observation;
- required Asset metadata is absent after acquisition or reuse;
- the same Asset is overused inside the batch without distinct observations;
- an active learned rejection strongly matches the question or Asset and no
  explicit repair has been applied.
- the Question Pattern is unknown or absent from the resolved
  `allowedQuestionPatterns` list;
- the wording semantically defines, translates, decomposes, or paraphrases the
  answer name;

An approval match never cancels any rejection above. It also never bypasses
factual support, ambiguity, leakage, duplication, Media quality, Asset ranking,
or a Design Bible boundary.

## Batch Checks

- count equals the request;
- Direct Character Identification is no more than
  `floor(requested_count * 0.15)`;
- difficulty, Question Pattern, and Media allocations match the resolved plan,
  with documented changes when availability required repair;
- answers, events, and Assets are not repetitively concentrated;
- semantic duplicate checking passed;
- every relative local Media path resolves to a validated file;
- every selected Asset has ranking and cache status in the generation report;
- every Media question records a passing Blind Asset Test on its final local
  Asset; metadata or generator intent is never accepted as substitute evidence;
- rejected Assets were not reused;
- learned-rule matches and plan deviations were recorded.
- Question Pattern and Gameplay Pattern diversity pass independently;
- Primary Focus, normalized answers, Event Clusters, arcs/stages, and saturated
  characters pass Coverage Ledger review or have a valid documented exception;
- the same Primary Focus is not used consecutively without an exceptional
  reason;
- in a 10-question batch, a second use of one character as Primary Focus has a
  different Pattern, Event Cluster, and gameplay experience;
- protagonists and recognition-saturated characters receive stricter focus and
  Direct Character Identification limits.
- when the Subject is Call of Duty, Campaign plus Zombies is at most 15% and a
  20-question batch contains at least 17 Multiplayer questions; validate both
  the planned and final counts;
- for Call of Duty, title/version provenance passes for every map, weapon,
  streak, HUD/UI, mission, Zombies map, sound, and Asset; community numbers are
  from the Subject's verified table rather than guessed;
- for Call of Duty, game-title, mode, and gameplay-experience distributions
  pass the Subject rotation limits, and no direct answer class exceeds 3/20
  when suitable variety exists.

## Failure Handling

Return a stable reason code from `../../learning/README.md` plus a specific
explanation. Repair only when wording, channel, or Asset can
be changed without inventing facts or weakening the experience. Otherwise
replace the candidate. Re-run every affected check after repair. Never silently
approve a failure.

Automatic validator failures contribute to generation metrics only. Do not
write them into rejection history or promote them to learned rules without
explicit user or reviewer feedback.

Likewise, passing validation, being repaired, being saved, or matching an
approved structure is not explicit approval and must not create Success Memory.
