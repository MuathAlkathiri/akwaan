# Live Game Sessions — Phase 1 Architecture

## Existing architecture

Lammah is an npm-workspace monorepo with a NestJS/Mongoose backend and a
Next.js/React 18 frontend. The existing `games` module owns the classic board
game and its category/question flows. HTTP authentication uses Passport JWT,
controllers receive the authenticated database user, and frontend requests use
the centralized Axios client with `authStorage` as the only token boundary.
React Query owns server request state. The project did not previously include a
WebSocket transport.

Phase 1 deliberately adds a sibling bounded context rather than extending the
classic `Game` document. This prevents realtime lifecycle and clock concerns
from leaking into the stable classic-game behavior.

## Backend boundaries

`src/modules/live-game-sessions` is split by responsibility:

- `domain`: the session aggregate, team clock, lifecycle/turn rules, errors,
  mode definition, registry, and repository contract.
- `application`: focused command/query use cases, authorization, snapshots, and
  a transition publisher port.
- `infrastructure`: Mongoose schema/repository, system clock, JWT socket
  authentication, and Socket.IO transition publishing.
- `presentation`: validated REST DTOs, a minimal recovery controller, and a thin
  room-based gateway.

The aggregate is transport- and persistence-agnostic. It persists timestamps
and accumulated clock consumption, never per-second ticks. Commands carry an
opaque command ID and expected revision. Duplicate command IDs return the
current state; stale revisions fail. Mongoose updates compare the stored
revision before replacing the aggregate, preventing silent concurrent writes.

The initial registry contains only `core-timed-turns` version `1`. Its policy
sets team bounds, initial duration, readiness, single-running-clock behavior,
turn order, persistence between turns, and expiry. Mode-specific behavior can
later be registered without changing the core aggregate.

## Snapshot and transport ownership

One explicit snapshot mapper is used by both REST and WebSocket responses.
Snapshots expose safe participant presence and timestamp-based clock state, but
never reconnect credentials or database internals.

REST supports creation, recovery fetch, reconnect credential rotation, and
cancellation. Socket.IO uses the `/live-game-sessions` namespace and
`live-session:{sessionId}` rooms. The gateway authenticates JWTs, validates
commands, authorizes room access through application queries, and delegates all
mutations. It does not calculate time or mutate MongoDB.

## Frontend boundaries

`src/features/live-game-session` contains:

- `api`: creation and initial/recovery REST calls.
- `realtime`: the single Socket.IO adapter and typed event contract.
- `state`: the authoritative snapshot reducer and derived selectors.
- `hooks`: connection, command, active-turn, and interpolated-clock behavior.
- `components`: small shadcn-composed status, clock, participant, control,
  loading, and error views.

React Query fetches the initial snapshot. A feature provider then owns one
socket connection and one reducer per mounted session. Components receive
derived values and commands from hooks; they contain no lifecycle or timing
rules. Local clock interpolation uses the server snapshot timestamps and is
reset by every new authoritative snapshot.

## Security and recovery

REST retains the existing JWT guard. Socket identity comes only from a verified
JWT and the current database user, never from message payloads. Phase 1 creates
the host as the controller participant; observers may subscribe but cannot
mutate. Team IDs are generated server-side and validated against the aggregate.
Reconnect tokens are opaque, stored only as SHA-256 hashes, rotated on use, and
excluded from broadcasts and logs.

Disconnects affect persisted participant presence metadata but do not pause the
domain session. A refresh performs a REST bootstrap followed by room
subscription and an authoritative snapshot. Timers therefore survive process
restarts, disconnects, suspended browser tabs, and multiple clients.

## Scope guardrails

This phase has no Bomb terminology, QR joining, microphone/media behavior,
questions, answers, scoring, or implicit correct-answer turn transitions. It
adds an internal neutral validation surface and does not replace or modify
classic game routes, APIs, or business behavior.
