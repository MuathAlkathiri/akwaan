---
name: challenge-type-guess-your-teammate
description: Relational mechanic where one player answers privately and a teammate predicts that answer.
---

# ChallengeType: Guess Your Teammate

## Experience Goal
Create a safe prediction reveal about a teammate's thematic preference or reaction.
## Social Dynamic
Player A answers privately; Player B independently predicts A's option.
## Player Emotion
Trust, doubt, recognition, surprise, and laughter.
## Interaction Pattern
Private answer plus private prediction → simultaneous reveal → equality check.
## Thinking Pattern
Model a teammate's harmless preference or likely World-framed choice.
## Success Pattern
Every option is plausible and the reveal says something playful about team familiarity.
## Failure Pattern
Sensitive inference, coercive wording, public early answer, or free-text mismatch.
## Input Contract
Answerer and predictor each submit one option ID through separate private payloads.
## Resolution Contract
Exact option-ID equality.
## Content Structure
Three reusable ContentItems with two to four safe options.
## Allowed Content Patterns
- `private-prediction`
## Content Safety Rules
Apply all relational exclusions and avoid reputational or embarrassing claims.
## Media Compatibility
Optional neutral thematic media; it must not favor an option.
## Scope Compatibility
Choices must be meaningful within the selected Scope.
## Validation Rules
Verify role-scoped visibility, option balance, exact resolution, safety, replayability, and prompt clarity.
## Anti-patterns
External correctness, sensitive traits, one socially required option, free text, or answer leakage.
