# Production database migration plan — `lammah-quiz` → `Akwaan-prd`

> **Status (2026-11-18): 🟡 PLAN — NOT EXECUTED.** Approved target name `Akwaan-prd` (Product Owner, 2026-11-18).
> This is the **last** pre-launch infrastructure cutover, after repository cleanup, the separately authorised
> Production test-data cleanup and VPS readiness. Do **not** create `Akwaan-prd`, change `MONGODB_URI`, or touch
> `lammah-quiz` until this plan is executed under its own explicit authorisation.

## 0. Principles

- **Copy, never rename in place.** `lammah-quiz` stays untouched and becomes the rollback.
- **Clean before, copy 1:1.** Disposable data is removed from `lammah-quiz` *first* (separately authorised run of
  `backend/src/scripts/cleanup-disposable-test-data.ts`, §2), so the migration itself is a verifiable 1:1 copy.
  Whole-collection exclusions at copy time are allowed only when listed in the approved manifest.
- **Writes frozen** for the whole copy-and-switch window, so no snapshot/oplog reconciliation is needed.
- **The app reads only `MONGODB_URI`.** The database name lives solely in that secret's URI path; nothing in the
  running code depends on the name.

## 1. What is retained

| Class | Collections | Rule |
|---|---|---|
| Canonical content & taxonomy | `worlds`, `scopes`, `challenge_types`, `world_challenge_configurations`, `content_items`, `scoped_mechanic_tutorials` | All remaining documents (test catalogue already removed in §2). |
| Media & rights | `media_rights` (binaries live in R2 / `/uploads` and are **not** affected by the DB name) | All. |
| Content-engine provenance & spend | `engine_jobs`, `engine_candidates`, `engine_draft_publications`, `engine_cost_ledger`, `engine_budget`, `engine_inventory_fences` | All (provenance + financial). |
| Integrity & config records | `production_mechanic_lifecycle`, `admin_deletion_log`, `world_content_fences` | All. |
| Accounts | `users` | All remaining (operator/admin accounts; anyone with a subscription or provenance reference). |
| Live coordination | `backend_instance_leases`, `otp_challenges` | Copy as-is (empty or short-lived; harmless). |
| Gameplay | `live_game_sessions`, `matches`, `gameplay_runtimes`, `live_session_presence`, `live_session_join_access`, `content_exposures` | Whatever survives the §2 cleanup (sessions that were live at cleanup time). |

## 2. Excluded / removed before the copy (needs its own authorisation)

1. Read-only Production dry run (manifest):
   `CLEANUP_MONGODB_URI=<prod uri> … cleanup-disposable-test-data.ts --environment=production --database=lammah-quiz --categories=gameplay-history,legacy-history,expired-caches,test-catalogue,test-users --report=<file>`
   The tool **refuses to delete in production**; the manifest is reviewed and approved by the Product Owner.
2. Execution of the approved manifest is a separate, explicitly authorised operation (e.g. a reviewed one-off
   run with the same filters against a verified backup). Order: gameplay history → legacy history → caches →
   test catalogue → test users (users last, after re-checking references).
3. Collections that are wholly disposable after the legacy-system removal (`games`, `questionhistories`,
   `ai_knowledge_units`, and — after the PO decision on legacy content — `questions`, `categories`, `catalogs`,
   `musictracks`, `content_categories`) may instead be excluded at copy time with `--nsExclude`, but **only** if the
   approved manifest lists them. `questions` carries legacy media URLs; confirm no ContentItem depends on those
   files before excluding (files are not deleted either way).

## 3. Integrity of approved content and media

- Media files are addressed by URL (`/uploads/...` → R2). The DB name does not appear in any media key, so no
  media moves. Verify a sample of ContentItem `media.assets[].url` resolve before and after.
- Referential checks after the copy (must all be 0, as in the local rehearsal of the cleanup tool):
  ContentItems without a World / Scope, Scopes without a World, bindings pointing at a missing World or
  mechanic, ContentItems compatible with an unknown mechanic, publications pointing at a missing ContentItem.

## 4. Indexes and unique constraints

- `mongodump`/`mongorestore` carry index definitions; restore with indexes (default).
- After restore, compare `getIndexes()` for every collection between the two DBs (must be identical), then
  reconcile known drift **as a separate, reviewed step** (inventory: missing code-declared indexes on `scopes`,
  `content_items`, `engine_jobs`, `engine_candidates`; stale `challenge_types` `{worldId}` / `{worldId,slug}`
  indexes). Do not let `autoIndex` silently build large indexes during the cutover window.
- Unique constraints that matter for correctness: `matches` partial unique `(liveSessionId, active)`,
  `content_exposures (ownerAccountId, challengeTypeKey, contentItemId)`, `engine_draft_publications.candidateId`
  and `.contentItemId`, `admin_deletion_log.requestId`, slugs.

## 5. Authentication and permissions

- Atlas (or self-hosted) user **scoped to `Akwaan-prd`** with `readWrite` only; new password, stored only in the
  host's secret store. Do not reuse the `lammah-quiz` user.
- After cutover, demote the old user to `read` on `lammah-quiz` (rollback reads only), then remove it at
  retirement (§12).
- Note: MongoDB database names are case-sensitive but two names differing only by case cannot coexist; check
  no `akwaan-prd` exists. `Akwaan-prd` is a valid name (hyphen allowed, ≤ 63 chars).

## 6. Verified full backup (before anything)

- Atlas on-demand snapshot of the cluster **and** `mongodump --db=lammah-quiz --archive --gzip` stored off-host.
- Restore-test the archive into a scratch DB and compare counts before the window opens. Record both references.

## 7. Consistent snapshot and write freeze

1. Announce the window; confirm no live session (or accept ending them).
2. Stop writes: suspend the backend (Render: suspend / scale to 0; VPS: `docker compose stop backend`). The
   frontend can stay up; it will show the API as unavailable.
3. Confirm quiescence: no connections from the app user; collection counts stable for 2 minutes.

## 8. Tools and namespace mapping

```bash
mongodump  --uri "$SOURCE_URI" --db=lammah-quiz --archive=lammah-quiz.cutover.gz --gzip
mongorestore --uri "$TARGET_URI" --archive=lammah-quiz.cutover.gz --gzip \
  --nsFrom='lammah-quiz.*' --nsTo='Akwaan-prd.*' \
  # --nsExclude='lammah-quiz.<collection>'   # only collections listed in the approved manifest
```

Use MongoDB Database Tools ≥ 100.x matching the server version. Same cluster is fine (a different database).

## 9. Production configuration changes (the only runtime change)

- `MONGODB_URI` path `/lammah-quiz` → `/Akwaan-prd` on the backend host (Render dashboard secret today; VPS
  `deployment/.env` later). Nothing else is read at runtime.
- Repository follow-ups (non-runtime, after cutover): `render.yaml` comment, `docker-compose.yml` default URI,
  `backend/.env.example`, `deployment/` scripts' `DB_NAME` defaults (incl. the `copy-local-db-to-atlas.sh` guard
  that requires the name `lammah-quiz`), backend script fallbacks (`src/scripts/migrate-*.ts`,
  `provision-production-mechanics.ts`), local e2e specs, docs. Local/dev databases may keep their own names.
- Docker volume names `lammah-game_*` / `lammah_*` are a different identifier; renaming them is optional and
  unrelated to this cutover.

## 10. Verification after the copy (before reopening)

1. Per-collection document counts: `Akwaan-prd` == `lammah-quiz` (minus approved exclusions). Record the table.
2. Index lists identical (§4). Sample-document hashes for `content_items`, `worlds`, `users`, `media_rights`.
3. Referential checks (§3) all 0.
4. Start the backend on the new URI: `/health` → `{status: ok, database: connected, commit: <sha>}`; logs show the
   expected database name; presence lease registered; deadline re-arm summary.
5. Smoke: admin login, World/Scope/mechanic lists, a Content Engine review page, create a room, play one
   challenge, reconnect a phone.

## 11. Rollback

- **Before reopening:** point `MONGODB_URI` back to `/lammah-quiz` (untouched) and restart. No data loss.
- **After reopening:** writes made to `Akwaan-prd` are not in `lammah-quiz`. Either roll forward (fix and stay), or
  copy the new writes back with a reviewed reverse dump of the affected collections. Decide the go/no-go
  **inside the window** to avoid this case.

## 12. Retirement of `lammah-quiz` (later, separately authorised)

- Keep it read-only for at least 30 days after a stable cutover, plus its final archive and the pre-cutover
  snapshot.
- Delete it only with explicit Product Owner approval, after a final archive is verified restorable.
