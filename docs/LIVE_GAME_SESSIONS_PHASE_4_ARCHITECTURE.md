# Live Game Sessions — Phase 4 Architecture

## Interaction ownership

An interaction is an owned entity inside the active gameplay round. The
gameplay runtime remains the aggregate root and owns prompt, submission,
adjudication, outcome, history, and interaction revision state. This preserves
one active interaction per round, one concurrency boundary for gameplay state,
and durable recovery without introducing a competing interaction aggregate.
References to sessions, teams, and participants remain identifiers validated
against the live-session aggregate.

## Plugin capabilities and visibility

Interaction behavior is exposed by an optional, cohesive
`GameplayInteractionPlugin` capability rather than enlarging the base gameplay
plugin. It validates prompt, submission, and outcome payloads; declares
submission authorization and policy; performs deterministic adjudication; and
projects actor-safe prompt, submission, and outcome data.

The application layer owns authentication and resolves an actor visibility
context from persisted membership. One projection mapper is shared by REST and
Socket.IO recovery. Internal prompt data, private adjudication metadata,
credentials, request IDs, and hidden submission payloads are never projected.

## Transactions and effects

`GameplayTransactionUnitOfWork` is an application port. Its MongoDB
implementation uses a Mongoose client session and `withTransaction` to load and
optimistically replace both the live session and gameplay runtime. Domain,
controller, gateway, and frontend code never receives a Mongoose session.
Realtime invalidation is emitted only after the unit of work commits.

Phase 4 activates the existing generic session effects. The neutral interaction
requests `switch-active-team` when resolved. Effects are validated and applied
to the live-session aggregate before both changed aggregates are saved in the
same transaction. Transaction setup failure is explicit; there is no
non-transactional fallback.

MongoDB transactions require a replica set or sharded cluster. Local
development can retain existing data and enable a single-node replica set by
starting `mongod` with `--replSet rs0`, then running
`rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})`
once. The configured connection URI should include `replicaSet=rs0`.

## Deadlines and recovery

Deadlines are persisted UTC timestamps. Commands check expiration against the
server clock and an explicit expire use case resolves overdue interactions.
There is no authoritative process-local countdown. If no client is connected,
the next command or recovery request observes and can process expiration; a
future bounded scheduler may invoke the same use case.

The existing combined live-session snapshot includes an actor-specific
interaction projection. Runtime revision protects interaction changes, and the
frontend continues to use the existing reducer as its sole authoritative
snapshot store.
