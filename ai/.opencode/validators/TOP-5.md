# Top 5 Validation

## Canonical Identifiers

- ChallengeType: `top-5`
- active Pattern: `keep-or-give`
- runtime mode: `top_5`
- scoring rule: `top-5.result`
- winner event: `top-5.win`

## Hard Checks

Validate one continuous ContentItem; membership-oriented prompt; objective
ranking basis; authoritative source URL and as-of date; ten unique entries;
exactly five ranked entries holding the unique ranks 1–5; exactly five traps
(no rank); disjoint exhaustive sets; explicit authoritative tiebreaker whenever
equal source values affect ordering; near-cutoff trap quality; and no leakage
of validity, rank, internal score, or shuffled order.

Runtime constants are exactly two teams, ten alternating turns, fifteen
seconds, `keep`/`give`, host-skip `keep`, a server-owned reveal order, one
point per real card owned, and one Match point for the team owning more of the
five real entries (no tie event).

The reviewer records distance from cutoff, plausibility, and easy-trap risk for
all five traps. Counts alone are insufficient.
