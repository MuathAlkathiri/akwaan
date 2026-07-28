# Live Game Sessions — Phase 3 Architecture

## Boundary

The existing live-session aggregate remains authoritative for session
lifecycle, teams, participants, readiness, active team, generic turns, and
clocks. A separately persisted `GameplayRuntime` aggregate references one live
session and owns runtime lifecycle, round lifecycle, validated plugin state,
bounded command IDs, bounded transition history, bounded completed-round
summaries, and runtime revision.

No team, participant, clock, or turn is duplicated as writable runtime state.
Round `activeTeamId` and `activeParticipantId` are references validated against
the current live-session aggregate whenever they are assigned or used.

## Plugin contract

`GameplayModePlugin` is a versioned, infrastructure-free domain contract.
Plugins create and validate runtime and round state, validate mode-command
payloads, declare authorization requirements, reduce commands
deterministically, project safe client state, and calculate actor-specific mode
actions. Plugins cannot access repositories, sockets, authentication, or mutate
the live-session aggregate.

Phase 3 registers only `core-round-runtime` version 1. Its validated state is a
small phase enum (`waiting`, `presenting`, `resolving`, `completed`). Its sole
mode command advances the phase; it has no questions, answers, media, scores,
or mode-specific session effects.

## Commands, events, and authorization

Every mutation carries a UUID command ID and expected runtime revision.
Operations that coordinate with the session also validate its expected
revision. Actor identity and membership are resolved from authenticated server
state. The reusable authorization policy supports controller-only, connected
player, active-team player, active participant, observer-safe, and internal
requirements. The same evaluator produces snapshot actions and enforces
commands.

Accepted transitions create bounded generic event envelopes containing safe
metadata and resulting revisions. Credentials, socket IDs, processed command
IDs, raw persistence state, and private payloads are never projected.

## Persistence and consistency

MongoDB stores gameplay runtimes in their own collection with unique runtime
and live-session indexes and optimistic revision replacement. Embedded command,
transition, completed-round, and event histories are capped.

The neutral Phase 3 plugin requests no live-session mutations, so runtime
commands persist exactly one aggregate. Lifecycle use cases load the session,
validate its state and revision, then persist only the runtime. The effect
contract is explicit and currently permits only safe generic effect types; an
unsupported effect fails before persistence. A future plugin that needs atomic
session and runtime writes must add a shared transaction unit-of-work rather
than performing two independent saves.

## Client ownership and recovery

The existing live-session snapshot gains one optional nested `gameplay`
projection. REST bootstrap and socket recovery use the same mapper. The existing
frontend reducer remains the single snapshot authority and compares both
session and runtime revisions so one half cannot regress while the other
advances. React Query is used only for creation/bootstrap mutations; the socket
snapshot replaces committed state.

Socket rooms and throttles remain process-local. All authoritative gameplay
runtime state is durable and recoverable from MongoDB.
