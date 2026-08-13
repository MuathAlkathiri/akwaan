# Akwaan BETA deployment

A temporary public deployment for real multiplayer playtesting. Production
later moves to AWS; nothing here is meant to survive that move.

```
Vercel (frontend)  ──HTTPS/WSS──▶  Render (NestJS + Socket.IO)
                                        │
                                        ├──▶ MongoDB Atlas M0  (lammah-quiz)
                                        └──▶ Cloudflare R2      (media)
```

**No secret values belong in this file.** Everything below is written as
`VARIABLE_NAME=<set in dashboard>`.

Two names look wrong and are not. The database stays `lammah-quiz` and the
Docker volumes keep their `lammah-game_` prefix: both are storage identity, not
branding. Renaming either points the app at empty storage.

---

## Order of operations

Each step depends on a value the previous one produces, so the order matters.

| # | Service | Produces |
|---|---------|----------|
| 1 | MongoDB Atlas | SRV connection URI |
| 2 | Cloudflare R2 | bucket, API token, public media base URL |
| 3 | Render | backend URL |
| 4 | Vercel | frontend URL |
| 5 | Wiring | `CORS_ORIGINS` on Render, `NEXT_PUBLIC_API_URL` on Vercel |
| 6 | Database copy | data in Atlas |
| 7 | Media copy | files in R2 |
| 8 | Smoke test | a real two-device game |

Steps 3 and 4 both come up half-configured — Render does not know the Vercel URL
yet, and Vercel does not know the Render URL. Step 5 closes that loop and
redeploys both. That is expected, not a mistake.

---

## 1. MongoDB Atlas

Create a free M0 cluster.

| Field | Value |
|-------|-------|
| Provider | AWS |
| Region | Frankfurt (`eu-central-1`) — match the Render region |
| Tier | **M0 Free** |
| Cluster name | `akwaan-beta` |

Then:

1. **Database Access → Add New Database User**
   - Authentication: Password
   - Username: `akwaan-api`
   - Password: generate and store it in your password manager
   - Role: **Read and write to any database**
2. **Network Access → Add IP Address**
   - Render Free publishes no static outbound IP, so allow `0.0.0.0/0`.
   - This is why the database password must be strong and unique — the
     allowlist is doing no work.
3. **Connect → Drivers** and copy the SRV URI. Append the database name and the
   write concern:

   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/lammah-quiz?retryWrites=true&w=majority
   ```

   The `/lammah-quiz` path segment is required. Without it the driver connects
   to `test` and the app finds an empty world.

M0 is a three-node replica set, which the gameplay runtime needs — live sessions
commit through real Mongo transactions and would fail against a standalone
server.

---

## 2. Cloudflare R2

R2 is **required**, not optional. See [Why R2 is required](#why-r2-is-required).

1. **R2 → Create bucket**

   | Field | Value |
   |-------|-------|
   | Bucket name | `akwaan-media` |
   | Location | Automatic |

2. **Settings → Public access → R2.dev subdomain → Allow Access.**
   Copy the resulting `https://pub-<hash>.r2.dev` URL. That is
   `MEDIA_PUBLIC_BASE_URL`. Public read is intended: these are game images,
   audio and video that every player's browser must fetch.

3. **R2 → Manage API Tokens → Create API Token**

   | Field | Value |
   |-------|-------|
   | Permissions | **Object Read & Write** |
   | Specify bucket | `akwaan-media` only |
   | TTL | leave default |

   Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID**.
   The secret is shown once.

---

## 3. Render

The repository contains [`render.yaml`](../render.yaml). Use
**New → Blueprint** and point it at the repo — the blueprint fills in
everything except the secrets, which it deliberately marks `sync: false`.

Verify these after import:

| Field | Value |
|-------|-------|
| Name | `akwaan-api` |
| Language / Runtime | **Docker** |
| Branch | `main` |
| Region | Frankfurt |
| Dockerfile Path | `./backend/Dockerfile` |
| Docker Build Context Directory | `.` (repository root) |
| Health Check Path | `/health` |
| Instance Type | **Free** |
| Auto-Deploy | On |

Docker rather than a native Node build because the backend shells out to
`ffmpeg`, `ffprobe` and `yt-dlp` for audio and video snippets. `backend/Dockerfile`
installs all three and already understands the npm-workspace layout. A native
build would install and then fail on the first media upload.

Do **not** add a Render disk and do **not** add a Render database. Storage is
Atlas and R2.

### Environment variables

```text
NODE_ENV=production
MONGODB_URI=<set in dashboard>
JWT_SECRET=<set in dashboard>
JWT_EXPIRES_IN=7d
CORS_ORIGINS=<set in dashboard — step 5>
APP_BASE_URL=<set in dashboard — this service's own URL>
UPLOADS_DIR=/app/uploads
R2_ACCOUNT_ID=<set in dashboard>
R2_BUCKET=<set in dashboard>
R2_ACCESS_KEY_ID=<set in dashboard>
R2_SECRET_ACCESS_KEY=<set in dashboard>
MEDIA_PUBLIC_BASE_URL=<set in dashboard>
SWAGGER_ENABLED=false
AI_QUESTION_GENERATION_ENABLED=false
ALLOW_YOUTUBE_ASSET_DOWNLOADS=false
```

`JWT_SECRET` must be a new random value, at least 32 bytes. Generate it with
`openssl rand -base64 48`. Reusing the local development secret would let anyone
who has ever seen it mint valid tokens against the public BETA.

Render injects `PORT` itself; the app reads it and binds `0.0.0.0`. Do not set
it manually.

After the first deploy, Render shows the service URL —
`https://akwaan-api.onrender.com`. Set `APP_BASE_URL` to exactly that.

### What Free tier costs you

- **The instance sleeps after ~15 minutes of inactivity.** The next request
  takes 30–60 seconds to wake it. Open the backend URL yourself a minute before
  a playtest so testers never see the cold start.
- The browser client connects with `transports: ["websocket"]` and no polling
  fallback, so a socket opened *during* a cold start fails rather than
  degrading. Waking the service first avoids this entirely.
- One instance, no autoscaling. That is what the live-session code needs:
  Socket.IO rooms are per-process and there is no Redis adapter. Do not raise
  the instance count.

---

## 4. Vercel

**Add New → Project**, import `MuathAlkathiri/akwaan`.

| Field | Value |
|-------|-------|
| Framework Preset | **Next.js** |
| Root Directory | `frontend` |
| Build Command | leave default (`next build`) |
| Output Directory | leave default |
| Install Command | leave default |
| Node.js Version | 20.x or later |

Root Directory must be `frontend`. Leave "Include files outside the root
directory" **on** — this is an npm workspace and the lockfile lives at the
repository root.

### Environment variables

```text
NEXT_PUBLIC_API_URL=<set in dashboard — the Render URL, no trailing slash>
```

That single variable drives everything: REST calls, `/uploads/...` media
resolution, and the Socket.IO namespace. An `https://` value makes the socket
`wss://` automatically.

`NEXT_PUBLIC_*` values are compiled into the browser bundle and are readable by
anyone. Never put a key you would not print on a billboard behind that prefix.
The only two the app reads are `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_LIVE_GAME_DEBUG`; leave the second unset.

Because it is a build-time inline, **changing it requires a redeploy**, not just
a restart.

Vercel gives you `https://akwaan.vercel.app`.

---

## 5. Wire the two origins together

1. **Render → Environment**: set `CORS_ORIGINS` to the exact Vercel origin.

   ```text
   CORS_ORIGINS=https://akwaan.vercel.app
   ```

   No trailing slash. Comma-separate to add a preview domain. This one value
   governs both the HTTP API and the live-session socket. In production an unset
   value means an empty allowlist and every browser call is refused — that is
   deliberate, so a missing variable fails loudly instead of falling back to
   localhost.

2. **Vercel → Environment Variables**: set `NEXT_PUBLIC_API_URL` to the Render
   URL, then **Redeploy**.

Verify:

```bash
curl -s https://akwaan-api.onrender.com/health
# {"status":"ok","database":"connected"}

curl -si -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://akwaan.vercel.app' \
  https://akwaan-api.onrender.com/health

curl -sI -H 'Origin: https://evil.example' \
  https://akwaan-api.onrender.com/health | grep -i access-control-allow-origin
# no header — the rejection is the point
```

---

## 6. Copy the database

Run from the repository root with Compose up. The local database is only ever
read: `mongodump` does not write, `--drop` is deliberately not passed, and the
script refuses an `ATLAS_URI` that does not name `lammah-quiz`.

```bash
brew install mongodb/brew/mongodb-database-tools

read -rs ATLAS_URI && export ATLAS_URI     # paste, press enter; nothing echoes
deployment/scripts/copy-local-db-to-atlas.sh
```

The script reads from the **Compose container by default**, not from
`127.0.0.1:27017`. That is deliberate — see the warning below. Use
`SOURCE=host` only when MongoDB runs natively and Compose is down.

Before dumping anything it verifies the source against a two-part fingerprint
and refuses to continue on a mismatch:

- **exact** on structural collections — `worlds=5 scopes=18 challenge_types=7`
- **floors** on collections that grow with normal authoring —
  `content_items>=130 users>=24 questions>=136 categories>=19 catalogs>=10`

Exact counts on authored collections would fail every time someone writes a
ContentItem; floors still catch the failure that matters, which is a stale or
near-empty source. Then it
prints local counts, dumps, restores, prints Atlas counts, diffs the two,
compares index totals, and spot-checks representative records including orphan
scopes. Any mismatch exits non-zero.

> **Two MongoDB servers can answer on port 27017.**
> If a native Homebrew `mongod` is running, it wins `127.0.0.1:27017` — it binds
> loopback specifically, ahead of Docker's wildcard bind — so a host URI reads a
> *different database* than the application uses. This actually happened: a
> stale 5-user dataset was briefly mistaken for the live one. Check with
> `lsof -nP -iTCP:27017 -sTCP:LISTEN`. The container default and the fingerprint
> guard both exist to make this unable to cause a bad migration.

Content baseline — the 14 collections that define dataset identity:

| Collection | Docs | | Collection | Docs |
|---|---:|---|---|---:|
| `ai_knowledge_units` | 55 | | `musictracks` | 2 |
| `catalogs` | 10 | | `questionhistories` | 428 |
| `categories` | 19 | | `questions` | 136 |
| `challenge_types` | 7 | | `scopes` | 18 |
| `content_categories` | 10 | | `users` | 24 |
| `content_items` | 130 | | `world_challenge_configurations` | 17 |
| `games` | 15 | | `worlds` | 5 |

876 documents across those 14.

Treat every number above as a floor recorded at one moment, not a target. The
four live-session collections (`live_game_sessions`, `matches`,
`gameplay_runtimes`, `live_session_join_access`) grow with every game played,
and `content_items` grows with every authoring session — it went 130 → 232 in a
single afternoon. Total document count is therefore not an identity signal;
only the structural counts are.

`mongodump`/`mongorestore` carry index definitions, so index parity is a check
rather than a separate step.

Never point this at a cluster you care about with `--drop` added.

---

## 7. Copy the media

```bash
brew install awscli

export AWS_ACCESS_KEY_ID=...        # R2 access key id
export AWS_SECRET_ACCESS_KEY=...    # R2 secret access key
export R2_ACCOUNT_ID=...
export R2_BUCKET=akwaan-media
deployment/scripts/copy-media-to-r2.sh
```

It stages a copy out of the running container, `aws s3 sync`s it to the bucket
without `--delete`, and compares object counts. The `backend_uploads` volume is
read, never modified.

Baseline: **444 files, 258 MB** — 134 png, 121 m4a, 106 jpg, 62 mp4, 15 mp3,
6 jpeg. Comfortably inside R2's 10 GB free tier.

Key layout is preserved, which is the whole trick: `/uploads/music/snippets/x.mp3`
in MongoDB becomes bucket key `music/snippets/x.mp3`, and
`MEDIA_PUBLIC_BASE_URL + key` resolves. **No documents are rewritten and the
frontend is unchanged.**

Verify one URL in a browser before moving on:

```
https://pub-<hash>.r2.dev/music/snippets/<some-file>.mp3
```

---

## 8. Smoke test

Do this on two real devices on different networks — a laptop on wifi and a
phone on cellular. Everything below is a real flow; none of it is mocked.

1. **Wake the backend.** Open `https://akwaan-api.onrender.com/health` and wait
   for `{"status":"ok","database":"connected"}`.
2. **Auth.** Sign in on the laptop at `https://akwaan.vercel.app`. Arabic UI
   text renders right-to-left.
3. **Media.** Open a world with a banner. Images load — that is the R2 redirect
   working. In DevTools, `/uploads/...` shows `302` then a `200` from `r2.dev`.
4. **Create a game** and reach the join code.
5. **Join from the phone**, on cellular, not the same wifi. The participant
   appears on the host screen within a second — that is the socket.
6. **Play one round of each mechanic in the beta set:** RYO, Rakkibha
   (distributed information), One Clue. Scores update on both screens.
7. **Reconnect.** Put the phone in airplane mode for ~10 seconds, then back on.
   The client reconnects and resyncs to the current snapshot; the round is not
   lost.
8. **Snapshot recovery.** Hard-refresh the host tab mid-round. State comes back
   from the server, not from the tab.
9. **Microphone**, if the round uses it. Browsers only grant `getUserMedia` on a
   secure origin; both Vercel and Render are HTTPS, so this works in the BETA
   and would not over plain HTTP.
10. **Sleep behaviour.** Leave it idle 20 minutes, then reload. First request is
    slow, then normal. Confirm you find that acceptable before inviting testers.

---

## Why R2 is required

Not a preference — the alternative is broken media.

- **Render Free has no persistent disk.** The container filesystem resets on
  every deploy, restart, and wake from sleep.
- **258 MB across 444 files** already exists and gameplay reads it.
- **148 documents in 8 collections** store `/uploads/...` URLs: 75 of 136
  `questions`, all 15 `games`, 24 `gameplay_runtimes`, 18 of 19 `categories`,
  8 `scopes`, 3 `worlds`, 3 `content_categories`, 2 `musictracks`.

Without a durable store, every image, audio snippet and video clip 404s the
first time Render recycles the instance, and any banner an admin uploads during
the playtest disappears with it.

### How the code handles it

Local development is unchanged. With the `R2_*` variables unset the mirror is
disabled and files are written to and served from `UPLOADS_DIR` exactly as
before. A *partially* configured bucket is refused rather than half-applied, so
a typo cannot silently turn writes into data loss.

With the variables set:

- **Writes** go to the local disk *and* to R2 under the same key. Images mirror
  inside `LocalImageStorageService.save`. Audio and video mirror after ffmpeg
  finishes, via `LocalAudioStorageService.publish` — the encoder still needs a
  real path to write to, so the local write stays.
- **Reads** hit `express.static` first. Anything not on the local disk — on
  Render, every pre-existing file — redirects `302` to
  `MEDIA_PUBLIC_BASE_URL + key`.

That is what makes the migration a copy rather than a rewrite: no document
changes, no API contract changes, no frontend changes.

---

## Before you share the URL

Confirm each of these:

- [ ] `JWT_SECRET` on Render is newly generated, not the development value.
- [ ] `SWAGGER_ENABLED` is `false`. `/api` should 404 in the BETA.
- [ ] `CORS_ORIGINS` is the exact Vercel origin, and `https://evil.example` gets
      no `Access-Control-Allow-Origin` header back.
- [ ] The Atlas database user password is strong and unique — network access is
      `0.0.0.0/0`, so the password is the only control.
- [ ] **Audit the 24 existing user accounts, especially the 2 admins.** They
      come across in the copy with whatever passwords they were given locally.
      Anyone who can guess a development password gets admin on a public
      instance. Rotate them in Atlas, or delete the accounts you do not need,
      before sharing the link.
- [ ] `AI_QUESTION_GENERATION_ENABLED` and `ALLOW_YOUTUBE_ASSET_DOWNLOADS` are
      `false` — both are admin-gated, but both spend money and CPU a free
      instance does not have.

Registration is open to anyone and always creates a plain `USER`; there is no
role escalation path through it. Admin mutations require a JWT plus the admin
role, and upload endpoints enforce type and size limits (images 5 MB). Those
were checked and need no change for the BETA.

---

## Rolling back

The BETA touches nothing local. To abandon it: delete the Render service, the
Vercel project, the Atlas cluster and the R2 bucket. The local Compose stack,
the `lammah-quiz` database and the `lammah-game_*` volumes are untouched
throughout.
