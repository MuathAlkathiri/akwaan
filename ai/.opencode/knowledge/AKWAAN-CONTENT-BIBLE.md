# Akwaan Content Bible

## Purpose

Akwaan is a social party game. Content exists to create interaction: bluffing, trust, prediction, cooperation, classification, coordination, laughter, and memorable reveals. Knowledge supports those moments; it is not the product's primary goal.

## Canonical Authoring Principle

> **"Never begin by asking what trivia facts can I write.**
> **Begin by asking what interaction/question shape would be fun to play.**
> **Then find a recognizable, fair fact that fits that shape."**

## Experience-First Generation Order

Before generating any ContentItem, agents must strictly follow the canonical 7-step pipeline:

```text
1. GLOBAL QUESTION CRAFT (.opencode/knowledge/architecture/QUESTION-CRAFT.md)
   ↓
2. QUESTION ARCHETYPE SELECTION (.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md)
   ↓
3. WORLD GUIDANCE (.opencode/skills/worlds/<world>/WORLD.md)
   ↓
4. SCOPE & KNOWLEDGE GUIDANCE (.opencode/skills/worlds/<world>/scopes/<scope>/KNOWLEDGE.md)
   ↓
5. MECHANIC COMPATIBILITY (.opencode/knowledge/architecture/MECHANIC-COMPATIBILITY.md)
   ↓
6. BATCH VARIETY REVIEW (.opencode/knowledge/architecture/BATCH-VARIETY.md)
   ↓
7. FACT, ANSWER & ZERO LEAKAGE QA (.agents/skills/akwaan-content-qa/SKILL.md)
```

Judge quality by asking:
- Does it create an active play shape (bluff, rapid recognition, completion, reverse deduction)?
- Is the interaction immediately understandable in <3 seconds?
- Is resolution deterministic, fair, and automatic?
- Does it fit the ChallengeType, World, and Scope?
- Is the prompt short, mobile-friendly, and phrased in natural conversational Arabic?
- Does it strictly obey the Zero Answer Leakage Rule?
- Will the reveal create a memorable group moment?

Factual accuracy remains mandatory whenever the item makes a factual claim.

## Ownership Model

- **ChallengeType** owns mechanic behavior, interaction, input, resolution, structure, Patterns, safety, media compatibility, and validation.
- **Content Pattern** belongs to exactly one ChallengeType.
- **Question Archetypes** (.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md) define the 20 global play shapes (e.g. `NAME_FRAGMENT`, `CAREER_PATH`, `REVERSE_QUESTION`).
- **World** owns theme, tone, presentation profile, Question Palette, and signature mechanic.
- **Scope** belongs to one World and owns tagging boundaries, exclusions, and durable knowledge.
- **ContentItem** belongs to exactly one Scope and lists compatible ChallengeTypes.
- **Media** is optional data owned only by the ContentItem via canonical media intents.

## ContentItem Standard

Every active output is a ContentItem with:
- stable `id` and `scopeId`;
- `compatibleChallengeTypeIds`;
- one owned `patternId`;
- concise player-facing `prompt`;
- `interactionPayload` appropriate to the mechanic;
- deterministic `resolutionPayload` (`answerPayload` with canonical mode and `acceptedAnswers`);
- optional `media`;
- `isReusableAcrossSessions`;
- provenance, authoring archetype (`questionArchetype`), and validation metadata.

The runtime may support `ryo`, `multiple_choice`, `closest`, `match`, `vote`, `split`, `top_5`, and `distributed`. Every mode resolves without a human referee using canonical Arabic normalization.

## Media and Leakage

Media is optional and must materially enable the interaction. The final asset must carry the evidence needed by the player. Reject leakage through prompts, options, filenames, visible text, subtitles, HUD text, captions, audio, overlays, alt text, metadata, search terms, premature explanations, or private payloads.

## Hard Rejections

Reject any item that:
1. Violates the **Zero Answer Leakage Rule** (any prompt/media hint that allows deducing the answer without domain knowledge).
2. Exhibits any of the 10 Question Quality Anti-Patterns (`ANTI_FACT_FIRST`, `ANTI_OBSCURE`, `ANTI_WIKIPEDIA`, `ANTI_LEAKAGE`, `ANTI_FAKE_DIFF`, `ANTI_SAME_SHAPE`, `ANTI_HOST_AMBIG`, `ANTI_OVER_SPEC`, `ANTI_UNDER_SPEC`, `ANTI_WALL_TEXT`).
3. Repeats a single archetype $>35\%$ in a batch or produces monolithic prompt openings ($>40\%$ starting with `"من / ما"`).
4. Is ambiguous without intention or cannot resolve automatically.
5. Violates Scope exclusions or relies on obscure facts without social payoff.
