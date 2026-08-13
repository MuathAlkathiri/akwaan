# Akwaan architecture

Akwaan is a feature-first modular monolith. The frontend and backend remain separate workspaces in one repository; Docker and workspace scripts live at the root.

## Dependency direction

Frontend: `app route -> feature public API -> feature hook/API -> shared HTTP client`.
Routes contain composition only. TanStack Query owns server state. Runtime environment access is centralized in `src/config`.

Backend: `controller -> application service -> feature policy/validator -> contract -> infrastructure provider`.
Controllers do not access Mongoose or external providers. AI agents depend on the normalized LLM client, never controllers or persistence. The AI orchestrator sequences agents; asset providers only search, download, process, and store assets.

Games follows `controller -> creation/query/progress/scoring workflow -> game policy or question selector -> feature repository`. The game document is authoritative for teams, scores, turn, board question state, and completion. Games obtains eligible question-bank records through the Questions repository boundary; it does not register or inject the Question model.

Catalogs and Categories remain separate features. Catalogs owns top-level localized grouping, catalog slugs, banners, ordering, activation, and the existing linked-category deletion guard. Categories owns category identity, catalog association, banners, gameplay configuration, and AI knowledge metadata. Categories validates catalog references through the Catalog repository; Games, Questions, and AI consume explicit Categories query methods rather than category persistence details.

Music owns curated uploaded-track records, music metadata, snippet planning, answer normalization, activation, and the automatic draft-question integration. Its controller delegates to the Music workflow, persistence is isolated behind `MusicTrackRepository`, and responses are mapped before leaving the feature. Generic local audio storage owns safe generated names, upload locations, public URLs, and deletion. Shared media infrastructure owns argument-array FFmpeg/FFprobe execution, timeouts, duration inspection, snippet conversion, and normalized processing failures; it has no knowledge of Music records or question rules. External AI preview providers remain independent from the curated Music library.

Authentication owns credential verification, bcrypt compatibility, JWT signing/configuration, token extraction, current-session resolution, and idempotent administrator initialization. Users owns user persistence, safe user responses, administrative listing, roles stored on the user, free-game counters, and subscription metadata. Authorization remains in reusable JWT/role guards; subscription validity is a separate Users policy consumed through a narrow boundary by Games. On the frontend, Auth owns token/session hydration and redirects, Users owns administrative user queries, TanStack Query owns the current server profile, and one browser-storage adapter preserves the existing localStorage keys.

Admin is an application area, not a business feature. The `/admin` layout owns hydrated administrator access and composes feature-owned screens through their public APIs. Catalogs, Categories, Questions, AI Generation, and Users own their administrative dialogs, hooks, mappings, and actions. A typed navigation configuration is shared by the global header and dashboard shortcuts. Dashboard presentation may read several exported feature queries for the existing client-side summary, but it does not own their CRUD behavior. The Axios client and generic response unwrapping remain shared infrastructure; unrelated business endpoint and hook registries do not.

## Feature ownership

- Authentication: identity, JWT, guards, login/register UI.
- Catalogs/categories: content hierarchy and gameplay/AI configuration.
- Questions: question persistence, status workflow, editing, and asset retry use cases.
- Games: session lifecycle, teams, scoring, reveal and skip behavior.
- Music: uploaded tracks and local snippet processing.
- AI generation: knowledge loading, prompts, specialized agents, reviewed generation, asset planning/resolution, review traces, and draft persistence.
- Subscriptions/users: accounts, roles, and subscription administration.

## AI layers

`modules/ai-agent/agents` owns typed LLM responsibilities. `application` owns workflow and provider selection. `contracts` owns asset/provider ports. `infrastructure/ai` owns model transport. `infrastructure/assets` owns Wikimedia, Apple preview, YouTube, downloading, and storage mechanics. Existing deterministic validators remain under `services` until the reviewed generation facade is decomposed further.

## API contract

The intended flow is `Nest DTO/response DTO -> Swagger -> generated client -> feature wrapper hook -> UI`. Orval is deliberately deferred until response DTO coverage accurately matches runtime endpoints. Until then, feature-owned API wrappers use the centralized Axios client and keep transport types out of components.

## Games state

Persisted game state lives in MongoDB and is mirrored by TanStack Query. Successful game mutations replace the detail cache with the authoritative server response. The Games response mapper adapts the persisted board structure to the existing UI model. Component state is limited to the open board question and dialog reveal presentation; no Zustand store owns scores, turns, used questions, or completion.

## Long-running work

AI generation and media processing remain awaited synchronous operations. No durable queue is introduced yet. If production request duration becomes unacceptable, generation is the first candidate for an explicit job model with status and idempotency—not a fire-and-forget promise.

## Verification

Run `npm run verify` from the repository root. API generation is not currently a quality gate because no generated client is committed.
# Test infrastructure boundary

Contract generation uses `scripts/openapi-app.module.ts`, a controller-only Swagger
reflection graph with no database or external infrastructure. Integration tests use
the real runtime modules against databases whose names must end in `_test`.
`docker-compose.test.yml` owns ephemeral Mongo, media, backend, and frontend test
services and never mounts the development MongoDB volume. Fake AI and asset providers
are injected at infrastructure boundaries; normal verification performs no live calls.
