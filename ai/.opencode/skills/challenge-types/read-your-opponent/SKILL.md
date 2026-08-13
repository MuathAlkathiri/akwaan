---
name: challenge-type-read-your-opponent
description: Global bluff-and-prediction mechanic using simultaneous private answer and Steal or Trust decisions.
---

# ChallengeType: Read Your Opponent

## Experience Goal
Create a meaningful read of an opponent's confidence, honesty, and bluff.

## Social Dynamic
One team answers privately while the opposing team privately chooses Steal or
Trust during the same blind window.

## Player Emotion
Suspicion, confidence, doubt, risk, relief, and reveal tension.

## Interaction Pattern
Prompt → simultaneous hidden choices → simultaneous reveal → payoff resolution.

## Thinking Pattern
Answer plausibly, estimate confidence, read rivals, and decide whether risk is
worth taking.

## Success Pattern
Both answer and prediction feel defensible before reveal; the outcome changes
how teams read each other across the three-item sequence.

## Failure Pattern
An obvious or impossible answer eliminates the social decision. Ambiguity,
human judgment, or leaked in-progress state invalidates the exchange.

## Input Contract
Answering team submits an option ID or numeric estimate. Opposing team submits
`steal` or `trust`. Neither receives the other's in-progress state.

## Resolution Contract
`trust + correct`: answering team +1. `trust + wrong`: opposing team +1.
`steal + correct`: opposing team +1. `steal + wrong`: opposing team −1.
Preserve signed events even if display totals clamp at zero.

## Content Structure
Three discrete ContentItems per challenge. Each item uses `multiple_choice` or
`closest`. Optimize for confidence uncertainty and bluff potential, not maximum
factual demand.

## Allowed Content Patterns
- `multiple-choice`
- `closest`

## Content Safety Rules
Use fair, quickly understood material. Reject sensitive personal inference,
humiliation, and claims without reliable support.

## Media Compatibility
Text, image, audio, or video may be used when essential and answer-safe. Media
belongs to the ContentItem.

## Scope Compatibility
Works across Worlds. Respect Scope exclusions and Pattern-specific limits.

## Validation Rules
Confirm deterministic truth, meaningful uncertainty, automatic resolution,
server-side privacy, no leakage, plausible alternatives, and three-item variety.

## Anti-patterns
Obscure date recall, certainty near 0% or 100%, opinion, explanation-dependent
outcomes, open judged text, absurd alternatives, decorative media, or unequal
private information.

World configuration must provide a distinct display name and differ from other
World presentations in at least two of input type, timer, media profile, sound,
or reveal style. This configuration never changes the mechanic.
