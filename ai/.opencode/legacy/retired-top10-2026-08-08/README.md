# Retired Top 10 Authoring Material (2026-08-08)

The production backend renamed the mechanic from `top-10` / `poison-deck` to
`top-5` / `keep-or-give` (see `Lammah-game-backend/src/scripts/migrate-top10-to-top5.ts`).
The canonical ChallengeType document kept its `_id`; only the slug, mode, and
payload shape changed. Active authoring now targets the Top 5 contract.

This directory preserves the retired authoring material for reference:

- `SKILL.md` — the old Top 10 ChallengeType skill.
- `poison-deck-PATTERN.md` — the old poison-deck Pattern.
- `top-10.patterns.schema.json` — the old authoring schema.
- `validate_top_10.py` and `TOP-10.md` — the old validator and its contract doc.
- `classic/` — the isolated classic-compatibility Pattern, retired because the
  production runtime no longer offers a classic ranked-list mechanic.

None of this is active input. The legacy boundary in `README.md` applies.
