# Classic game — retired from Akwaan routing, intentionally preserved

This is the six-category "الستة الكبار" game: a board of 200/400/600 point tiles,
two teams, a purple identity, and its own question/answer player screens. It was
the whole product before the Akwaan Match architecture replaced it.

## Status

- **Retired from current Akwaan routing.** There is no `app/` route that renders
  any of this. `/games`, `/games/[id]`, `/games/new`, `/games/categories` and the
  question/answer player routes were removed from the Next.js app tree, so those
  URLs no longer resolve. Nothing here is behind a redirect either — the routes
  are gone, not hidden.
- **Intentionally preserved.** None of it was deleted. It may come back as an
  independent Classic mode, so it stays readable and buildable.
- **Not imported by the current player experience.** No file under `app/`,
  `features/match-setup`, `features/live-game-session`, `features/worlds` or
  `components/akwaan` imports anything in this directory. A test asserts this
  (`src/test/legacy-detachment.test.ts`) so an accidental import fails the suite
  rather than quietly re-attaching the old product.
- **Not modernised.** The purple identity, the old copy and the old layout are
  left exactly as they were. Redesigning retired code would only make the
  eventual Classic-mode decision harder to reason about.

## What lives here

| Path | What it is |
| --- | --- |
| `components/` | The classic board, game form, list, and the question/answer players |
| `config/` | Classic team colours and board configuration |
| `hooks/` | React Query hooks over the legacy `/games` REST API |
| `mappers/`, `utils/` | Request/response mapping for the legacy API |
| `game-card-component/` | The "متابعة اللعبة" card |
| `user-dashboard.tsx` | The classic six-category picker |

## Data

Legacy `Game` documents were **not** touched. They remain in Mongo, and the
backend still serves the legacy `/games` API. The Akwaan Match system simply
ignores them. Reviving Classic mode is a routing decision, not a migration.

## If you bring it back

Add routes under a namespace of its own (e.g. `app/classic/…`) rather than
restoring `/games` — `/games` collided with the Akwaan Match setup route once
already, which is why setup now lives at `/matches/new`.
