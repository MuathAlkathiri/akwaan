# Arabic Guess the Picture

## Purpose

Create high-quality Arabic rebus puzzles where players identify the Arabic names of the images, combine their spoken sounds, and discover a completely new Arabic word or expression.

The images are clues.

The final answer must never be a literal description of the displayed images.

The final deliverable is one production-ready combined PNG board.

---

## Required Workflow

1. Select a candidate Arabic answer.
2. Apply `arabic-phonetics.md`.
3. Apply `puzzle-design.md`.
4. Validate the linguistic puzzle using `validation.md`.
5. If the puzzle fails validation, discard it completely and choose a different answer.
6. Apply `visual-rules.md`.
7. Create provider-neutral `generated_image` Asset tasks using
   `image-generation.md`.
8. Continue only if a future separately configured provider has produced real
   local images; otherwise report the puzzle as incomplete.
9. Validate the local generated images.
10. Compose the final board using `board-composition.md`.
11. Perform final board validation.
12. Return the final board path and puzzle metadata.

---

## Hard Rules

- Think entirely in Arabic when designing puzzles.
- Never reason from English pronunciation.
- Never begin with images; always begin with the answer.
- Never use random images related only by meaning.
- Never force a decomposition that sounds unnatural.
- Never repair a rejected puzzle; discard it and choose another answer.
- Never generate images before the linguistic puzzle passes validation.
- Never fabricate generated images or mark a provider-neutral task complete
  without a readable local file.
- Never generate a puzzle whose answer is simply the literal description of the displayed images.
- Every accepted puzzle must create a genuine rebus transformation and an "Aha!" moment.
- One excellent puzzle is always better than ten weak puzzles.
- The final user-facing deliverable is the combined PNG board.
