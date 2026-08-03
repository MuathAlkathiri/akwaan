# Classic pattern

- Variant: `classic` (also the default when the discriminator is missing).
- Source model: legacy `Question` with `questionType: ranked_list`.
- Exactly ten ranked entries.
- Free-text guesses use the canonical Arabic answer normalizer.
- Existing strikes, eliminations, point ladder, host controls, and legacy game score finalization are preserved unchanged.
- This compatibility pattern stays behind the legacy boundary; it is not silently migrated into poison deck.
