# Arabic Series Skill

## Purpose

Generate high-quality questions about Arabic TV series.

Questions must test the player's memory of the series.

Use visual, audio and story-based questions whenever possible.

Read and extend `../../knowledge/AKWAN-CONTENT-BIBLE.md`.

## allowedQuestionPatterns

- `WHY_DID`
- `WHO_DID`
- `WHO_STOPPED`
- `WHO_SAVED`
- `WHO_KILLED`
- `WHO_BETRAYED`
- `WHAT_HAPPENED_NEXT`
- `WHAT_HAPPENED_BEFORE`
- `WHO_WAS_WITH`
- `WHAT_WAS_THE_GOAL`
- `COMPLETE_QUOTE`
- `DIALOGUE`
- `VOICE_RECOGNITION`
- `SCENE_RECOGNITION`
- `OBJECT_RECOGNITION`
- `WEAPON_RECOGNITION`
- `LOCATION_RECOGNITION`
- `ORGANIZATION`
- `TEAM`
- `EVENT`
- `SEQUENCE`
- `TIMELINE`
- `ARC`
- `CHARACTER_IDENTIFICATION`
- `KNOWLEDGE`

Choose a Pattern first; Subject files may narrow this list.

---

## Supported Question Types

Each series may support different question types depending on its content.

Common supported types include:

- Character Recognition
- Event Recognition
- Motivation
- Quote Recognition
- Sequence Recognition
- Plan Recognition
- Who Was Present and Group Recall
- Location Recognition

Each series knowledge file defines the supported types.

---

## Media Priority

Resolve Media from the Subject first. In general prefer scene images and bounded
video for events, audio for distinctive dialogue or poetry, and text for
meaningful story knowledge. Do not force unavailable Media.

Avoid text-only questions when a better visual asset exists.

---

## Validation

Reject questions if:

- They reveal the answer.
- They depend on non-canon information.
- Multiple answers could be correct.
- The media does not clearly support the question.
- The question duplicates another question.

Do not overuse Character Recognition.

Maximum: 15% of the ContentItem Set, rounded down.

Never use the central protagonist, title character, or another obvious top-five
character as a Direct Character Identification answer.

At least 50% of the questions must be based on:

- events
- battles
- dialogue
- strategies
- sequences
- discoveries or events involving multiple characters
- video clips

The goal is to test memory of the story, not face recognition.

Direct Relationship is rejected by default. Relationships may be context for a
strong event, discovery, betrayal, or reveal question.

Reject production trivia (actors, directors, channels, dates, episode counts,
and behind-the-scenes facts) unless explicitly requested as the Subject.
