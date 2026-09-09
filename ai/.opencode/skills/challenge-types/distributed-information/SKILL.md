# Mechanic Profile: Distributed Information (ركّبها)

## Identity & Player Experience
Puzzles signature mechanic. Players must communicate their private fragments of a puzzle to find the shared solution together.

## Player Emotion
Curiosity, useful uncertainty, and shared relief when the team eliminates a plausible alternative together.

## Input Contract
The implemented runtime accepts `submit-candidate` with the current `contentItemId` plus the holder-local `localCandidateId`.

## Resolution Contract
The server resolves participant plus local ID to a private identity and compares that identity with the canonical one.

## Content Structure
One ContentItem carries neutral instruction, private reference media, candidate views, server-only identities, and authoring metadata.

## Content Safety Rules
No trivia, answer leakage, cosmetic private views, tiny inaccessible details, or any dependency on players showing phones to each other.
