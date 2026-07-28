# Bomb Mode Phase 1 Architecture

Bomb content remains inside the existing category and question bounded
contexts. `Category.gameplayMode` is the narrowest authority for play style and
gains `BOMB`; missing values continue to mean `STANDARD`.

`Question.questionType` remains the content discriminator and gains
`bomb_sequence`. Bomb content is a typed embedded structure containing 10–15
ordered items. Each item has a stable UUID, normalized order, one managed image
reference, and one or more authoring-time accepted answers. The shared
`question` field remains the prompt. Review status, difficulty, ownership, and
all other existing question workflow fields are unchanged.

The existing question create/update service resolves the persisted category
and validates the complete discriminated document before one repository write.
Classic and ranked-list paths are unchanged. Item images use the existing local
image storage service through a focused authenticated upload endpoint; stored
references are restricted to the managed Bomb-item directory.

Bomb readiness is an authoritative question-query projection. A category is
ready only with exactly two approved, structurally valid questions at each
difficulty and no invalid Bomb questions. Draft authoring is not blocked by
category incompleteness.

No gameplay runtime, timer, scoring, voice, answer-matching, or live Bomb UI is
introduced.
