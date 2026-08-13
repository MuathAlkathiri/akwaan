# Supported Question Types

Attack on Titan questions should be generated using one or more of the following formats.

Prefer memorable moments over obscure trivia.

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
- `LOCATION_RECOGNITION`
- `ABILITY_RECOGNITION`
- `ORGANIZATION`
- `TEAM`
- `EVENT`
- `SEQUENCE`
- `TIMELINE`
- `ARC`
- `CHARACTER_IDENTIFICATION`
- `KNOWLEDGE`

---

## Character Identification

Identify a character from an image.

Examples:

- What is this character's name?
- Which organization does this character belong to?
- What role does this character have?

Use natural in-story frames rather than promotional portraits. Never use Eren,
Mikasa, Levi, Armin, or Reiner as Direct Character Identification answers. They
remain valid in other Content Patterns.

---

## Scene Recognition

Use an image or video from an iconic moment.

Examples:

- What happens after this scene?
- Which battle is this?
- What event is taking place?

Preferred assets:

- Major battles
- Emotional scenes
- Famous reveals
- Memorable confrontations

The scene should be recognizable without requiring the entire episode.

---

## Voice Recognition

Use a short voice clip.

Examples:

- Who is speaking?
- Which character said this quote?

Preferred assets:

- Emotional dialogue
- Famous quotes
- Character introductions
- Iconic screams

Avoid generic dialogue that multiple characters could have spoken.

---

## Titan Recognition

Identify Titans from images or videos.

Examples:

- What is the name of this Titan?
- Who is the current holder of this Titan?
- Which of the Nine Titans is this?

Prefer full Titan forms over partial close-ups.

---

## Story Mystery

Create questions about the major mysteries of Attack on Titan.

Examples:

- What is the origin of the Titans?
- Who gave Grisha Yeager the Attack Titan?
- What is hidden inside the basement?
- Why were the walls built?
- What is the truth about Marley?

Focus on important story revelations rather than minor details.

---

## Location Recognition

Identify important places.

Examples:

- What is the name of this district?
- Which wall is shown?
- Which city is this?
- Where does this event take place?

Preferred assets:

- Walls
- Districts
- Castles
- Marley
- Paradis Island
- Shiganshina
- Trost

---

## Organization Recognition

Questions about military branches and organizations.

Examples:

- Which regiment does this character belong to?
- Which organization uses this emblem?
- What is the name of this military branch?

Preferred assets:

- Uniforms
- Flags
- Emblems
- Cloaks
- Badges

---

## Ability Recognition

Questions about Titan abilities.

Examples:

- What ability is being used?
- Which Titan has this ability?
- Which power is shown?

Use visually distinctive abilities whenever possible.

---

## Relationship Reveals (Restricted)

Direct Relationship questions are rejected. Relationships may appear inside
Event Recall, Cause and Effect, inheritance events, discoveries, or major
reveals when canon supports one answer. Ask what event revealed the connection
or who discovered it, not "Who is X's father/friend?"

---

## Motivation & Reasoning Questions

Create questions that test the player's understanding of why important events happened.

Focus on character motivations, decisions, and the underlying reasons behind major story events.

These questions should require understanding of the story rather than memorizing isolated facts.

Examples:

- Why did Eren manipulate his father?
- Why did Reiner destroy Wall Maria?
- Why did Zeke betray Marley?
- Why did Historia become queen?
- Why did Erwin continue the charge?
- Why did Grisha give Eren the Attack Titan?
- Why did Ymir choose to help Historia?

Preferred topics:

- Character motivations
- Moral dilemmas
- Strategic decisions
- Political choices
- Cause-and-effect relationships
- Major turning points

Avoid questions where multiple interpretations are equally valid.

The answer must be supported by canon and have one clear explanation.

Accessibility / recognition load:

Easy:
- Obvious motivations of major characters.

Medium:
- Decisions requiring understanding of multiple events.

Hard:
- Motivations connected to major plot revelations or long-term story development.

## Validation

Every generated question must satisfy the following:

- The answer is canonically correct.
- The media clearly supports the question.
- The accessibility and recognition load fit the target audience.
- The answer is unique.
- The asset is recognizable.
- The question creates an enjoyable "I know this!" moment.
- Direct Character Identification remains within 15% of the ContentItem Set.
- Attached Media is essential, local, readable, and answer-safe.
- Production trivia is absent unless explicitly requested.

### Motivation Validation

For motivation questions:

- The answer must be explicitly supported by the canon.
- Do not infer motives that were never confirmed.
- Do not generate opinion-based answers.
- If multiple interpretations are equally valid, reject the question.
- The answer should be explainable in one concise sentence.
