# Lammah Design Bible

> Canonical global philosophy for every Lammah question. Agents, writers, and
> reviewers must read this document before designing or approving a Generated
> Batch. Execution belongs in `.opencode/skills/`; Catalog and Subject knowledge
> belongs in their Catalog Skills.

## Table of Contents

1. Lammah's Purpose
2. What Lammah Is Not
3. Player-First and Catalog Identity
4. Experience & Recognition and Knowledge
5. The Memorable Moment Principle
6. Asset-First Design
7. Media Dependency and Recognition Channels
8. Answer Leakage
9. Question Pattern Diversity
10. Character and Relationship Boundaries
11. Difficulty
12. Answer Quality
13. Global Anti-Patterns
14. Global Validation Principles

## 1. Lammah's Purpose

Lammah is a social party game. It creates recognition, conversation, tension,
surprise, laughter, friendly disagreement, satisfying reveals, and memorable
"I knew that" moments. It does not measure intelligence.

The goal is not maximum difficulty. The goal is maximum enjoyment. Knowledge
supports entertainment; it is not an end in itself. Every question must be
factually correct, but factual correctness alone never makes a good Lammah
question.

Before using one of the limited slots in a Generated Batch, ask:

- Would the intended audience enjoy answering this?
- Would players discuss the answer or enjoy its reveal?
- Is this more memorable than a generic alternative?
- Does it deserve this slot?

## 2. What Lammah Is Not

Lammah is not:

- a Wikipedia quiz;
- a school exam;
- a production-information quiz;
- a memorization contest;
- a collection of obscure facts;
- a game that manufactures difficulty through confusing wording.

For entertainment Catalogs, reject production trivia by default: actors,
directors, writers, producers, production companies, television channels,
release dates, filming locations, budgets, episode counts, awards, and
behind-the-scenes information. A Catalog may permit it only when its explicit
identity is production or behind-the-scenes trivia.

For story questions, use character names rather than actor names.

## 3. Player-First and Catalog Identity

Design from the player's perspective. Ask what fans enjoy remembering, not what
information happens to be testable. A satisfying question remains enjoyable
before, during, and after the answer.

Every Catalog has its own identity. Anime, Arabic series, movies, gaming,
football, music, geography, and factual Catalogs must not be forced into one
formula. A Catalog Skill defines what its audience remembers, suitable Question
Patterns, Media preferences, and how difficulty feels in that Catalog. A
Subject Skill may refine those choices.

## 4. Experience & Recognition and Knowledge

Every question is primarily one of:

1. **Experience & Recognition Question** — rewards something the player has
   seen, heard, watched, played, or experienced.
2. **Knowledge Question** — rewards meaningful factual understanding.

Entertainment Catalogs usually favor Experience & Recognition Questions, but
there is no universal percentage. The Catalog and Subject decide the useful
balance.

Knowledge Questions are allowed when they are meaningful, relevant, interesting
to reveal, appropriate for the audience and difficulty, unambiguous, and worth
a batch slot. Reject isolated trivia that fans would not naturally discuss.

## 5. The Memorable Moment Principle

Entertainment questions should originate in experiences fans remember:

- scenes, characters, decisions, confrontations, and battles;
- goals, dialogue, sounds, songs, locations, and maps;
- weapons, objects, transformations, plot turns, and strategies;
- emotional moments, famous mistakes, and recognizable visual details.

Do not begin by extracting arbitrary encyclopedia facts. Begin with:

> What does this Subject's audience actually remember and enjoy discussing?

## 6. Asset-First Design

An **Asset** is a usable source for a question: an image, video, audio clip,
quote, scene, character, location, object, map, event, or another memorable
element. **Media** means an attached image, video, or audio file.

For Experience & Recognition Questions, find or define a memorable Asset and
then select the best Question Pattern. The Asset should unlock a memory rather
than decorate a fact.

### One Asset, Multiple Angles

One strong Asset may support multiple questions only when each tests a genuinely
different memory or observation. From one palace-entry clip, asking who entered
first, who stayed outside, and what happened after the door opened can be valid.
Rewording "Who entered?" as "Name those who went inside" is not.

Asset reuse is judged by target answer, tested event, required observation, and
semantic meaning—not wording alone.

## 7. Media Dependency and Recognition Channels

When Media is attached, it must be essential. Apply the removal test:

> If the Media disappeared, would the question remain equally answerable?

If yes, the Media is decorative. Rewrite the question to depend on it or make
the question text-only.

A recognition question must use one primary recognition channel:

- image recognition;
- video observation;
- audio recognition;
- textual clues.

Do not combine strong channels that independently reveal the same identity.
Direct image identification should use a clear image with a minimal prompt such
as "Who is this character?"—not an image plus a unique biography. Textual
character identification must not show that character. Audio attribution must
not identify the speaker in text. Video observation must ask about something
the player needs to observe in the clip.

## 8. Answer Leakage

The question, title, visible context, filename, caption, player-visible search
query, description, subtitle, or Media must not expose the answer.

Reject a question when it:

- states the answer in the question or setup;
- asks for information already supplied by the setup;
- names both sides of an event and asks for one side;
- combines Media identity with a unique textual title or ability;
- uses visible text, captions, subtitles, filenames, or metadata that reveals
  the answer.

Every approval requires an explicit leakage check.

## 9. Question Pattern Diversity

A **Question Pattern** describes the kind of challenge, not merely its wording.
Useful patterns include Character Identification, Scene Recognition, Event
Recall, What Happens Next, What Happened Before, Who Was Present, Group Recall,
Dialogue Completion, Quote Attribution, Motivation, Cause and Effect, Sequence
Recognition, Plan Recognition, Object Recognition, Location Recognition, Sound
Recognition, Voice Recognition, Visual Detail, Battle or Match Event, Technique
or Ability Recognition, Action Recognition, and Outcome Recognition.

No Catalog must support every pattern. A Generated Batch should vary underlying
challenges, answers, moments, and recognition channels. Repeating a generic
prompt is acceptable when its answer and Asset differ and other limits pass.

## 10. Character and Relationship Boundaries

### Direct Character Identification

**Direct Character Identification** includes "Who is this character?", "Identify
the character shown", and equivalent prompts.

- It may occupy at most 15% of a Generated Batch.
- Round down: 20 questions allow at most 3.
- Use different characters and meaningful, fair framing.
- Never fill the allowance with weak secondary-character questions.

The answer must not be the title character, central protagonist, obvious mascot,
one of the Subject's five most recognizable characters, a character dominating
official artwork, or a character whose iconic form makes identification
automatic. This applies at every difficulty. Easy means accessible, not trivial.

Obvious characters remain valid as context or in event, quote, technique,
action, sequence, and other questions where the answer is not their direct
identity.

For direct visual identification, avoid posters, marketing banners, promotional
renders, clean transparent character PNGs, selection screens, named wallpapers,
and artwork dominated by the answer. Prefer actual scenes, natural screenshots,
gameplay moments, in-world appearances, and clear contextual or partial views.
Never create difficulty with blur, unreadable resolution, misleading crops, or
by hiding every useful detail.

### Direct Relationship Questions

Reject Direct Relationship as a default Question Pattern, including "Who is X's
brother/wife/father/friend/enemy?" and "What is X's relationship to Y?"

A relationship may provide context for a stronger event or reveal question. A
Catalog may explicitly allow the relationship itself only when it is a major
mystery, meaningful reveal, plot twist, commonly misunderstood fact, or
essential part of a memorable event. Even then, it must create stronger gameplay
than an event-based alternative.

## 11. Difficulty

Difficulty should come from recognition level, character or scene prominence,
the amount of fair context, attention required, details recalled, event
complexity, sequence depth, and how often fans encountered the subject.

It must not come from ambiguous wording, missing context, arbitrary production
facts, unreadable Media, unfair crops, obscure facts without entertainment
value, multiple valid answers, or trick wording.

- Easy is accessible but not trivial.
- Medium rewards regular fans.
- Hard rewards dedicated fans without becoming random or unfair.

If the project or output schema already uses a point model such as 200, 400, and
600, preserve its established mapping.

## 12. Answer Quality

Answers must be specific, concise where possible, unambiguous, consistent with
the Subject's universe, supported by reliable knowledge, and free from
unnecessary explanation in the answer field. Use a character name instead of an
actor name unless actors are explicitly the Subject.

For Group Recall:

- state how many answers are required and whether all are required;
- store accepted aliases using the existing output schema;
- define a closed answer set;
- do not ask for a complete group when the source cannot prove completeness.

## 13. Global Anti-Patterns

Reject:

- production trivia in entertainment Catalogs unless explicitly scoped;
- decorative Media;
- multiple independent recognition channels;
- answer leakage;
- obvious Direct Character Identification;
- default Direct Relationship questions;
- promotional Media that makes the answer automatic;
- arbitrary or obscure facts;
- ambiguous, trick, or needlessly complex wording;
- repeated underlying events or answers disguised by new wording;
- open-ended answer groups;
- Media that is unreadable, unsupported, or unfair.

## 14. Global Validation Principles

Before approval, every question must pass:

1. factual correctness and reliable support;
2. one intended answer or a clearly bounded accepted-answer set;
3. entertainment value and Catalog fit;
4. difficulty fit and audience fairness;
5. Media dependency whenever Media exists;
6. answer-leakage and single-recognition-channel checks;
7. relationship, obvious-character, and Direct Character Identification checks;
8. Question Pattern and Generated Batch diversity;
9. semantic duplicate detection;
10. Asset relevance, readability, supported format, and local existence;
11. confirmation that the question deserves its batch slot.

Validation failures are repaired when a safe, factual repair exists; otherwise
the candidate is replaced. A failed question is never silently approved.
