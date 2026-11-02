# Mechanic Profile: Marhala (المرحلة)

## Identity & Player Experience
Co-op traversal with risk choice. Players choose difficulty (Easy, Medium, Hard) before seeing the question.

## Gameplay / Authoring Contract
Questions are independent. They can be text, image, or audio. 

## Payload Contract
Difficulty Tagging: `mechanicPayload.marhalaDifficulty: 'easy' | 'medium' | 'hard'`.

## Modality Constraints
- Allowed: `image`, `audio`, `none`.

## Image Brief
Image items use source class `FETCH_REAL`; see *Image Brief* in `.agents/skills/akwaan-media/SKILL.md`. Text and audio items need no image.

## Anti-Patterns
- Too difficult for "Easy".
- Too trivial for "Hard".

## QA Gates
- Difficulty alignment.
