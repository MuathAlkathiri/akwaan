---
name: answer-validator
description: Validates and repairs individual Lammah questions and complete Generated Batches.
---

# Answer and Batch Validator

Read `../../knowledge/LAMMAH-DESIGN-BIBLE.md` and validate against the resolved
Catalog and Subject files. Preserve the existing output schema.

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
- difficulty comes from ambiguity, bad wording, unreadable Media, or unfair
  concealment;
- a Group Recall answer set is not closed and provable.

## Batch Checks

- count equals the request;
- Direct Character Identification is no more than
  `floor(requested_count * 0.15)`;
- difficulty, Question Pattern, and Media allocations match the resolved plan,
  with documented changes when availability required repair;
- answers, events, and Assets are not repetitively concentrated;
- semantic duplicate checking passed;
- every relative local Media path resolves to a validated file.

## Failure Handling

Return a specific failure reason. Repair only when wording, channel, or Asset can
be changed without inventing facts or weakening the experience. Otherwise
replace the candidate. Re-run every affected check after repair. Never silently
approve a failure.
