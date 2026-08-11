# Leakage Validation

Inspect prompt, options, filenames, image text, subtitles, HUD text, captions,
audio, video overlays, alt text, metadata, search terms, explanations, and all
private payloads. The server must omit unauthorized values entirely.

Run a blind asset test using only the final player-facing media. Reject an asset
that lacks necessary evidence or exposes the resolved value.

## One Clue short-alias policy

One Clue leakage checks run through the same Arabic normalization as the backend
answer matcher. Because short answers are easy to collocate accidentally, the
threshold is size-dependent: a normalized accepted answer of four characters or
more leaks if it appears as a substring of any player-facing text, while a
shorter answer (up to three normalized characters) leaks only if it equals a
whole token. A two-character word buried inside another word is not a leak;
`من` appearing inside `منتخب` must not fail a clue. Authors must still avoid
name prefixes and aliases that trivially identify the answer, and the Reviewer
runs the alias test independently of this mechanical threshold.

