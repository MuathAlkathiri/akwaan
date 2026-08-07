---
name: challenge-type-split-clue
description: Co-op mechanic where teammates combine complementary private clue halves.
---

# ChallengeType: Split Clue

## Experience Goal
Force meaningful verbal cooperation through partial information.
## Social Dynamic
Each teammate privately receives an incomplete clue; neither can solve alone.
## Player Emotion
Dependency, urgency, discovery, and shared accomplishment.
## Interaction Pattern
Private halves → verbal exchange → shared submission → reveal.
## Thinking Pattern
Describe, combine, infer, and normalize wording.
## Success Pattern
Each half is necessary and together they identify one accepted result.
## Failure Pattern
Either half solves alone, halves repeat information, or combined text remains ambiguous.
## Input Contract
Clients receive only their own half; the team submits one normalized result.
## Resolution Contract
Compare the combined submission with a stored accepted-answer set using the one shared Arabic normalizer.
## Content Structure
Three discrete ContentItems, each with two private clue halves and one accepted set.
## Allowed Content Patterns
- `complementary-halves`
## Content Safety Rules
Do not fragment sacred text, sensitive identity, or material distorted by separation.
## Media Compatibility
Optional private text, image, or audio halves; each channel must remain accessible.
## Scope Compatibility
Exclude Scopes where fragmentation is inappropriate or reliable halves cannot be authored.
## Validation Rules
Test information balance, private delivery, combined uniqueness, normalization, timer fit, and leakage.
## Anti-patterns
One sufficient half, synonym mismatch without aliases, public private-data delivery, or mere sentence splitting.
