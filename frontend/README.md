# Akwaan Frontend

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, Arabic-first (RTL).

The authoritative description of the product and its current state is
`GAME_NEW_SYSTEM_ROADMAP.md` at the repository root; see also `ARCHITECTURE.md`,
`TESTING.md` and `DESIGN.md` in this folder.

## Main routes

| Route | Purpose |
|---|---|
| `/` | Worlds home |
| `/login` | Passwordless (OTP) sign-in |
| `/worlds/[id]`, `/matches/new` | World page and Match setup |
| `/matches/[id]` | Shared-screen Match |
| `/join/...` | Player phone join flow |
| `/how-to-play` | Mechanic explainers |
| `/admin/worlds` | World management (Worlds, Scopes, mechanics, content items) |
| `/admin/content-engine` | Content Engine review |
| `/admin/subscriptions` | Users |

## Development

```bash
npm run dev          # NEXT_PUBLIC_API_URL defaults to http://localhost:3000
npm run typecheck
npm test             # Vitest
npm run test:e2e     # Playwright (see TESTING.md)
```

`src/api/generated` is produced by Orval from `backend/openapi/openapi.json`
(`npm run api:generate`); see `src/api/README.md`.
