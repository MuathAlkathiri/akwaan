# Top 10 Validation

## Canonical Identifiers

- ChallengeType: `top-10`
- active Pattern: `poison-deck`
- compatibility Pattern: `classic`
- runtime mode: `top_10`
- scoring rule: `top10.poison-deck.result`
- winner event: `top10.poison-deck.win`

## Hard Checks

Validate one continuous ContentItem; membership-oriented prompt; objective
ranking basis; authoritative source URL and as-of date; fourteen unique
candidates; ten valid entries with unique ranks 1–10; four unique decoys;
disjoint exhaustive sets; explicit authoritative tiebreaker whenever equal
source values affect ordering; near-cutoff decoy quality; and no leakage of
validity, rank, internal score, or shuffled order.

Runtime constants are exactly two teams, fourteen alternating turns, six
seconds, KEEP/POISON, timeout KEEP, rank-10-to-1 reveal followed by decoys,
+1 valid, −1 decoy, zero poison bonus, one Match point for the higher internal
score, and no Match event on a tie.

The reviewer records distance from cutoff, plausibility, and easy-decoy risk for
all four decoys. Counts alone are insufficient.
