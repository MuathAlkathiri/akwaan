# Anime Question Design Skill

## Purpose

This skill defines how anime questions should be designed for Akwaan.

It extends the AKWAN CONTENT BIBLE and provides anime-specific guidance.

Always read and apply the AKWAN CONTENT BIBLE before using this skill.

---

# Catalog Identity

Anime is primarily an Experience & Recognition category.

Players remember anime through emotions, iconic moments and visual recognition more than isolated facts.

Recommended balance:

- 75% Experience & Recognition
- 25% Knowledge

This ratio is a guideline.

The objective is always to maximize enjoyment.

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
- `ABILITY_RECOGNITION`
- `ORGANIZATION`
- `TEAM`
- `EVENT`
- `SEQUENCE`
- `TIMELINE`
- `ARC`
- `CHARACTER_IDENTIFICATION`
- `KNOWLEDGE`

Choose a Pattern from this allowlist before choosing its entity or event.

---

# What Anime Fans Remember

Anime fans naturally remember:

- Characters
- Iconic scenes
- Transformations
- Signature attacks
- Famous quotes
- Villains
- Teams
- Organizations
- Weapons
- Powers
- Eyes
- Symbols
- Costumes
- Openings
- Endings
- OSTs
- Emotional moments
- Death scenes
- Rivalries
- Memes

These should form the foundation of most questions.

---

# Preferred Assets

Whenever possible, build questions around:

Images

- Characters
- Transformations
- Famous fights
- Weapons
- Villages
- Symbols
- Logos
- Creatures
- Costumes

Videos

- Iconic battles
- Emotional scenes
- Famous entrances
- Power awakenings
- Funny moments

Audio

- Character voices
- Famous quotes
- Openings
- Endings
- OSTs
- Signature sounds

---

# Pattern Priorities

Recognition questions usually provide the best gameplay.

Examples:

- Scene Recognition
- Event Recall
- What Happens Next
- Quote Attribution and Dialogue Completion
- Technique or Ability Recognition
- Transformation, Object, and Location Recognition
- Sound and Voice Recognition when suitable audio exists
- Motivation and Cause and Effect when canon supports one answer
- Character Identification within the global limit

Example prompts:

- What is the name of this character?
- Which anime is this scene from?
- What is the name of this attack?
- Which organization does this character belong to?
- Which transformation is shown?
- Finish this quote.
- What happened after this scene?

Knowledge questions should focus on meaningful information.

Examples:

- Who founded this organization?
- Which clan does this character belong to?
- Who became the next leader?
- Which ability counters this attack?

---

# Accessibility and recognition calibration

Easy

Players should recognize the asset immediately.

Use:

- Main characters as context in event, action, quote, or ability questions—not
  as Direct Character Identification answers
- Iconic powers
- Viral scenes
- Famous openings
- Well-known quotes

Medium

Use content that regular fans remember.

Hard

Use memorable content that appeared less often but is still recognizable by dedicated fans.

Challenge should come from recognition level.

Never from confusing wording.

---

# Default Media Preferences

Prefer scene images and bounded video for action or sequence observation; use
audio for distinctive voices, openings, endings, OSTs, and signature sounds;
use text for meaningful canon knowledge. Do not force a Media type when no
strong localizable Asset exists.

# Discouraged and Restricted Patterns

Avoid questions about:

- Episode numbers
- Air dates
- Animation studios
- Directors
- Voice actors
- Production staff
- Episode duration
- Obscure filler content
- Extremely niche trivia
- Direct Relationship questions unless a Subject explicitly documents a major
  mystery or reveal
- Direct Character Identification of the protagonist, title character, mascot,
  or other obvious top-five character
- Promotional artwork used as an automatic identity giveaway

These rarely create enjoyable gameplay.

---

# One Asset, Multiple Questions

An Asset may reveal multiple enjoyable candidate questions, but Pattern,
Gameplay Pattern, Entity, and Event Cluster rotation decide which candidate (if
any) belongs in the current ContentItem Set.

A single image, video or audio clip may produce several unique questions.

Examples:

Character

- What is this character's name?
- Which anime is this character from?
- Which organization does this character belong to?
- What ability is shown?

Scene

- What happened after this scene?
- Who appears next?
- Which battle is this?

Do not exhaust every angle from one memorable moment in the same batch.

---

# Catalog Validation

Before approving an anime question:

✓ The answer is correct.

✓ The media clearly supports the question.

✓ The accessibility and recognition load fit the target audience.

✓ The wording feels natural.

✓ The question creates an enjoyable moment.

✓ The answer is not duplicated elsewhere.

✓ Production trivia is absent unless explicitly requested.

✓ Attached Media is essential and exists as a validated local file.

✓ Direct Character Identification stays within 15% and excludes obvious
characters.

If any answer is "No", rewrite the question.

# Question Priority

When one asset supports multiple possible questions,

prefer them in this order:

1. Scene
2. Event or Action
3. Ability
4. Transformation
5. Object
6. Organization
7. Quote
8. Location
9. Character Identification
10. Meaningful lore

Choose the question that creates the strongest "I KNOW THIS!" moment.
