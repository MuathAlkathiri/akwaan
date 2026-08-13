# Akwaan — أكوان

Akwaan is an Arabic social party game. This is the single monorepo for the whole
product: the player/admin web app, the API, and the AI content-authoring
workspace.

```text
akwaan/
├── frontend/   # Next.js web app (player + admin)
├── backend/    # NestJS API, MongoDB/Mongoose, auth, AI, media
└── ai/         # OpenCode content-authoring workspace (skills, roles, validators)
```

`frontend` and `backend` are npm workspaces driven from the repository root.
`ai` is a Python/OpenCode workspace with its own tooling — it is versioned here
but is not an npm workspace.

## Setup

```bash
npm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Then fill in `backend/.env` (Mongo URI, JWT secret, admin bootstrap, AI keys).

> **Database name.** The Mongo database is `lammah-quiz`. That name predates the
> Akwaan rename and is where the live content actually lives, so it is
> deliberately unchanged. The same applies to the Docker volumes
> (`lammah-game_mongodb_data`, `lammah-game_backend_uploads`), which are pinned by
> explicit name in `docker-compose.yml` so they survive directory renames.
> Renaming either one requires a verified, non-destructive data migration.

## Develop

```bash
npm run dev            # backend + frontend together
npm run dev:backend    # NestJS on :3000 (watch)
npm run dev:frontend   # Next.js on :3001
```

## Verify

```bash
npm run lint
npm run typecheck
npm run test
npm run build

npm run verify         # all of the above + API contract checks
```

Per-workspace equivalents exist as `:backend` / `:frontend` variants — see
`package.json`. Test layers (integration, media, e2e) are documented in
[TESTING.md](TESTING.md).

## Docker

```bash
docker compose up -d --build      # frontend :3001, backend :3002, mongo :27017
docker compose config             # validate before starting
docker compose down               # never pass -v: that destroys the database
```

The Compose project is named `akwaan`; service names are `frontend`, `backend`,
and `mongodb`.

## API contract

The backend is the source of truth. `backend/openapi/openapi.json` is generated
from the NestJS decorators, and the frontend's typed client is generated from
that file by Orval:

```bash
npm run api:openapi        # regenerate the spec from backend code
npm run api:generate       # regenerate frontend/src/api/generated from the spec
npm run api:check          # fail if the committed spec is stale
```

## AI authoring workspace

See [ai/.opencode/README.md](ai/.opencode/README.md). It reads the product
source through repository-relative paths (`../backend`, `../frontend`), so it
works from any checkout location.

## Further reading

- [ARCHITECTURE.md](ARCHITECTURE.md) — module and layering rules
- [GAME_NEW_SYSTEM_ROADMAP.md](GAME_NEW_SYSTEM_ROADMAP.md) — source of truth for architecture and priorities
- [TESTING.md](TESTING.md) — test layers and how to run them
- [deployment/README.md](deployment/README.md) — VM deployment
