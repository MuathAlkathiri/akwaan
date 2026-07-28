# Live Game Sessions — Phase 2 Architecture

## Scope and boundaries

Phase 2 extends the validated Phase 1 bounded context without changing its
clock, turn, optimistic-concurrency, or Socket.IO contracts. Join access is a
separate aggregate because issuance, public-code lookup, expiration, failed
attempts, and revocation are not gameplay lifecycle concerns. Stable
participants remain embedded in the live-session aggregate because team
membership, readiness, credential version, and removal affect who may act in a
session.

## Join access

`LiveSessionJoinAccess` has one active record per session and a globally unique,
case-insensitive public code. Codes use an ambiguity-free alphabet. Access
records contain policy, capacity, timestamps, revocation state, bounded failure
metadata, and audit actor IDs. Regeneration revokes the previous access and
creates a new code. QR payloads contain only the frontend
`/join/live-session/{code}` URL.

## Participant credentials

Successful enrollment issues a short-lived JWT with `tokenKind:
live-participant`, session ID, participant ID, role, credential version, and
expiry. It uses the existing signing infrastructure but a distinct payload
contract. Normal Passport JWT authentication attempts to resolve `sub` as a
user, so participant credentials cannot become application-user or admin
credentials. Every participant REST/socket authentication validates the
persisted participant, session, removal state, and credential version. Removing
or revoking a participant increments that version, invalidating issued tokens.
No raw participant token or token hash is persisted or broadcast.

## Enrollment and assignment

The join use case resolves active access, validates session availability,
normalizes the display name, enforces participant and team capacities, chooses
an assignment through `explicit`, `balanced`, or `host-assigned` policy, and
persists through the existing optimistic repository. Join request IDs provide
bounded retry idempotency. Team IDs always come from the persisted session.

The neutral readiness rule is backward compatible with Phase 1: a session with
no enrolled players retains team-only readiness. Once players enroll, every
active team must have at least one ready team player before the host can mark
the session ready. Starting remains an explicit host action.

## Presence and reconnect

Participant identity survives sockets and refreshes. Presence updates use the
stable participant ID and maintain a bounded maximum of two simultaneous
connections per participant. Heartbeats are throttled in memory and persist
`lastSeenAt` at most once per configured window. Disconnect does not delete a
participant or clear readiness. Reconnect validates the credential version and
returns a fresh credential and authoritative snapshot for the same participant.

## Frontend ownership

React Query owns join-access, join metadata, enrollment, reconnect, and host
participant mutations. The existing live-session reducer remains the only owner
of authoritative socket snapshots. A focused session-storage adapter owns
participant credentials. The public route composes metadata, enrollment, and
lobby components; it owns no authorization or readiness rules. Host QR
rendering uses a client-side SVG dependency and never stores generated images.

## Multi-instance note

MongoDB provides durable session, access, participant, and credential-version
state. Socket rooms, per-IP throttles, and heartbeat write throttles remain
process-local in Phase 2. A production horizontally scaled deployment must add
a shared Socket.IO adapter and distributed rate limiter.
