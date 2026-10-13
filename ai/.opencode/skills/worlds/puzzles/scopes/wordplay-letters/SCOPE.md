# Scope: Wordplay and Letters (التلاعب بالكلمات والحروف)

- `scopeId`: `puzzles.wordplay-letters`
- `worldId`: `puzzles`
- Player-facing Arabic name: **التلاعب بالكلمات والحروف**
- Primary solve: **Language itself is the puzzle.**
- The question it asks the player: «What is the language doing here?»
- Boundary: the Arabic script and the words built from it are the material being
  manipulated, not merely the medium the question is written in.
- Included: anagrams, hidden words, add/remove/substitute letters, letter patterns, Arabic-script transformations.
- Excluded: vocabulary recall, spelling tests, 'how many letters in X', definitions,
  and anything resolved by knowing a word rather than by operating on it.
- `excludedChallengeTypeIds`: []

**«شفرة الضاد» is a question family inside this Scope — not a Scope of its own.**

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is
  invalid here. An item that a player answers by *knowing a fact* does not
  belong in this Scope regardless of how it is dressed.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what
  the player is shown. No outside lookup, no recall dependency.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
