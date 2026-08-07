# Final Board Composition

## Output

Create exactly one final PNG for each puzzle.

Canvas:

- width: 1600 px
- height: 900 px
- PNG format

## Layout

For two-part puzzles:

- first card on the left,
- large plus sign in the center,
- second card on the right.

For three-part puzzles:

- three equal cards,
- plus signs between them.

## Cards

Each card must:

- have equal dimensions,
- use a white or very light background,
- contain the image using contain,
- preserve aspect ratio,
- never stretch,
- never crop the main subject,
- use consistent internal padding,
- use a subtle border or shadow.

## Forbidden content

Do not include:

- answer,
- captions,
- image names,
- pronunciation hints,
- explanation,
- Arabic text,
- English text,
- file paths.

## Composition method

Use Pillow, Sharp, or ImageMagick for deterministic board composition.

Do not ask the image model to generate the entire board.

## Deliverable

The combined board is the final upload-ready asset.

Individual images are internal supporting assets.