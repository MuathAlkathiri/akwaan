# Akwaan Backend

NestJS 10 + MongoDB (Mongoose) API and Socket.io gateway for Akwaan.

The authoritative description of the product, architecture and current state is
`GAME_NEW_SYSTEM_ROADMAP.md` at the repository root; see also `ARCHITECTURE.md`
and `TESTING.md`.

## Modules (`src/modules`)

| Module | Responsibility |
|---|---|
| `auth`, `auth/otp` | Passwordless (OTP) sign-in and JWT sessions |
| `users`, `subscriptions` | Accounts and admin user management |
| `world-content` | Worlds → Scopes → mechanics, content items, tutorials |
| `match` | Match orchestration over World boards |
| `live-game-sessions` | Live rooms, participants, presence, gameplay runtimes and plugins |
| `scoring` | The single scoring module |
| `content-engine` | Offline AI authoring pipeline; writes DRAFT content items only |
| `media-rights` | Media provenance and rights records |
| `ai-agent` | Shared AI infrastructure used by the Content Engine (provider interface, Wigolo client, guarded image download) |

## Running

```bash
cp .env.example .env   # then fill in the values
npm run start:dev      # http://localhost:3000
```

`npm run build && npm run start:prod` for a production build. Environment
variables are documented inline in `.env.example`.

## Tests

```bash
npm test                     # Jest unit/application specs
npm run test:integration     # needs MongoDB with a *_test database (see TESTING.md)
```

## API contract

`npm run api:openapi` regenerates `openapi/openapi.json` offline from the
controller-only module in `scripts/openapi-app.module.ts`; `npm run api:check`
verifies it. The frontend Orval client is generated from this document.
