# Poison-deck pattern — خذها أو دسّها

- Variant: `poison-deck`.
- One continuous new-system ContentItem.
- Exactly 14 unique candidates: ten uniquely ranked 1–10 and four unique decoys.
- Candidate text is required; candidate image is optional.
- Objective ranking basis, authoritative source, and optional as-of date are content-owned.
- Server shuffles once and persists the deck.
- Exactly two teams take 14 alternating turns. Each turn lasts six seconds.
- KEEP assigns the card to the acting team; POISON assigns it to the opponent; timeout means KEEP.
- No validity or rank is exposed until the assignment phase ends.
- Reveal rank 10 through 1, followed by the four decoys, with persisted progress.
- Owned ranked card: +1 internal point. Owned decoy: -1 internal point.
- The central rule `top10.poison-deck.result` emits one `top10.poison-deck.win` ScoreEvent for the winner and none on a tie.
- Persist `successfulPoison`, `giftedValidCard`, `selfKeptDecoy`, and `selfKeptValid` per team.
