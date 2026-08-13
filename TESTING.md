# Testing and verification

The repository uses one root npm lockfile and npm workspaces. Install dependencies
from the repository root; do not create nested lockfiles.

## Fast, deterministic verification

`npm run verify` runs frontend and backend linting, TypeScript checks, frontend
Vitest mapper tests, backend Jest tests, OpenAPI drift validation, Orval generated
client drift validation, the API architecture guard, and both production builds.
Normal verification performs no external AI, media-provider, or network calls.

## Frontend unit tests

- `npm run test:frontend` runs Vitest once in jsdom.
- `npm run test:frontend:watch` starts watch mode.
- Handwritten feature mappers are tested; generated Orval code is not tested directly.

## Browser smoke tests

Start the isolated environment with
`docker compose -f docker-compose.test.yml --profile e2e up --build -d`, then run
`npm run test:e2e`. It uses the ephemeral `akwaan_e2e_test` database and deterministic
fixture accounts. `E2E_BASE_URL` defaults to `http://127.0.0.1:3201`. Stop and erase
the ephemeral stack with `docker compose -f docker-compose.test.yml down -v`.

Install the browser once with `npm run test:e2e:install`. Use
`npm run test:e2e:ui` for interactive debugging. Focused commands are
`npm run test:e2e:admin`, `npm run test:e2e:game`, and `npm run test:e2e:ai`.
Never point E2E at production.

Chromium coverage includes authentication/session protection, administrator navigation
and Catalog CRUD, deterministic dashboard statistics, Game creation/reveal/award/skip
with refresh persistence, and AI Generator ready/failed/timeout presentation. AI browser
presentation uses Playwright interception with deterministic reviewed-draft fixtures;
the real orchestration and persistence boundaries remain covered by backend integration
tests, so browser tests make no live AI or asset calls. Mutations use unique names and
clean up when supported; resetting the `_test` database and rebuilding the E2E profile
provides a clean major-suite boundary.

Playwright retains traces, screenshots, and video only on failure. The expected local
runtime is under 15 seconds after the Docker E2E stack is healthy. Full completion of
all 36 board questions is intentionally left to HTTP lifecycle coverage; the browser
suite verifies representative persisted award and skip transitions without adding a
long, brittle UI loop.

## Integration and live-provider boundaries

Backend Jest suites mock AI and asset-provider infrastructure. Live AI is intentionally
excluded from verification and must never persist content by default. Media integration
requires FFmpeg/FFprobe and belongs in an isolated Docker test environment. Test fixture
work must use a database name ending in `_test`; production seeds are not test fixtures.

Backend integration fixtures can only target database names ending in `_test`:
`npm run test:fixtures:seed`, `npm run test:fixtures:reset`, and
`npm run test:backend:integration`. The HTTP integration suites cover auth and catalogs,
the admin/public Questions CRUD and approval lifecycle, deterministic primary/cover
asset resolution, the Games board, reveal, scoring, skip, finish, subscription,
ownership and persistence lifecycle, Music upload/list/update/answer/soft-delete and
cleanup behavior, and reviewed AI generation/save behavior. They use the real Nest
modules, MongoDB repositories, guards, validation, orchestration, agents, prompt
builders, knowledge loading, repair, and response mappers.

Music HTTP tests replace only local audio storage, inspection, and snippet processing
with deterministic recording fakes. They cover default and custom snippet timing,
multipart validation, safe generated names, draft Question creation, normalized Arabic
answers, compensation, and response safety. Real FFmpeg/FFprobe execution remains in
the separate media integration suite.

AI HTTP tests inject a queued fake `LlmClientService` and deterministic `AssetService`.
They verify the generator → asset planner → asset reviewer → question reviewer order,
default count, knowledge fallback metadata, wrong-answer repair success/failure/empty
behavior, gameplay normalization, timeout and unavailable errors, independent primary
and cover failures, generation/persistence separation, partial and duplicate save-draft
reporting, legacy endpoint compatibility, and debug-tools authorization without calling
external providers. Fake-provider call counts prove fatal failures do not continue into
asset work. Live AI remains a separate opt-in check; broader browser coverage remains
Playwright debt and is intentionally outside this phase.

## Match setup modes

A Match carries an explicit persisted `setupMode`. New Matches are created in one
step through `POST /live-game-sessions/:sessionId/match/unified`
(`unified_preconfigured`): three configured World occurrences with exactly four
Scopes each, twelve board positions, opening at `stage = board`. The sequential
setup routes (`/create`, `/start`, `/coin-toss`, `/worlds/select`,
`/scopes/select`, `/worlds/continue`) are `legacy_sequential` only, are deprecated,
and Phase 5 deletes them — do not exercise a new Match through them and do not
build new UI against their stages. See
`docs/UNIFIED_MATCH_PHASE_1_ARCHITECTURE.md`.

The host configures a Match at `/games/new/setup` before anything exists on the
server; the wizard's own draft lives in `sessionStorage` and is never Match
authority. Frontend coverage: `src/test/match-setup-draft.test.ts` (the reducer and
draft recovery), `src/test/match-setup-wizard.test.tsx` (the journey, including
that zero server calls happen before ابدأ المباراة), and
`src/test/match-setup-creation-contract.test.ts` (the exact four requests that go
on the wire). `src/test/unified-match-board-handoff.test.tsx` proves a
preconfigured Match renders its twelve positions and never a sequential setup
stage, and `src/test/unified-board-launch.test.tsx` covers the functional board:
launching from any occurrence first, a request that carries no ContentItem id, the
phone-required handoff coming from the server capability, precise unavailable
reasons, completed tiles staying in place, and the last position routing to the
Match-complete screen.

Challenge preflight and phone pairing: `src/test/unified-preflight.test.tsx` covers
the frontend (a tile click prepares rather than launches, QR and join code, team
counters, Start gated on the server's `readyToLaunch`, cancel, and refresh recovery),
`src/modules/match/application/match-challenge-readiness.service.spec.ts` covers the
per-mechanic readiness contracts read off the real launchers, and
`test/integration/unified-match-preflight.integration-spec.ts` is the end-to-end
proof: prepare with no runtime, pair four phones through the real join route, launch,
play the real ركّبها race to completion, reconcile back to the board, and reuse the
same participants for the next challenge.

Server-side content selection is covered by
`src/modules/match/application/match-content-selection.service.spec.ts` (counts from
the launcher, occurrence pool isolation, repeated-World isolation, determinism, and
insufficient content) and end to end by the unified integration suite, which
launches through the production route with no client content, plays the real RYO
runtime, reconciles back to the board, and reloads from Mongo.

Coverage: `test/integration/unified-match-api.integration-spec.ts` drives the
production route end to end — Anime, Football, Anime again from a different
Scope pool; a challenge from the *third* occurrence played first; reload from
Mongo; and no Match written when a configuration fails to validate.
`test/integration/match-persistence.integration-spec.ts` proves both setup modes
round-trip unchanged, including that a stored Match with no `setupMode` reads as
`legacy_sequential`. `test/integration/match-api.integration-spec.ts` remains the
legacy-flow regression suite.

Games concurrency is verified against MongoDB by loading the same game twice, saving
one copy, and asserting that saving the stale copy raises Mongoose's version error.
Run these suites through `docker compose -f docker-compose.test.yml run --rm
backend-integration`; the current baseline is 5 suites and 31 tests (about 5 seconds
after MongoDB is healthy). They remain in
`verify:full` rather than the offline `verify` command because they require MongoDB.

Run the real synthetic-tone suite locally when FFmpeg/FFprobe exist, or with
`npm run test:media:integration:docker`. `npm run verify:full` uses the Docker
integration and media runners before Playwright, so it does not depend on host FFmpeg.

OpenAPI generation uses a controller-only documentation module and performs no MongoDB,
storage, media, seed, or AI initialization. `npm run api:check` proves this with an
unreachable MongoDB URI and a 15-second bound before validating byte-for-byte drift.

`npm run test:ai:live` is skipped unless all explicit `LIVE_AI_*` variables are set;
it requests one reviewed draft and never calls the save-drafts endpoint.

## Known Next.js workspace warning

Local Next.js 15.5.19 builds succeed but its lockfile repair code emits
`ENOWORKSPACES` while incorrectly probing `pnpm config get registry`. The repository
has one authoritative root npm lockfile and already sets `outputFileTracingRoot`.
Docker performs the same SWC lockfile repair successfully. No lockfile is deleted and
the project remains on npm; this is retained as upstream-tooling noise because the
production build exits successfully.
