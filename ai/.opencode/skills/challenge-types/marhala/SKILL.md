# Mechanic Profile: Marhala (المرحلة)

## Identity & Player Experience
Co-op traversal with risk choice. Players choose difficulty (Easy, Medium, Hard) before seeing the question.

## Gameplay / Authoring Contract
Questions are independent. They can be text, image, or audio. 

## Payload Contract
Difficulty Tagging: `mechanicPayload.marhalaDifficulty: 'easy' | 'medium' | 'hard'`.

## Modality Constraints
- Allowed: `image`, `audio`, `none`.

## Anti-Patterns
- Too difficult for "Easy".
- Too trivial for "Hard".

## QA Gates
- Difficulty alignment.
