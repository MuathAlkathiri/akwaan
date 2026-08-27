# Akwaan — FIFA Player Card Identity Masking Reference

This document is the visual source of truth for FIFA / EA FC player-card identity questions.

## Intended visual result

When the question is:

مين هذا اللاعب؟

Start from a REAL authentic FIFA / EA FC player card.

The final player-facing card must look like the original authentic card with the player identity naturally removed.

### Portrait removal

REMOVE:
- player face
- hair
- body / portrait artwork

Do NOT replace them with:
- blur
- silhouette
- checkerboard
- black rectangle
- censor bar
- placeholder person
- obvious overlay
- striped pattern
- artificial empty box

Instead:

Reconstruct the portrait region using the SAME visual language already present in the authentic card.

The empty portrait area must inherit:
- the card's own background texture
- gradients
- geometric shapes
- lighting
- metallic / paper / marble treatment
- promo-event artwork

There should be NO obvious boundary showing where the player used to be.

The ideal result looks like:

"the authentic card artwork naturally continues through the area where the player portrait used to exist."

NOT:

"the player was censored."

## Name removal

Remove the player name completely.

Do NOT cover it with:
- black bar
- dark censor rectangle
- obvious text cover

Instead reconstruct the name region with the surrounding authentic nameplate/card material so it looks naturally blank.

No residual letters.

## Gameplay clues

The primary clues for PLAYER IDENTIFICATION should be the player's FIFA gameplay profile.

Preserve:
- authentic card design / rarity
- six face stats:
  PAC
  SHO
  PAS
  DRI
  DEF
  PHY
- PlayStyles / PlayStyle+ when actually part of that card

Direct identity metadata should NOT carry the answer.

Hide when it makes recognition trivial:
- nationality flag
- club badge
- league
- other direct identity metadata

OVR and Position are difficulty levers.
They are not automatically visible.

## Difficulty

Masking quality must NEVER be used as difficulty.

All difficulty levels use the same premium seamless concealment.

Difficulty primarily comes from the CARD VARIANT.

### EASY
Normal / Base / Gold player card.

Example:
A famous player's standard Gold card with portrait and name removed.

The player recognizes a familiar standard gameplay-stat profile.

### HARD
Special / Event / Promo player card.

Examples:
- TOTY
- TOTS
- FUT Birthday
- Shapeshifters
- Future Stars
- Flashback
- Special Hero
- Special Icon
- other historical promo variants

The player must recognize the footballer from a less-standard FIFA profile and special-card attributes.

Therefore:

BASE / GOLD CARD
→ Easy candidate

SPECIAL / EVENT / PROMO CARD
→ Hard candidate

Do NOT make a Gold card Hard by hiding more information.

## Prompt

For player identity:

مين هذا اللاعب؟

No extra verbal hints.

## Quality bar

The final image must feel:
- premium
- clean
- card-native
- seamless
- believable
- intentionally designed for the game

If the concealment itself attracts attention, it fails.

The player should notice the CARD and its STATS — not the MASK.
