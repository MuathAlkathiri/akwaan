# Akwan Content Bible

> Canonical content-authoring philosophy for Akwaan. Read this before creating,
> reviewing, importing, or approving any ContentItem. Runtime mechanics belong
> to the game code; these files define how content is selected, structured,
> verified, and made enjoyable.

## 1. Product model

Akwaan is a social party game built around:

```text
World → Scope → Challenge Type → ContentItem
```

- **World**: top-level theme such as Football, Anime, or Video Games.
- **Scope**: content sub-topic inside one World. It tags content; it never changes mechanics.
- **Challenge Type**: reusable mechanic such as Read Your Opponent, Co-op, Relational, or a World Signature.
- **ContentItem**: the prompt, answer payload, and optional media consumed by compatible Challenge Types.

Content belongs to a Scope, not to a mechanic. A strong ContentItem may be
compatible with multiple mechanics when its answer payload genuinely supports them.

## 2. Akwaan's purpose

Akwaan creates tension, conversation, bluffing, recognition, cooperation,
laughter, and memorable reveals. It does not measure intelligence and it does
not reward obscurity for its own sake.

Before using a content slot, ask:

- Would the intended audience enjoy this moment?
- Is the answer fair and automatically resolvable?
- Does the reveal create discussion, surprise, or satisfaction?
- Is this stronger than a generic alternative?
- Does it suit the selected World and Scope?

## 3. What Akwaan is not

Akwaan is not:

- a school exam;
- a Wikipedia-fact dump;
- a host-judged open-answer quiz;
- a 200/400/600 difficulty board;
- a memorization contest;
- a collection of trick questions;
- a system that manufactures challenge through ambiguity or unreadable media.

Legacy point tiers and manual host judgment must never appear in new content.

## 4. RYO content rules

Read Your Opponent is the backbone mechanic. Its player-facing name, timer,
input behavior, reveal behavior, and scoring are global and must not vary by World.

RYO ContentItems must use one of:

- `multiple_choice`
- `closest`

Never create open free-text judged RYO content.

A multiple-choice item must have:

- 2–4 plausible options;
- one unambiguously correct option;
- distractors from the same semantic class;
- no joke option that reveals the answer;
- no wording that leaks the correct option.

A closest item must have:

- a finite numeric correct value;
- a deterministic accepted tolerance when the runtime contract requires one;
- an explicit unit visible to the player;
- no ambiguous time period, edition, or measurement basis.

## 5. Media ownership

Media belongs only to `ContentItem`.

A ContentItem may be:

- text only;
- image;
- audio;
- video.

Worlds and World assignments do not own question media. Mechanics do not need
separate copies for each media type.

When media is attached, it must be essential. Apply the removal test:

> If the media disappeared, would the item remain equally answerable?

If yes, the media is decorative. Rewrite the prompt or make the item text-only.

## 6. Asset evidence sufficiency

The player-facing asset itself must contain the evidence required to answer.
Topic relevance, filenames, search queries, hidden notes, or metadata are not evidence.

### Mandatory blind asset test

Before approving image, audio, or video:

1. Hide the answer.
2. Hide filenames and metadata.
3. Hide search queries and rationales.
4. Inspect only the final player-facing asset.
5. Confirm a target player can reasonably derive the intended answer from it.

Hard-reject insufficient, tiny, obscured, ambiguous, wrong-scene, or answer-leaking assets.

## 7. Recognition and knowledge

Each ContentItem primarily rewards either:

1. **Experience and recognition** — something the player has seen, heard, played, or watched.
2. **Meaningful knowledge** — a relevant fact fans naturally discuss.

Entertainment Worlds usually favor recognition. Knowledge is welcome when it is
interesting, fair, unambiguous, and worth the reveal.

Production trivia is rejected by default for entertainment Worlds: actors,
directors, budgets, release dates, episode counts, filming locations, and awards,
unless the Scope explicitly represents production or behind-the-scenes content.

## 8. Content pattern diversity

A Content Pattern describes what memory or observation the item tests, not merely
its wording. Examples include character identification, map recognition, object
recognition, sound recognition, event sequence, cause and effect, location,
interface recognition, dialogue, and meaningful knowledge.

Generation is pattern-driven:

```text
World → Scope → allowed Content Patterns → underrepresented Pattern
→ eligible event/entity → optional media → ContentItem
```

Do not choose a famous character first and force every batch around them.

## 9. No difficulty tiers

New Akwaan content has no Easy/Medium/Hard field and no 200/400/600 mapping.

Instead evaluate:

- audience accessibility;
- recognition saturation;
- cognitive load;
- ambiguity risk;
- time-to-understand;
- fairness under the mechanic's fixed timer.

Content should range naturally from familiar to demanding, but the runtime does
not store legacy difficulty labels.

## 10. Automatic answer quality

Every answer must be machine-resolvable.

- `multiple_choice`: exact option ID.
- `closest`: deterministic numeric validation.
- `match`: normalized accepted-answer set when used by compatible future mechanics.
- `vote`: deterministic tally/consensus rule.
- `split`: deterministic combined answer against accepted answers.

Use the project's single Arabic normalization utility. Never create a second normalizer.

Store concise explanations separately from answer payloads. Explanations must not
be placed inside the answer field.

## 11. Answer leakage

Reject content when the prompt, visible text, subtitles, filenames, captions,
media, option wording, or setup exposes or reconstructs the answer.

Every approval requires an explicit leakage check.

## 12. Scope compatibility and safety

A ContentItem must belong to exactly one Scope and may reference only Challenge
Types allowed by that Scope.

Respect `excludedChallengeTypeIds`. Do not bypass exclusions during generation.

Relational prompts must avoid money/income, weight/body shape, religion,
romantic relationships, intelligence, or anything likely to create an awkward
silence in front of extended family. Prefer habits, reactions, harmless quirks,
and World-framed preferences.

## 13. Reuse and repetition

Relational-only ContentItems may be reusable across sessions because answers
change with the group. Objective knowledge items normally are not reusable in
consecutive sessions for the same group.

Within one generated set, vary:

- Content Pattern;
- primary focus;
- event cluster;
- answer;
- media channel;
- gameplay feel.

Semantic duplication is judged by tested memory and answer, not wording alone.

## 14. Validation order

Validate in this order:

1. correct World and Scope;
2. compatible Challenge Types;
3. answer-mode contract;
4. factual accuracy;
5. automatic resolvability;
6. ambiguity;
7. leakage;
8. media evidence and quality;
9. semantic duplication;
10. set-level diversity and coverage;
11. player enjoyment and reveal value.

An item that fails any hard rule must be repaired or replaced, never silently approved.
