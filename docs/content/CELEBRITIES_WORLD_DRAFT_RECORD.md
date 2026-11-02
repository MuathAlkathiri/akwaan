# Draft Record: Celebrities World in the Authoring Manifest

**For the roadmap owner to adopt.** This is a draft. The roadmap has not been
edited, and the status below is a statement of this branch only.

| Item | Status |
|---|---|
| `celebrities` World and 10 Scopes in the authoring manifest | 🚧 IN PROGRESS: authored, not provisioned |
| `ekshifni` in the authoring manifest | 🚧 IN PROGRESS: authorable, not generatable |

## What exists

- `WORLD.md` for the World, and `SCOPE.md` and `KNOWLEDGE.md` for all 10 approved
  Scopes (§28.6). No `EXEMPLARS.md`.
- The manifest now lists 13 Worlds and 71 Scopes.
- All 10 Scopes are in `provision_active_world_scopes.py`, which has **not been
  run**. Use `--only=celebrities`.

## Decisions

- **Legacy Scopes:** provisioning only adds. The five legacy runtime Scopes
  (`content-creators`, `media-stars`, `acting-stars`, `sports-stars`,
  `music-stars`) stay where they are, so both sets will exist side by side. Their
  future depends on checking their content, and any database cleanup needs
  explicit owner approval.
- **Knowledge:** public career facts only, with no private life. Volatile facts
  need dated research. The exclusivity rule is in every Scope boundary.
- **Names to check:** the "Recognizable names" lists were written from memory and
  have not been source-checked. Listing a name is a placement decision, so the
  owner should confirm each one. Only Essam Al-Shawali and Halima Boland come from
  a recorded decision (§28.6). `arab-content-creators` lists no names on purpose.
- **Old file:** `worlds/celebrities/SCOPE.md` still holds the taxonomy. Nothing
  reads it now that `WORLD.md` exists, and it was left in place for the owner to
  remove or keep.

## What this does not do

- It does not activate the World, which stays draft.
- The engine still cannot generate Ekshifni. RYO and Closest can generate for
  these Scopes.
- Library rows stay gated until their `scope_status` is `MATCH`.
