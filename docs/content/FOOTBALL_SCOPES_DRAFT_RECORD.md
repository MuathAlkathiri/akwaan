# Draft Record: Two New Football Scopes

**For the roadmap owner to adopt.** This is a draft. The roadmap has not been
edited, and the status below is a statement of this branch only.

| Scope | Arabic name | Status |
|---|---|---|
| `football/uefa-super-cup` | كأس السوبر الأوروبي | 🚧 IN PROGRESS: authored, not provisioned |
| `football/saudi-national-team` | المنتخب السعودي | 🚧 IN PROGRESS: authored, not provisioned |

## What exists

- `SCOPE.md` and `KNOWLEDGE.md` for both. No `EXEMPLARS.md`, by decision.
- Both are in the authoring manifest, which now lists 61 Scopes.
- Both are in `provision_active_world_scopes.py`, which has **not been run**.
  Until it runs against a database, that database cannot hold DRAFTs for these
  Scopes.

## Decisions

- **Boundaries:** set only in the two new Scopes. Existing Scopes are unchanged,
  so they can still overlap: Saudi Arabia at the World Cup also fits `world-cup`,
  Super Cup finalists also fit `champions-league`, and `saudi-league` does not
  exclude national team content. Duplicates are checked per Scope, so the same
  fact could appear in both.
- **Knowledge:** stable facts only, with no coaches, squads or records. Those
  need dated research before use. The facts stated were written from memory and
  have not been source-checked.

## Library rows

| Row | Scope | Status | Effect |
|---|---|---|---|
| LIB-010 | `saudi-national-team` | MATCH | Feeds RYO only |
| LIB-034 | `saudi-national-team` | REJECT | Stays out |
| LIB-077 | `uefa-super-cup` | NEW_SCOPE | Stays gated, and is Top-5 only |

With one row, `saudi-national-team` carries at most 3 anchored candidates per
request. `uefa-super-cup` has no RYO or Closest rows, so it runs exploratory only.

## Known limits

`uefa-super-cup` is one match a year, so its question pool is small. It suits
Top-5 best, which the engine cannot generate yet.
