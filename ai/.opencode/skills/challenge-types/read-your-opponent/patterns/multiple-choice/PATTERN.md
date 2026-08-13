---
patternId: multiple-choice
owningChallengeType: read-your-opponent
---

# Pattern: Multiple Choice

- Experience goal: produce plausible confidence with room for bluffing.
- Interaction shape: select one option while rivals choose Steal or Trust.
- ContentItem shape: prompt plus two to four same-class options.
- Interaction payload: `{ "options": [{"id": "...", "label": "..."}] }`.
- Resolution payload: `{ "correctOptionId": "..." }`.
- Machine resolution: exact option-ID equality, then the owner payoff matrix.
- Constraints: one correct option; two to four plausible alternatives; no joke
  alternative; prompt understandable within seconds.
- Scope compatibility: any factual Scope not excluding the owner.
- Media compatibility: optional and essential only.
- Tension levers: semantic closeness, familiar confusion, partial recognition.
- Anti-patterns: exposed labels, unmatched semantic classes, obscure trivia,
  several defensible options, or one visually longer obvious option.
- Valid example: identify which of four familiar clubs won a named final.
- Invalid example: one real club beside three invented names.
