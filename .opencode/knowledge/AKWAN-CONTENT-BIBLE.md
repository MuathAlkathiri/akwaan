# Akwaan Content Bible

## Purpose

Akwaan is a social party game. Content exists to create interaction: bluffing,
trust, prediction, cooperation, classification, coordination, laughter, and
memorable reveals. Knowledge supports those moments; it is not the product's
primary goal.

## Experience First

Canonical generation order:

```text
ChallengeType → Interaction Design → Content Pattern → World → Scope
→ Scope Knowledge → ContentItem
```

A technically accurate item is not good unless it creates the interaction
promised by its ChallengeType. Factual obscurity is never a quality target.

Judge quality by asking:

- Does it create a decision, discussion, bluff, prediction, or cooperation?
- Is the interaction quickly understandable?
- Is resolution deterministic and automatic?
- Does it fit the ChallengeType, World, and Scope?
- Is uncertainty intentional and fair?
- Does it avoid human judgment and private-information leakage?
- Will the reveal create a memorable group moment?

Factual accuracy remains mandatory whenever the item makes a factual claim.

## Ownership Model

- ChallengeType owns mechanic behavior, interaction, input, resolution,
  structure, Patterns, safety, media compatibility, and validation.
- Content Pattern belongs to exactly one ChallengeType.
- World owns theme, tone, sound, presentation profile, and exactly one future
  exclusive Signature mechanic.
- Scope belongs to one World and owns tagging boundaries, exclusions, and
  durable knowledge.
- ContentItem belongs to exactly one Scope and may list several compatible
  ChallengeTypes.
- Media is optional data owned only by the ContentItem.

Worlds and Scopes never define mechanic behavior or authoritative Pattern
allowlists. Shared ChallengeTypes are global and reusable across Worlds.

## ContentItem Standard

Every active output is a ContentItem with:

- stable `id` and `scopeId`;
- `compatibleChallengeTypeIds`;
- one owned `patternId`;
- concise player-facing `prompt`;
- `interactionPayload` appropriate to the mechanic;
- deterministic `resolutionPayload`;
- optional `media`;
- `isReusableAcrossSessions`;
- provenance and validation metadata.

The runtime may support `ryo`, `multiple_choice`, `closest`, `match`, `vote`,
`split`, `top_5`, and `distributed`. Every mode resolves without a human referee.
Accepted-text matching uses the project's single Arabic normalization utility,
except `distributed-information` `match`, which the runtime compares after simple
trim, lowercase, and whitespace collapse.

## Core Families

- Read Your Opponent: simultaneous private answer plus Steal/Trust prediction.
- Split: rapid deterministic classification into two or three groups.
- Top 5: alternating KEEP/GIVE decisions across a hidden ten-card deck with
  five real ranks and five traps.
- Co-op: partial information forces verbal dependency between teammates.
- Distributed Information: simultaneous two-team synthesis race over three private-segment items.
- Relational: agreement, consensus, or teammate prediction; no external truth.
- Signature: one exclusive, auto-resolvable mechanic per World, defined later.

Relational ContentItems are reusable because results change with the group.
Objective items should not repeat in consecutive sessions for the same group.

## Safety

Relational content must avoid money or income, body shape or weight, religion,
romantic relationships, intelligence, and anything likely to create an awkward
family-group silence. Prefer harmless habits, reactions, preferences, quirks,
and World-framed behavior.

## Media and Leakage

Media is optional and must materially enable the interaction. The final asset
must carry the evidence needed by the player. Reject leakage through prompts,
options, filenames, visible text, subtitles, HUD text, captions, audio,
overlays, alt text, metadata, search terms, premature explanations, or private
payloads sent to the wrong team.

Private values are withheld server-side; hiding shipped data in the interface
is not protection.

## Hard Rejections

Reject any item that is ambiguous without intention, cannot resolve
automatically, violates Scope exclusions, uses decorative or insufficient
media, leaks its outcome, duplicates the tested interaction, relies on obscure
facts without social payoff, or fails the selected ChallengeType's experience.

Validation order: ChallengeType contract, Pattern contract, Scope compatibility,
payload shape, factual support, automatic resolution, safety, leakage, media,
duplication, set diversity, and interaction value.
