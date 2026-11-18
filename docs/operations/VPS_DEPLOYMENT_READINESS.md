# Akwaan — Provider-neutral VPS deployment readiness audit

> **Status (2026-11-18):** audit of `origin/main` `26fd54c`, promoted from the pre-launch cleanup.
> Nothing here has been deployed. Hosting provider **not chosen** (Hostinger VPS or AWS EC2 — this plan is
> provider-neutral). Items marked ✅ *(cleanup branch)* are implemented on `chore/pre-launch-cleanup` and
> verified locally only. The database rename (`lammah-quiz` → `Akwaan-prd`) is planned separately in
> [`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md) and is the **last** pre-launch cutover step.


- **Audited tree:** git worktree at `origin/main` `26fd54c` (`/Users/muath/akwaan/ai/workbench/artifacts/cleanup/wt`)
- **Date:** 2026-11-18
- **Mode:** read-only. No builds, installs, tests, compose runs or deploys. No credentials used.
- **Target:** one VPS (Hostinger or AWS EC2, provider **not chosen**). Nothing below assumes AWS-only services.
- **Live evidence (unauthenticated public GETs only):**
  - `GET https://akwaan-api.onrender.com/health` → `200 {"status":"ok","database":"connected","commit":"26fd54c866751feb22f39139ad93ba8a68e60bc6"}`. Render is serving current `main`.
  - `GET /worlds` → a banner `/uploads/world-content/worlds/world-…png`; `HEAD` on that path → `302` to `https://pub-6db8177278dd4bffacfc18c1307f7b7e.r2.dev/...`. **Production media is served from the R2 `r2.dev` development URL.**
  - `HEAD` on that R2 object → `200`, `Content-Type: image/png`, `ETag`, **no `Cache-Control` header**.

Status vocabulary: **READY** / **NEEDS CONFIGURATION** / **NEEDS IMPLEMENTATION** / **NEEDS DECISION** / **NOT VERIFIED**.

---

## 0. Key finding up front: a VPS deployment kit already exists, but it is stale

The repo already has a single-host deployment: `deployment/docker-compose.oracle.yml` (Mongo RS + backend + frontend + Caddy), `deployment/Caddyfile`, `deployment/.env.oracle.example`, `deployment/README.md` and scripts (`deploy.sh`, `export-local-data.sh`, `restore-data.sh`, `verify-deployment.sh`). It predates the Render/Vercel/Atlas/R2 BETA, and it does not match the production setup today:

| Gap in `deployment/docker-compose.oracle.yml` | Evidence |
|---|---|
| Self-hosted Mongo with a hardcoded URI, so Atlas cannot be used without editing | `docker-compose.oracle.yml:28` `MONGODB_URI: mongodb://mongodb:27017/lammah-quiz?replicaSet=rs0` |
| No R2 env (`R2_*`, `MEDIA_PUBLIC_BASE_URL`), so uploads would live only on a local volume | `:25-44` (absent) |
| No OTP/email env (`RESEND_API_KEY`, `OTP_MAIL_FROM`, `OTP_HASH_PEPPER`), so passwordless login would not work | `:25-44` (absent); OTP is the login path per `render.yaml:89-111` |
| Still uses the old admin bootstrap env (`ADMIN_EMAIL/PASSWORD`), which `backend/.env.example:50-52` says no longer exists | `:33-35` |
| Builds images on the VPS (`up -d --build`), which needs a lot of RAM for `next build` | `deployment/scripts/deploy.sh:15`; README recommends 8 GB for builds (`deployment/README.md:9-10`) |
| No commit SHA injected, no log rotation, no `stop_grace_period`, no image tags, so no rollback | entire file |
| Backup/restore scripts hardcode the DB name and only reach the in-compose `mongodb` container | `export-local-data.sh:12-14`, `restore-data.sh:23-25`, `verify-deployment.sh:13-15` |

**Recommendation:** keep the shape (Compose + Caddy) and replace this file with a new `deployment/compose.prod.yml` that reflects today's production (Atlas or self-hosted RS, R2, OTP, pre-built images). Details are in §4–§6.

---

## 1. VPS readiness matrix

### 1.1 Application

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| A1 | Backend image build/start | **READY** | `backend/Dockerfile` is a multi-stage workspace build (`:1-31`). Runtime is `node:20-bookworm-slim` with ffmpeg, python3, yt-dlp and tini (`:37-40`). Runs as `USER node` (`:57`), `ENTRYPOINT tini` (`:66`), `CMD node backend/dist/main.js` (`:67`, node is started directly so it receives signals). It ships `ai/.opencode` for the Content Engine (`:51-53`). It is the same image Render runs (`render.yaml:18,28-29`). |
| A2 | Backend listen/port | **READY** | Binds `0.0.0.0` (`backend/src/main.ts:35`). Reads `PORT` with default 3000 (`:37-53`). No port-fallback in production (`:64`). |
| A3 | Frontend production image | **NEEDS CONFIGURATION** | `frontend/Dockerfile` exists, but: (a) `next build` is not `output: 'standalone'` (`frontend/next.config.js:4-9`), so the runner copies the full prod `node_modules` (`Dockerfile:44-50`) and the image is large; (b) the build-arg default `NEXT_PUBLIC_API_URL=http://localhost:3000` (`:21-22`) silently ships a broken bundle if the arg is forgotten; (c) `CMD ["npm","run","start",…]` (`:56`) makes npm PID 1 with no tini or healthcheck in the image; (d) Alpine plus `next/image` on a non-`unoptimized` image (`frontend/src/features/auth/components/auth-shell.tsx:1,71`) relies on sharp/musl at runtime (NOT VERIFIED). Everything works today for local compose (`docker-compose.yml:50-64`). |
| A4 | Build-time env (`NEXT_PUBLIC_*`) | **NEEDS CONFIGURATION** | `NEXT_PUBLIC_API_URL` is inlined at build (`frontend/src/config/runtime-config.ts:3-6`, default `http://localhost:3000`). Also `NEXT_PUBLIC_LIVE_GAME_DEBUG` (`gameplay-runtime-panel.tsx:40`, `bomb-question-launch.tsx:145`) and `NEXT_PUBLIC_RYO_AUDIO_READY_TIMEOUT_MS` (`ryo-gameplay-panel.tsx:163`). Changing the API hostname means rebuilding the frontend image. Build one image per environment. |
| A5 | API base and Socket.IO URL resolution | **READY** | Everything is derived from `NEXT_PUBLIC_API_URL`: REST (`frontend/src/lib/api/client.ts`), media (`frontend/src/lib/api/media-url.ts:3-13`, which resolves `/uploads/...` against the backend origin), and the socket `io(\`${apiBaseUrl}/live-game-sessions\`, {transports:["websocket"]})` (`live-session-socket.ts:148-151`). Because the transport is websocket-only, the proxy **must** pass `Upgrade`. Caddy does this by default. |
| A6 | CORS | **NEEDS CONFIGURATION** | There is one allowlist for HTTP and WS (`backend/src/common/config/cors-origins.ts:19-35`, `main.ts:127-130`, gateway `live-game-sessions.gateway.ts:142-148`). In production an unset `CORS_ORIGINS` means an empty allowlist and every browser call is refused (`cors-origins.ts:27-31`). On the VPS, set it to the exact frontend origin(s). |
| A7 | Auth tokens / cookies | **READY** | The app sets no cookies. The JWT lives in `localStorage` (`frontend/src/features/auth/storage/auth-storage.ts:13`) and is sent as a `Bearer` header (`frontend/src/lib/api/client.ts:28-29`). Participant credentials are also Bearer (`live-session-api.ts:96,117`). The socket authenticates through `auth: {token}` (`live-session-socket.ts:149`). There are no cookie domain, `Secure` or `SameSite` assumptions, so separate API and frontend hostnames work. `JWT_SECRET` is required at boot (`backend/src/modules/auth/auth.module.ts:21-25`, `strategies/jwt.strategy.ts:14-17`). |
| A8 | OTP / email / SMS | **NEEDS CONFIGURATION** | Email OTP goes through the Resend HTTP API (`resend-email-otp.provider.ts:14` `https://api.resend.com/emails`). It needs `RESEND_API_KEY` (`:113`) and `OTP_MAIL_FROM` on a verified domain (`:119`, example `backend/.env.example:38`). The pepper falls back to `JWT_SECRET` (`otp-code.ts:52-56`). **No SMS provider exists.** `SMS_OTP_ENABLED` is only a flag (`otp-config.ts:46-48`, `render.yaml:108-111`). Outbound HTTPS to api.resend.com must be allowed. |
| A9 | Session ownership and reconnect | **READY** (prod multi-device **NOT VERIFIED**) | Server-authoritative snapshot recovery. The client reconnects and resyncs (`live-session-socket.ts:140-175`). Server-initiated recovery is `PRESENCE_RECOVERY_FALLBACK_MS` (`live-game-sessions.gateway.ts:133`). The roadmap records production multi-device gameplay as unverified (`GAME_NEW_SYSTEM_ROADMAP.md:156`). |
| A10 | Gameplay deadline scheduler | **READY (single instance)** | Timers live in process memory (`gameplay-deadline.scheduler.ts:352-371,582`). They are re-armed from Mongo at boot (`:609-641`), so a restart or redeploy is recoverable. Presentation timeouts can be tuned with `PRESENTATION_ACTIVATION_TIMEOUT_SECONDS` (default 12) and `PRESENTATION_INITIAL_TIMEOUT_SECONDS` (default 45) (`:92-110`). Two instances would both arm the same timers. Commands are transactional, but this has not been designed for. |
| A11 | Presence instance ownership / leases | **READY (single instance)** | Each process takes a Mongo-backed lease (`presence-ownership.service.ts:240-330`; tick 5 s, stale 15 s, `:180-182`). This is multi-process-aware for crash takeover, **but** Socket.IO rooms are per-process with no Redis adapter (no `createAdapter`/redis anywhere in `backend/src`; confirmed by `docs/BETA-DEPLOYMENT.md:171-173` "Do not raise the instance count"). The match convergence and OTP limiters are documented as single-instance (`match-reconciliation.service.ts:57-59`, `otp-rate-limiter.ts:9-15`). **Run exactly one backend container.** |
| A12 | Horizontal scale (2+ backend replicas) | **NEEDS IMPLEMENTATION** (not launch-blocking) | Would need a Socket.IO Redis adapter, a shared rate-limit store, single-owner deadline scheduling, and sticky sessions. Out of scope for a single VPS. |
| A13 | Graceful shutdown | **NEEDS CONFIGURATION** | tini is PID 1 (`backend/Dockerfile:61-66`). In production a SIGTERM handler releases presence within 5 s, drains stdout for 1 s, then exits (`presence-ownership.service.ts:58-61,140-147,177,187-189,957-1006`). `app.enableShutdownHooks()` is **not** called (no match in `backend/src`), so other `onModuleDestroy` hooks do not run on SIGTERM. That is acceptable because the scheduler re-arms at boot. Docker's default 10 s stop timeout is tight, so set `stop_grace_period: 30s`. The frontend has npm as PID 1 (A3). |
| A14 | Health check and commit SHA | **NEEDS IMPLEMENTATION** (workaround: config) | `/health` pings Mongo and returns `commit` from **`RENDER_GIT_COMMIT` only** (`backend/src/health.controller.ts:16-21,35-46`). Presence identity also uses `RENDER_GIT_COMMIT` (`presence-instance.ts:19`). The operator-armed legacy purge requires a matching commit (`presence-ownership.service.ts:387-396`). On a VPS `commit` will be `null` unless something injects it. Workaround with no code change: set `RENDER_GIT_COMMIT=<sha>` in the container env. Proper fix: read a neutral `APP_COMMIT_SHA` (or `GIT_COMMIT`), fall back to `RENDER_GIT_COMMIT`, and bake it in as a Docker build-arg/label. |
| A15 | Trust proxy / client IP | **NEEDS IMPLEMENTATION — P0** | Express `trust proxy` is **never set** (no match in `backend/src`). The public join/reconnect limiter keys on `request.ip` (`live-game-session-join.controller.ts:45,55,82`). Behind Caddy or nginx, `request.ip` is the proxy container's address, so **every player shares one bucket**: `reconnect:<proxyIp>` allows 10 per 60 s **for the whole site** (`public-join-rate-limiter.ts:8`, `controller.ts:82`), and `join:<proxyIp>:<code>` allows 10 per minute per room. A room with more than 10 joins/reconnects in a minute (normal after a Wi-Fi blip) would get `JOIN_RATE_EXCEEDED`. OTP uses the left-most `X-Forwarded-For` (`otp.controller.ts:69-73`). Caddy replaces client-supplied XFF by default, so that path is correct behind Caddy but spoofable behind a naive nginx `$proxy_add_x_forwarded_for`. Fix: `app.set('trust proxy', <hops or 'loopback, uniquelocal'>)` behind an env var, and unify on `request.ip`. *Whether Render today has the same collapse is NOT VERIFIED.* |
| A16 | Rate limiting (general) | **NEEDS CONFIGURATION** | Only OTP limits (`otp-config.ts:28-44`) and join limits exist, both in memory. There is no global throttler or `helmet`. For a public VPS, add edge limits at the proxy (Caddy `rate_limit` is a plugin, so it needs a custom build; nginx `limit_req` is built in) or accept the risk. |
| A17 | Request body limits | **READY** (proxy must not be stricter) | Nest/Express default JSON limit is 100 kB (no override in `main.ts`). Multer uses in-memory storage (no `storage:` option): 5 MB images (`questions.controller.ts:80,96`, `catalogs.controller.ts:54-55`, `categories.controller.ts:56-57`, `world-content.http.ts:4,15`) and **50 MB audio** (`music.controller.ts:50-52`). Caddy has no default body cap. With nginx, set `client_max_body_size 55m` on the API host (the default 1 m breaks uploads). |
| A18 | Upload temp storage | **NEEDS CONFIGURATION** | Uploads are buffered in RAM (multer memory), then written to `UPLOADS_DIR` (`main.ts:99-102`, `local-image-storage.service.ts:298-303`) as the ffmpeg working copy, then mirrored to R2 (`media-object-storage.ts:11-23`). On a VPS, mount a named volume at `/app/uploads`. It is not strictly required when R2 is on, but it avoids needless redirects and keeps ffmpeg scratch off the overlay FS. |
| A19 | Swagger / debug surfaces | **READY** | Off in production unless `SWAGGER_ENABLED=true` (`main.ts:137-144`). The SMS capture provider refuses to construct in production (`sms-otp.provider.ts:73-80`). `/dev/explainer/*` pages are gated on `NODE_ENV` (`frontend/src/app/dev/explainer/*/page.tsx:14-15`). |

### 1.2 Infrastructure

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| I1 | Dockerfiles | **READY** (backend) / **NEEDS CONFIGURATION** (frontend, see A3) | `backend/Dockerfile`, `frontend/Dockerfile`. `.dockerignore` excludes env files, `ai/workbench`, `ai/scripts` and `deployment/backups` (`.dockerignore:30-50`). |
| I2 | Compose files | **NEEDS IMPLEMENTATION** | `docker-compose.yml` is **local-only**: localhost URLs (`:13,18,55,59`), Swagger on (`:21`), YouTube downloads on (`:30`), host ports 3002/3001/27018 published (`:41-42,60-61,69-70`), external `lammah-game_*` volumes (`:93-98`). `docker-compose.tunnel.yml` is a Cloudflare quick-tunnel overlay for temporary testing. `docker-compose.test.yml` is the integration/e2e harness. `deployment/docker-compose.oracle.yml` is the closest to production but stale (§0). **There is no current production compose.** |
| I3 | Reverse proxy + TLS | **READY** (Caddy) / **NEEDS CONFIGURATION** | `deployment/Caddyfile:1-27`: ACME email, two vhosts (`{$FRONTEND_HOST}` to `frontend:3001`, `{$API_HOST}` to `backend:3000`), HSTS, nosniff, Referrer-Policy. Caddy upgrades WebSockets automatically and has no read timeout on upgraded connections. Not covered: no `stop_grace`/`flush_interval`, no access log, no media vhost, no `trusted_proxies` if Cloudflare is ever put in front. With nginx instead you would need `proxy_http_version 1.1`, `Upgrade`/`Connection` headers, `proxy_read_timeout ≥ 60s` (the Socket.IO ping is about 25 s), and `client_max_body_size`. HTTPS is mandatory because the microphone (`getUserMedia`) needs a secure origin (`deployment/README.md:21-22`, `docs/BETA-DEPLOYMENT.md:362-365`). |
| I4 | Sticky sessions | **READY** (n/a) | There is one backend and websocket-only transport, so there is no long-polling affinity to manage. Sticky sessions only matter if A12 is ever done. |
| I5 | Secrets / env handling | **NEEDS CONFIGURATION** | Today secrets live only in the Render/Vercel dashboards (`render.yaml:12-13`, `sync: false`). On a VPS, keep them in a root-owned `deployment/.env` (mode 600, git-ignored via `**/.env`) passed with `--env-file`/`env_file`. There is no secret manager. Rotate every secret during the move: JWT, OTP pepper, R2 keys, Resend, Atlas user. |
| I6 | Persistent volumes | **NEEDS CONFIGURATION** | Needed: `caddy_data` (certs, **required**), `backend_uploads` (recommended), `backend_cache` (wigolo cache, optional), `mongodb_data` (only if self-hosting). Oracle compose already declares these (`docker-compose.oracle.yml:119-133`) with `lammah_` legacy names. A fresh VPS does not need the legacy names. |
| I7 | Logging | **NEEDS CONFIGURATION** | Nest `Logger` writes text to stdout/stderr. Some presence events are object-shaped (`presence-ownership.service.ts:320`). There is no pino/winston and no JSON formatter. Docker's default `json-file` driver has **no rotation**, so a VPS disk will fill. Set `logging: {driver: json-file, options: {max-size: "20m", max-file: "5"}}` per service, or set it in `daemon.json`. There is no log shipping today. |
| I8 | Monitoring / alerting | **NEEDS IMPLEMENTATION / DECISION** | There is nothing in the repo. At minimum: an external uptime check on `https://API_HOST/health` and the frontend, plus disk/CPU/RAM alerts. Error tracking (Sentry etc.) is not integrated (no match in either `package.json`). The `deployment/README.md:82-83` note already calls for this. |
| I9 | Firewall / ports | **NEEDS CONFIGURATION** | Documented in `deployment/README.md:11-18`: open 22 (your IP only), 80, 443 tcp and 443 udp. Never open 3000, 3001 or 27017. Oracle compose publishes only Caddy's ports (`:101-104`). Use the provider firewall (EC2 security group or Hostinger firewall) **and** the host firewall (ufw). Note that Docker-published ports bypass ufw, so publish nothing except Caddy. |
| I10 | Rollback | **NEEDS IMPLEMENTATION** | Today rollback is through the Render/Vercel UI (`GAME_NEW_SYSTEM_ROADMAP.md:81,108`). On a VPS that builds in place (`deploy.sh:15`) there is no previous image to return to. You need SHA-tagged images (registry or `docker save`) and a `.env` `IMAGE_TAG`. Procedure in §5. |
| I11 | Deployment automation / CI | **NEEDS IMPLEMENTATION** | There is **no `.github/` directory** (no workflows in `git ls-files`). Today: Render auto-deploy plus the Vercel Git integration. Drift: `render.yaml:24` says `autoDeploy: true`, but the roadmap says "Render Auto-Deploy is Off" (`GAME_NEW_SYSTEM_ROADMAP.md:120-121`), so the dashboard overrides the blueprint. For a VPS, either build and push images from CI to a registry (GHCR) and SSH `compose pull && up -d`, or run a scripted build on the VPS (needs ≥ 4 GB RAM plus swap). |
| I12 | Backups | **NEEDS DECISION + IMPLEMENTATION** | Scripts only target the compose `mongodb` container with a hardcoded DB (`export-local-data.sh:12-16`, `restore-data.sh:22-27`). They do not schedule, encrypt, ship off-host or prune. Atlas backup capability depends on tier (NOT VERIFIED which tier production is on; `docs/BETA-DEPLOYMENT.md:50-56` says M0, and M0 has no managed backups). R2 media has no versioning or replication configured in the repo. |

### 1.3 Database

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| D1 | Replica set (transactions) | **READY** (Atlas) / **NEEDS CONFIGURATION** (self-host) | Transactions are verified in production code paths: gameplay unit-of-work `mongoose-gameplay-transaction.unit-of-work.ts:48-54`, `world-slot-mechanic-removal.service.ts:139-143`, `content-engine-review.service.ts:1152-1154,1576-1578`. **A standalone mongod will fail live gameplay.** Atlas is a replica set. Self-hosting needs `--replSet rs0` plus `rs.initiate` (already done in compose files: `docker-compose.oracle.yml:6,13`). |
| D2 | Connection string | **NEEDS CONFIGURATION** | Only `MONGODB_URI` is read (`database.module.ts:11`), with no options in code. The DB name comes from the URI path (`render.yaml:37`; `docs/BETA-DEPLOYMENT.md:69-76`, where a missing path connects to `test`). On a VPS, restrict Atlas Network Access to the **VPS static IP** instead of today's `0.0.0.0/0` (`docs/BETA-DEPLOYMENT.md:60-62`). |
| D3 | Pool size / timeouts | **READY** (defaults) / **NOT VERIFIED** under load | No `maxPoolSize`/`serverSelectionTimeoutMS` set anywhere, so driver defaults apply (pool 100). Atlas M0/Flex caps connections at about 500, so this is fine for one instance. |
| D4 | Index creation / migrations | **READY** with caveat | Mongoose `autoIndex` is not disabled, so schema indexes build at every boot. Explicit one-off migrations are compiled into `dist` (`backend/package.json` `*:dist` scripts; e.g. `src/scripts/migrate-gameplay-runtime-indexes.ts`) and run with `docker compose exec backend node backend/dist/scripts/<x>.js`. There is no migration ledger. |
| D5 | Backup / restore tooling | **NEEDS IMPLEMENTATION** | See I12. `deployment/scripts/copy-local-db-to-atlas.sh` is a guarded one-way migration tool (source fingerprint at `:35-40`), not a backup. |
| D6 | Managed (Atlas) vs self-hosted | **NEEDS DECISION** | Trade-offs in §2. |
| D7 | Portability | **READY** | Plain MongoDB 7 features (transactions, partial indexes). No Atlas-only features (Search, Triggers) found. `mongodump`/`mongorestore` move it anywhere. |

### 1.4 Media

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| M1 | R2 config | **NEEDS CONFIGURATION** | It is all-or-nothing: if any of `R2_ACCOUNT_ID` (or `R2_ENDPOINT`), `R2_BUCKET`, `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` is missing, mirroring is disabled and an error is logged (`media-object-storage.ts:115-158`). It is S3-compatible (`@aws-sdk/client-s3`, `region:'auto'`, `:55-64`), so it is provider-neutral and works from any VPS. |
| M2 | `/uploads` URL resolution | **READY** | The DB stores `/uploads/<key>`. The frontend resolves this against the **API origin** (`media-url.ts:9-10`). The backend serves the local disk first (`main.ts:102`), then `302`s to `MEDIA_PUBLIC_BASE_URL/<key>` (`main.ts:108-125`, `normalizeKey` `media-object-storage.ts:101-103`). There are no Next rewrites. Verified live: `302 → r2.dev`. |
| M3 | Public media origin | **NEEDS CONFIGURATION — P1** | Production `MEDIA_PUBLIC_BASE_URL` is a `pub-….r2.dev` URL (live HEAD above). Cloudflare positions `r2.dev` for development (rate-limited, no cache controls). Attach a custom domain (e.g. `media.<domain>`) to the bucket and update `MEDIA_PUBLIC_BASE_URL`. No DB rewrite is needed because the URLs stay `/uploads/...`. |
| M4 | Cache headers | **NEEDS IMPLEMENTATION — P2** | R2 `PutObjectCommand` sets only `ContentType` (`media-object-storage.ts:73`), so objects have no `Cache-Control` (verified live). The `302` is uncached, so every media load costs an API round-trip on the VPS. `express.static` uses default `max-age=0`. Fix: set `CacheControl` on put (keys are content-addressed for images, see `local-image-storage.content-addressed.spec.ts`), and/or add `Cache-Control` to the redirect, or have Caddy serve `/uploads` from the volume. |
| M5 | Local-disk dependency | **NEEDS CONFIGURATION** | With R2 on, the local disk is a working copy only. ffmpeg needs real paths, so `UPLOADS_DIR` must be writable (`render.yaml:56-59`). A fresh VPS volume starts empty, and everything is served through the R2 redirect, as on Render. Without R2, the volume becomes the **only** copy and must be backed up. |
| M6 | Public vs protected assets | **READY** | Everything is intentionally public-read (`docs/BETA-DEPLOYMENT.md:93-95`). There are no signed URLs. |
| M7 | yt-dlp / YouTube ingest | **NEEDS DECISION** | Off in production (`render.yaml:79-80`, `youtube-asset.provider.ts:114-118`). On a datacenter IP (VPS), YouTube often blocks downloads. Keep it off. |

### 1.5 Integrations and platform coupling

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| X1 | Platform-specific env | **NEEDS IMPLEMENTATION** (small) | `RENDER_GIT_COMMIT` is the **only** platform env read in code (`health.controller.ts:19`, `presence-instance.ts:19`). No `VERCEL_*` is read in code. |
| X2 | Hardcoded hosts | **READY** | No `onrender.com`/`vercel.app` strings in runtime code. They appear only in comments, specs and docs (`cors-origins.spec.ts`, `docs/BETA-DEPLOYMENT.md`). `support@playakwaan.com` is hardcoded in `frontend/src/components/layout/footer.tsx:25` (domain-level, fine). |
| X3 | External APIs | **NEEDS CONFIGURATION** | Resend (login). Optional or admin-only: Gemini, OpenRouter (Content Engine), LM Studio (local only), Jikan, Wikipedia/Wikidata, OpenTDB, wigolo (local CLI). The VPS needs outbound HTTPS to them. Inventory in §3. |
| X4 | Dashboard-only production env | **NOT VERIFIED** | Render may hold vars not in `render.yaml`, e.g. `CONTENT_ENGINE_ENABLED`, `ENGINE_*`, `OPENROUTER_API_KEY` (the roadmap mentions Content Engine runs in production). `ANSWER_MATCHING_TOLERANT_MECHANICS` must stay unset (`GAME_NEW_SYSTEM_ROADMAP.md:77`). **Export the full Render env list before cutover.** |
| X5 | Region / latency | **NEEDS DECISION** | Atlas and Render are both in Frankfurt (`render.yaml:22`, `docs/BETA-DEPLOYMENT.md:50-56`). If Atlas stays, put the VPS near the Atlas region, or move the cluster. Every gameplay command is a transaction (several RTTs). |
| X6 | Frontend off Vercel | **NEEDS DECISION** | The frontend can stay on Vercel while only the API moves (lower risk), or move to the VPS. Nothing in the frontend depends on Vercel (no `@vercel/*`, no `vercel.json`, no edge middleware). |

**Headline counts (51 rows):** READY 19 · NEEDS CONFIGURATION 16 · NEEDS IMPLEMENTATION 10 · NEEDS DECISION 5 · NOT VERIFIED 1.
(A row with a split status is counted once, by its headline. A10 and A11 count as READY for a single instance; I1 counts as READY; I8 as NEEDS IMPLEMENTATION; I12 as NEEDS DECISION; D1 as READY. NOT VERIFIED caveats inside A9, D3 and A3 are listed in §6 and are not counted separately.)

---

## 2. Minimum infrastructure recommendation

### 2.1 Topology (one VPS, Docker Compose)

```
Internet ──443/80──▶ Caddy (TLS via ACME, HTTP/3)
                      ├── play.<domain>  → frontend:3001  (Next.js `next start`)
                      └── api.<domain>   → backend:3000   (NestJS + Socket.IO, exactly 1 replica)
                                             ├──▶ MongoDB  (Atlas, or a self-hosted 1-node RS, NEEDS DECISION)
                                             └──▶ Cloudflare R2 (media; public via media.<domain>)
```

- One private bridge network. **Only Caddy publishes ports.**
- `backend` has `deploy.replicas: 1` (or simply no scaling), `stop_grace_period: 30s`, `restart: unless-stopped`, and a healthcheck on `/health` (reuse `docker-compose.oracle.yml:51-62`).
- `frontend` depends on a healthy `backend`. Caddy depends on a healthy `frontend`.
- Optionally keep the frontend on Vercel and move only the API first (X6). That halves the cutover risk.

### 2.2 MongoDB: managed vs self-hosted (**NEEDS DECISION**)

| | Keep Atlas (managed) | Self-host on the same VPS |
|---|---|---|
| Replica set / transactions | Built in | `mongod --replSet rs0` single-node RS (already scripted). Provides transactions but **no redundancy**. |
| Backups | Tier-dependent (M0: none; Flex and dedicated: snapshots / PITR) | Must be built: cron `mongodump --archive --gzip` to off-host storage (e.g. R2 or S3-compatible), retention, restore drills |
| Ops burden | Low | Upgrades, disk monitoring, WiredTiger cache sizing, security (auth must be enabled; the compose files currently run **without auth** on the private network) |
| Latency | Network RTT to the Atlas region (put the VPS in the same metro) | Sub-millisecond |
| Resource cost on the VPS | None | +1.5–3 GB RAM, plus disk IOPS |
| Blast radius | The VPS dying does not lose data | The VPS dying loses data since the last off-host dump |
| Rename to `Akwaan-prd` later | `mongodump`/`mongorestore --nsFrom/--nsTo` or Atlas tools | Same |

**Recommendation:** keep Atlas for launch, on a tier with automated backups. Lock Network Access to the VPS static IP. Self-hosting only pays off once latency or cost matters, and then it requires the backup automation in §6 first.

### 2.3 Sizing estimate

| Profile | vCPU | RAM | Disk | Notes |
|---|---|---|---|---|
| API + frontend + Caddy, Atlas managed, **images built elsewhere** | 2 | 4 GB (+2 GB swap) | 40–80 GB SSD | Node backend about 300–600 MB, Next about 200–400 MB, Caddy under 50 MB. ffmpeg spikes during admin media uploads. Multer buffers up to 50 MB per upload in RAM. |
| Same, **building images on the VPS** | 2–4 | 8 GB | 80 GB | `next build` plus `nest build` with workspace `npm ci` is memory-heavy (`deployment/README.md:9-10`). |
| Self-hosted MongoDB too | 4 | 8 GB | 100 GB+ | Set a WiredTiger cache cap (e.g. `--wiredTigerCacheSizeGB 1.5`). |

All figures are estimates. No load test has been run (**NOT VERIFIED**).

### 2.4 Single-instance appropriateness

A single backend instance is **the supported and required topology**:
- Socket.IO rooms are in-process with no adapter (A11).
- Deadline timers are in-process and re-armed at boot (A10).
- OTP and join limiters are in-memory (A15, A16; `otp-rate-limiter.ts:9-15`).
- Match convergence is "single-instance behaviour" (`match-reconciliation.service.ts:57-59`).
- Presence leases make a **restart** safe (crash takeover, SIGTERM release), not concurrency.

Consequence: every deploy is a brief outage. Running sockets disconnect, and clients reconnect and resync from Mongo (A9). Schedule deploys outside live sessions. Do **not** do blue/green with two backends attached to Socket.IO at once.

---

## 3. Environment variable inventory

Legend: **Req** = required for a production VPS launch with the current feature set · **Opt** = optional · **Off** = feature flag that should stay off/unset · **S** = secret. Backend vars are runtime (container env). Frontend `NEXT_PUBLIC_*` are **build-time** (inlined into the JS bundle and public).

### 3.1 Backend: core

| Var | Consumer | Req? | Default | Secret | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | `main.ts:64,139`, `cors-origins.ts:27`, `presence-ownership.service.ts:175-176`, `sms-otp.provider.ts:73` | Req | (Dockerfile sets `production`, `backend/Dockerfile:42`) | no | |
| `PORT` | `main.ts:38` | Opt | 3000 | no | |
| `MONGODB_URI` | `database/database.module.ts:11`; scripts `src/scripts/*.ts` (default `mongodb://localhost:27017/lammah-quiz`), `seed.ts:22,285` | **Req** | none in app | **S** | **The DB name lives in the URI path.** |
| `JWT_SECRET` | `auth.module.ts:21`, `jwt.strategy.ts:14`, `otp-code.ts:54` | **Req** (boot fails without it) | none | **S** | ≥ 32 random bytes |
| `JWT_EXPIRES_IN` | `auth.module.ts:31` | Opt | `7d` | no | |
| `CORS_ORIGINS` | `cors-origins.ts:22` | **Req** | empty in prod | no | comma list, exact origins |
| `APP_BASE_URL` | `ai-agent.service.ts:167`, `youtube-asset.provider.ts:102` | Opt (AI/YouTube only) | | no | the API's own public URL |
| `SWAGGER_ENABLED` | `main.ts:137` | Off | off in prod | no | |
| `UPLOADS_DIR` | `main.ts:100`, `local-image-storage.service.ts:300`, `local-audio-storage.service.ts:152`, `image-download.service.ts:103,193`, `youtube-asset.provider.ts:104` | Req (set `/app/uploads`) | `./uploads` | no | volume |
| `RENDER_GIT_COMMIT` | `health.controller.ts:19`, `presence-instance.ts:19` | Opt (set manually on a VPS until renamed) | unset → `commit:null` | no | platform-coupled |
| `ENGINE_AUTHORING_ROOT` | `authoring-context.service.ts:163`, `deterministic-screen.service.ts:808` | set by Dockerfile `/app` (`:53`) | | no | |
| `PRESENTATION_ACTIVATION_TIMEOUT_SECONDS` / `PRESENTATION_INITIAL_TIMEOUT_SECONDS` | `gameplay-deadline.scheduler.ts:92,109` | Opt | 12 / 45 | no | read at import |
| `MARHALA_QUESTION_SECONDS`, `COMBO_RUN_HANDOVER_SECONDS`, `RYO_REPLAY_COOLDOWN_SECONDS`, `MOVING_XO_MIN_USABLE_ITEMS` | `marhala-board.ts:43`, `combo-gameplay.plugin.ts:144`, `ryo-gameplay.plugin.ts:32`, `moving-xo-content.policy.ts:12` | Opt | code defaults (`MOVING_XO` = 24) | no | gameplay tuning |
| `ANSWER_MATCHING_TOLERANT_MECHANICS` | `common/utils/answer-matching-activation.ts:9` | **Off: must stay unset** | unset | no | roadmap `:77` |
| `PRESENCE_SIGTERM_RELEASE`, `PRESENCE_OWNERSHIP_TICK_MS`, `PRESENCE_LEASE_STALE_MS`, `PRESENCE_DEAD_CONFIRMATIONS`, `PRESENCE_LEGACY_PURGE`, `PRESENCE_RETRY_CAPACITY`, `PRESENCE_RETRY_BASE_MS`, `PRESENCE_RETRY_MAX_MS`, `PRESENCE_RECONCILE_QUARANTINE_MS`, `PRESENCE_RECONCILE_QUARANTINE_CAPACITY`, `PRESENCE_RECONCILE_TIME_BUDGET_MS` | `presence-ownership.service.ts:177-210` | Opt | true in prod / 5000 / 15000 / 2 / unset / 2000 / 1000 / 60000 / 30 min / 1000 / 2000 | no | leave defaults |

### 3.2 Backend: auth / OTP

| Var | Consumer | Req? | Default | Secret |
|---|---|---|---|---|
| `RESEND_API_KEY` | `resend-email-otp.provider.ts:113` | **Req** (email login) | | **S** |
| `OTP_MAIL_FROM` | `resend-email-otp.provider.ts:119` | **Req** | none (verified domain) | no |
| `OTP_HASH_PEPPER` | `otp-code.ts:52` | Recommended | falls back to `JWT_SECRET` | **S** |
| `OTP_EXPIRES_SECONDS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_VERIFY_PER_IDENTIFIER_MINUTE`, `OTP_MAX_VERIFY_PER_IP_MINUTE`, `OTP_MAX_REQUESTS_PER_IDENTIFIER_HOURLY`, `OTP_MAX_REQUESTS_PER_IP_HOURLY` | `otp-config.ts:13-43` | Opt | 300 / 60 / 10 / 20 / 10 / 30 | no |
| `SMS_OTP_ENABLED` | `otp-config.ts:47`, `sms-otp.provider.ts:40` | Off | false (no provider) | no |

### 3.3 Backend: media

| Var | Consumer | Req? | Default | Secret |
|---|---|---|---|---|
| `R2_ACCOUNT_ID` | `media-object-storage.ts:118` | **Req** | | low (identifier) |
| `R2_ENDPOINT` | `media-object-storage.ts:119` | Opt | derived from account id | no |
| `R2_BUCKET` | `media-object-storage.ts:120` | **Req** | | no |
| `R2_ACCESS_KEY_ID` | `media-object-storage.ts:121` | **Req** | | **S** |
| `R2_SECRET_ACCESS_KEY` | `media-object-storage.ts:122` | **Req** | | **S** |
| `MEDIA_PUBLIC_BASE_URL` | `media-object-storage.ts:123` | **Req** | none → no redirect, so 404s on an empty disk | no |
| `MUSIC_QUESTION_CATEGORY_SLUG` | `music.service.ts:188` | Opt | `songs` | no |
| `MUSIC_DELETE_ORIGINAL_AFTER_SNIPPET` | `music.service.ts:92` | Opt | false | no |
| `ALLOW_YOUTUBE_ASSET_DOWNLOADS` | `youtube-asset.provider.ts:114` | Off | false | no |
| `AUDIO_AUTO_SELECT_FIRST_CANDIDATE` | `question-audio-processing.service.ts:590` | Off | false | no |

### 3.4 Backend: AI / Content Engine / research (all optional; admin-only features)

| Var | Consumer | Default | Secret |
|---|---|---|---|
| `AI_QUESTION_GENERATION_ENABLED` | `ai-agent.controller.ts:80`, `ai-provider.factory.ts:51` | set `false` (when off, no provider key is needed) | no |
| `AI_PROVIDER` | `ai-provider.factory.ts:34`, `llm-client.service.ts:127,169` | `gemini` | no |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | `gemini-ai.provider.ts:25,29,220` | / `gemini-2.5-flash-lite` | **S** / no |
| `OPENROUTER_API_KEY` | `content-engine.module.ts:150`, `engine-job-admin.service.ts:404`, `openrouter-ai.provider.ts:295`, `llm-client.service.ts:189,331` | | **S** |
| `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL` | `openrouter-ai.provider.ts:287`, `llm-client.service.ts:192` | | no |
| `LM_STUDIO_BASE_URL`/`LMSTUDIO_BASE_URL`, `LM_STUDIO_MODEL`/`LMSTUDIO_MODEL`, `LM_STUDIO_API_KEY`/`LMSTUDIO_API_KEY` | `lm-studio-ai.provider.ts:17-38`, `llm-client.service.ts:155-193`, `music-metadata-agent.service.ts:71-85` | local dev only (do not set on a VPS) | (S) |
| `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_TOKENS`, `AI_GENERATION_CONCURRENCY`, `AI_GENERATION_BATCH_SIZE`, `AI_MAX_REPAIR_ATTEMPTS`, `AI_DUPLICATE_RETRY_ATTEMPTS`, `AI_ENABLE_REWRITE`, `AI_AUDIO_VOICE`, `AI_ALIAS_DIAGNOSTICS`, `AI_RESEARCH_*`/`AI_WRITER_*`/`AI_REVIEW*`/`AI_REPAIR_MODEL`, `AI_WIKIPEDIA_*`, `AI_WIKIDATA_*`, `AI_KNOWLEDGE_TTL_*` | `ai-generation-pipeline.service.ts:75,81,815,1092`, `llm-client.service.ts:132,198,581`, `ai-agent.service.ts:165,169`, `accepted-answer-expansion.service.ts:601`, `ai-pipeline-config.service.ts:12-73` | see `backend/.env.example:54-103` | no |
| `OPEN_TRIVIA_DB_BASE_URL`, `QUESTION_SOURCE_TIMEOUT_MS` | `open-trivia-db-question-source.adapter.ts:45,49` | `https://opentdb.com` / 15000 | no |
| `JIKAN_PROVIDER_ENABLED`, `JIKAN_API_BASE_URL`, `JIKAN_REQUEST_TIMEOUT_MS`, `JIKAN_CACHE_TTL_MS`, `JIKAN_NEGATIVE_CACHE_TTL_MS`, `JIKAN_MIN_REQUEST_INTERVAL_MS` | `jikan-anime-image.provider.ts:58-73` | true / `https://api.jikan.moe/v4` / … | no |
| `CONTENT_ENGINE_ENABLED`, `ENGINE_LIVE_PROVIDER_ENABLED`, `ENGINE_EVIDENCE_RETRIEVAL_ENABLED`, `ENGINE_IMAGE_GENERATION_ENABLED`, `ENGINE_MEDIA_ENRICHMENT_ENABLED`, `ENGINE_MEDIA_DISCOVERY_WIGOLO_ENABLED` | `content-engine.constants.ts:32,44,46,57`, `content-engine.module.ts:39-42,146-165`, `engine-media-flags.ts:4-5` | off | no |
| `ENGINE_PROVIDER_NAME`, `ENGINE_GENERATION_MODEL`, `ENGINE_QUALITY_MODEL`, `ENGINE_MODEL_PRICING`, `ENGINE_MONTHLY_CAP_SAR`, `ENGINE_BATCH_CAP_SAR`, `ENGINE_BATCH_SIZE`, `ENGINE_GENERATION_TEMPERATURE`, `ENGINE_OMIT_TEMPERATURE`, `ENGINE_OUTPUT_TOKENS_PER_CANDIDATE`, `ENGINE_REASONING_EFFORT`, `ENGINE_REQUEST_TIMEOUT_MS`, `ENGINE_STRICT_SCHEMA_ADAPT`, `ENGINE_EVIDENCE_TIMEOUT_MS`, `ENGINE_EVIDENCE_CACHE_TTL_SECONDS`, `ENGINE_VERIFICATION_MAX_*` | `content-engine/**` (e.g. `generation-specification.ts:144-432`, `engine-budget.service.ts:143,154`, `engine-pricing.service.ts:40`, `openrouter-ai.provider.ts:265-393`, `fact-verification.service.ts:163-167`, `wigolo-fact-evidence.retriever.ts:67,100`) | code defaults | no |
| `WIGOLO_ENABLED`, `WIGOLO_EXECUTABLE_PATH`, `WIGOLO_COMMAND`, `WIGOLO_COMMAND_ARGS`, `WIGOLO_CACHE_FILE`, `WIGOLO_*_TIMEOUT_MS`, `WIGOLO_MAX_CONCURRENCY`, `WIGOLO_MAX_SOURCES`, `WIGOLO_*CACHE_TTL_SECONDS`, `WIGOLO_STDOUT_MAX_BUFFER_BYTES` | `wigolo-client.ts:427-664`, `wigolo-cache.repository.ts:25`, `entity-verification.service.ts:188-198` | `/app/node_modules/.bin/wigolo`, `/app/.cache/entity-verification.json` (`render.yaml:84-87`) | no |

Test-only: `TEST_MONGODB_URI`, `EXTERNAL_INTEGRATIONS_DISABLED` (`docker-compose.test.yml:25-28`). Script-only: `PROBE_*` (`src/scripts/bomb-media-probe*.ts`).

### 3.5 Frontend

| Var | Consumer | Build/Run | Req? | Default | Secret |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `frontend/src/config/runtime-config.ts:5`; `frontend/Dockerfile:21-22` | **build-time** | **Req** | `http://localhost:3000` (dangerous default) | no (public) |
| `NEXT_PUBLIC_LIVE_GAME_DEBUG` | `gameplay-runtime-panel.tsx:40`, `bomb-question-launch.tsx:145` | build-time | Off (`false`) | unset | no |
| `NEXT_PUBLIC_RYO_AUDIO_READY_TIMEOUT_MS` | `ryo-gameplay-panel.tsx:163` | build-time | Opt | code default | no |
| `PORT` | `frontend/Dockerfile:42` (`next start`) | runtime | Opt | 3001 | no |
| `NODE_ENV` | `src/app/dev/explainer/*/page.tsx` | build+run | Req `production` | | no |

### 3.6 Deployment-layer (compose `.env`, not read by the app)

`FRONTEND_HOST`, `API_HOST`, `ACME_EMAIL` (`docker-compose.oracle.yml:29-30,71,98-100`, `Caddyfile:2,5,17`). Proposed: `IMAGE_TAG`/`APP_COMMIT_SHA`, `MEDIA_HOST`.

### 3.7 Database-name touchpoints (`lammah-quiz`, future `Akwaan-prd`; listed for later, **not planned here**)

**The running app reads only `MONGODB_URI`**, so the production DB name is set solely in the URI path held as a secret (today the Render dashboard; on a VPS, `deployment/.env`). Everything else that hardcodes the name:

- **Runtime config / deploy:** `render.yaml:37` (comment); `docker-compose.yml:24` (`BACKEND_MONGODB_URI` default); `deployment/docker-compose.oracle.yml:28` (hardcoded); `backend/.env.example:5`.
- **Ops scripts:** `deployment/scripts/export-local-data.sh:13`, `restore-data.sh:24`, `verify-deployment.sh:14`, `copy-local-db-to-atlas.sh:37` (`DB_NAME` default, and the URI must name `lammah-quiz`), `diagnose-stale-runtimes.sh:16` (`DB_NAME` default).
- **Backend scripts (fallback default when `MONGODB_URI` is unset):** `backend/src/seed.ts:22`, `src/scripts/migrate-canonical-mechanic-slugs.ts:12`, `migrate-gameplay-runtime-indexes.ts:8`, `migrate-generic-world-board-slots.ts:89`, `migrate-remove-legacy-tutorial-text.ts:7`, `migrate-top10-to-top5.ts:66`, `migrate-world-content.ts:38`, `provision-production-mechanics.ts:19`, `rollout-combo-dev-fixtures.ts:38`.
- **Local e2e (local compose DB, not production):** `frontend/e2e/board-preflight-visual.spec.ts:109`, `closest-acceptance.spec.ts:628`, `closest-pilot-01-smoke.spec.ts:299`, `closest-slider-content-smoke.spec.ts:270`, `la-tahriqha-review.spec.ts:351`, `typography-gravity-visual.spec.ts:128`.
- **Docs:** `docs/BETA-DEPLOYMENT.md`, `README.md`, `backend/README.md`, `backend/SETUP_SUMMARY.md`, `backend/AI_AGENT_GUIDE.md`, `GAME_NEW_SYSTEM_ROADMAP.md`, `docs/WORLD_CONTENT_EXPANSION_PLAN.md`; also `.claude/settings.json:6,17`, `ai/scripts/push_combo_anime_production_2026_08_20.py:33` (comment).
- Separate legacy identifiers that are **not** the DB name: Docker volume names `lammah-game_*` (`docker-compose.yml:93-98`) and `lammah_*` (`docker-compose.oracle.yml:124-133`).

---

## 4. Gaps to implement before a VPS launch

| Pri | Gap | Fix |
|---|---|---|
| **P0** | **No `trust proxy`.** Behind a reverse proxy, all clients share the join/reconnect rate-limit bucket (A15). | ✅ *(cleanup branch)* `TRUST_PROXY` env (`backend/src/common/http/trust-proxy.ts`, wired in `main.ts`; unset keeps today's behaviour). **Set `TRUST_PROXY=1` behind exactly one proxy.** Render very likely has the same collapse today (Render terminates TLS and the OTP code already works around it): setting `TRUST_PROXY=1` on Render is a Production env change that needs separate approval. |
| **P0** | **No current production compose** (I2, §0). | New `deployment/compose.prod.yml`: Caddy, backend (1 replica, healthcheck, `stop_grace_period: 30s`, log rotation, image tag), frontend; Mongo service behind a profile only if self-hosting; env from `deployment/.env`. Retire or relabel `docker-compose.oracle.yml`. |
| **P0** | **Backups** (I12, D5). | Atlas tier with snapshots, **or** a cron `mongodump` to off-host encrypted storage with retention and a tested restore. Decide R2 object versioning/backup. |
| **P1** | **Commit SHA is Render-only** (A14, X1). | ✅ *(cleanup branch)* `/health` and the presence identity read `APP_COMMIT_SHA`, falling back to `RENDER_GIT_COMMIT`. Still to do: pass it as a Docker `ARG`/`ENV` plus an OCI label at build time. |
| **P1** | **Rollback / deployment automation** (I10, I11). | Build SHA-tagged images off-box (CI → GHCR or `docker save`), `IMAGE_TAG` in `.env`, scripted `pull && up -d` and health/commit verification. There is no `.github/` today. |
| **P1** | **Log rotation** (I7). | Compose `logging` options or `/etc/docker/daemon.json`. |
| **P1** | **Monitoring** (I8). | External uptime on `/health` (assert `commit`), plus host metrics alerts. Optional error tracking. |
| **P1** | **`r2.dev` in production** (M3). | Custom domain on the bucket. Update `MEDIA_PUBLIC_BASE_URL`. |
| **P1** | **Frontend image hardening** (A3). | `output: 'standalone'`, tini or `node server.js` as CMD, healthcheck, **no default** for `NEXT_PUBLIC_API_URL` (fail the build if missing). |
| P2 | Media cache headers (M4). | `CacheControl` on R2 put. Cacheable redirect, or Caddy `file_server` for `/uploads`. |
| P2 | Edge rate limiting / security headers on the API (A16). | nginx `limit_req` or a Caddy build with the rate-limit module. Add CSP later. |
| P2 | Mongo auth if self-hosted (§2.2). | `--auth` plus an app user. The compose files currently run auth-less. |
| P2 | `enableShutdownHooks()` (A13). | Optional: lets other `onModuleDestroy` hooks run. Coordinate with the presence SIGTERM handler. |
| P3 | Horizontal scaling (A12). | Redis adapter plus a shared limiter and a single-owner scheduler. Not needed for one VPS. |

---

## 4.1 `TRUST_PROXY` — exact safe configuration

Verified by `backend/src/common/http/trust-proxy.behaviour.spec.ts` through a real HTTP proxy hop that appends
the connecting address to `X-Forwarded-For` (nginx `$proxy_add_x_forwarded_for` semantics).

| Topology | Setting | Why |
|---|---|---|
| One VPS: Caddy/nginx → backend, backend port **not published** (Docker internal network or bound to 127.0.0.1) | `TRUST_PROXY=1` | Exactly one trusted hop: Express takes the address the proxy appended (right-most), so a client-forged left-most entry is ignored. |
| Same, but you prefer an address rule | `TRUST_PROXY=loopback` (proxy on the host) or the Docker network subnet, e.g. `172.18.0.0/16` | Trusts only the proxy's own addresses; equivalent safety. |
| CDN (e.g. Cloudflare) **in front of** the proxy | `TRUST_PROXY=2` only if every request is guaranteed to pass through both, otherwise trust the CDN's published ranges | Each trusted hop must be one you control or pin. |
| Render (today) | Not set. Render's edge adds `X-Forwarded-For`, but its hop count must be verified with a header-echo deploy before setting `1`. Production env change → separate approval. | |
| No proxy (local dev) | unset | Socket address used; forged headers ignored. |

**Never `TRUST_PROXY=true`**: it trusts every hop, so the client-forged left-most entry wins (tested). **Never publish
the backend port** when `TRUST_PROXY` is set: a client connecting directly is treated as the proxy and can forge its
address (tested). Proxy settings: nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` plus the
WebSocket `Upgrade`/`Connection` headers; Caddy `reverse_proxy` sets `X-Forwarded-For` itself (do not configure
`trusted_proxies` on Caddy unless a CDN sits in front). With `TRUST_PROXY` set, OTP per-IP limiting also uses the
trusted address instead of the raw header (cleanup branch).

## 5. Provider-neutral deployment checklist

**Phase A: decisions (before touching infra)**
1. Decide: Atlas (which tier, with backups) vs a self-hosted RS (§2.2).
2. Decide: frontend stays on Vercel or moves to the VPS (X6).
3. Decide: VPS region, near the Atlas region (currently Frankfurt) (X5).
4. Choose hostnames: `play.<domain>`, `api.<domain>`, `media.<domain>` (R2 custom domain).
5. Export the **full** current Render env (dashboard) and Vercel env, and diff against §3 (X4).

**Phase B: code prerequisites (PRs; separate from this audit)**
6. Land the P0/P1 code items: trust proxy, commit SHA env, frontend Dockerfile hardening, `compose.prod.yml`, backup script, optional CI image build.

**Phase C: provision**
7. Create the VPS (Ubuntu 24.04 LTS; per §2.3). Attach a **static/elastic IP**.
8. Provider firewall: 22/tcp from the admin IP only, 80/tcp, 443/tcp, 443/udp. Mirror it in ufw. Key-only SSH, no root login, unattended security upgrades, swap file.
9. Install Docker Engine plus the Compose plugin. Configure `/etc/docker/daemon.json` log rotation.
10. Create a non-root deploy user in the `docker` group. Clone the repo, or only `deployment/` if pulling images.

**Phase D: external services**
11. Atlas: add the VPS IP to Network Access and remove `0.0.0.0/0` after cutover. Create a **new** DB user for the VPS (rotate credentials).
12. R2: attach the custom domain. Create a new scoped API token for the VPS.
13. Resend: confirm the sending domain is still verified. Create a new API key.
14. DNS: lower the TTL to 60–300 s a day ahead. Create the `api`/`play` A/AAAA records pointing at the VPS. **Do not switch the live hostnames yet** if you are reusing them; use temporary names for staging first.

**Phase E: configure and launch**
15. `deployment/.env` (chmod 600) holds every **Req** var from §3, plus `NODE_ENV=production`, `CORS_ORIGINS=https://play.<domain>`, `APP_BASE_URL=https://api.<domain>`, `UPLOADS_DIR=/app/uploads`, `SWAGGER_ENABLED=false`, `AI_QUESTION_GENERATION_ENABLED=false`, `ALLOW_YOUTUBE_ASSET_DOWNLOADS=false`, `SMS_OTP_ENABLED=false`, `ANSWER_MATCHING_TOLERANT_MECHANICS` **unset**, `APP_COMMIT_SHA`/`RENDER_GIT_COMMIT=<sha>`, `FRONTEND_HOST`, `API_HOST`, `ACME_EMAIL`, `IMAGE_TAG=<sha>`.
16. Build or pull images for `<sha>`. The frontend **must** be built with `NEXT_PUBLIC_API_URL=https://api.<domain>` and `NEXT_PUBLIC_LIVE_GAME_DEBUG=false`.
17. `docker compose -f deployment/compose.prod.yml --env-file deployment/.env config --quiet`, then `up -d`.
18. Watch `docker compose logs -f backend` for: DB connected, `R2 mirroring enabled for bucket …`, presence lease registered, `CORS allowlist: https://play.<domain>`, `Swagger UI disabled`, deadline re-arm summary.

**Phase F: verify (staging hostnames first)**
19. `curl https://api.<host>/health` returns `{"status":"ok","database":"connected","commit":"<sha>"}`.
20. CORS: the allowed origin gets an ACAO header. `Origin: https://evil.example` gets none (`docs/BETA-DEPLOYMENT.md:225-231`).
21. Media: `/uploads/<known key>` returns 302 to `https://media.<domain>/…` and then 200.
22. WebSocket: a browser joins a room; DevTools shows a `101 Switching Protocols` to `wss://api.<host>/socket.io/…`.
23. Rate limit sanity: 12 reconnects from different devices or networks within a minute do **not** trigger `JOIN_RATE_EXCEEDED` (proves trust proxy).
24. Full smoke from `docs/BETA-DEPLOYMENT.md:333-367`: OTP login by email, create a game, join from a phone on cellular, one round per beta mechanic, airplane-mode reconnect, host hard-refresh, microphone, and a `docker compose restart backend` mid-round (deadline re-arm plus client resync).
25. Upload a small admin image and confirm it lands in R2.

**Phase G: cutover**
26. Announce a short freeze with no live sessions. On Render, leave the service running (it is the rollback).
27. Switch DNS, or update `NEXT_PUBLIC_API_URL` on Vercel and redeploy if the frontend stays on Vercel. Update `CORS_ORIGINS` on the VPS.
28. Re-run steps 19–24 on the production hostnames.
29. After about 7 days stable: disable Render auto-deploy and remove `0.0.0.0/0` from Atlas. Keep the Render service suspended, not deleted, for a while.

**Phase H: operate**
30. Daily backup job plus a monthly restore drill into a scratch DB.
31. Uptime alert on `/health` that asserts `commit` matches the expected SHA after each deploy.
32. Deploys outside live-play windows, because a single instance means a brief socket drop on every deploy.

### Rollback procedure

- **Bad app release (same infra):** set `IMAGE_TAG=<previous sha>` in `deployment/.env` and run `docker compose … up -d backend frontend`. Verify `/health.commit == <previous sha>`. This requires SHA-tagged images to be retained (gap P1). If images are built on the VPS, the fallback is `git checkout <prev sha>` plus a rebuild (slow; needs RAM).
- **Bad schema/data migration:** migrations are one-off scripts with no down-migrations. Take a `mongodump` (or Atlas on-demand snapshot) **immediately before** any migration. Roll back by restoring into the DB (with `--drop` only on that DB, after confirmation).
- **Bad infra cutover:** point DNS (or Vercel's `NEXT_PUBLIC_API_URL` plus a redeploy) back to `akwaan-api.onrender.com`. Render still uses the same Atlas DB and R2 bucket, so there is no data divergence **as long as the DB stayed on Atlas**. If the DB was moved to a self-hosted RS, rollback requires dumping VPS data back to Atlas, so plan a read-only window.
- **Frontend only:** Vercel "promote previous deployment", or the previous frontend image tag.

---

## 6. Not verified / open questions

- Full Render and Vercel dashboard env sets (X4). The Atlas tier and backup policy. Whether Render today also collapses `request.ip` for the join limiter (A15).
- Frontend Docker image runtime on Alpine (sharp for `next/image`). Memory needed for `next build` on the target VPS. These were not built per instruction.
- Production multi-device gameplay on any host (roadmap `:156`).
- Drift: `render.yaml:24` `autoDeploy: true` vs roadmap "Render Auto-Deploy is Off" (`:120-121`).
