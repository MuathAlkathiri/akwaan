# Unified Match — Phase 1 architecture decision

Status: **implemented (backend only)**. Date: 2026-08-06.

Scope of this document: the backend/domain/API/persistence contract a unified
Match obeys, and how it coexists with the sequential Match that shipped before
it. No UI, no QR preflight, and no deletion of the legacy flow belongs to Phase 1.

---

## 1. Why setup moved before gameplay

The sequential journey interleaved configuration with play: coin toss → pick World
1 → pick its four Scopes → play four challenges → `world_complete` → pick World 2's
Scopes → … Three consequences made it the wrong shape.

- **The board could only ever show a third of the match.** `currentOccurrenceIndex`
  decided which four positions existed as far as any client was concerned, so a
  player could never see the twelve challenges they were actually going to play.
- **Configuration decisions were spread across the session.** A group answered
  "which Scopes?" three separate times, mid-game, with a shared screen waiting.
- **Progression was gated by an artefact of the flow.** Occurrence 1 could not be
  touched until occurrence 0 was finished, for no product reason — only because
  the state machine advanced one World at a time.

A unified Match is configured completely before it exists. Everything is decided
and validated up front, so gameplay is nothing but choosing and playing
challenges, and the board is the whole match from the first moment.

## 2. The `unified_preconfigured` contract

A Match carries an explicit, persisted **setup mode**
(`MatchSetupMode`, `src/modules/match/domain/match.constants.ts`):

| Mode | Meaning |
| --- | --- |
| `legacy_sequential` | The pre-redesign journey. Deprecated; removed in Phase 5. |
| `unified_preconfigured` | Fully configured before gameplay. All twelve positions open. |

A `unified_preconfigured` Match guarantees, at the moment it exists:

- exactly **three** ordered World occurrences, indexed `0`, `1`, `2`;
- exactly **four** distinct Scope ids per occurrence — no fewer, no more;
- every World active and board-ready, every Scope active, in that occurrence's
  World, holding ready content, and with at least one usable board position;
- all **twelve** board positions initialised and available;
- `status = active`, `stage = board`;
- a settled coin toss and a stored first selecting team.

It never enters `coin_toss`, `world_selection`, `scope_selection`, or
`world_complete`. Those commands are refused with
`MATCH_COMMAND_NOT_AVAILABLE_IN_SETUP_MODE`, not silently ignored.

The coin toss is **server-owned in both modes** and is resolved by one rule
(`MatchUseCases.tossCoin`). A unified Match resolves it during creation and stores
the outcome so it can be shown; no client supplies or influences it, and no
command is required to settle it.

## 3. The exact 3 × 4 structure

```
1 Match (unified_preconfigured)
 └─ 3 World occurrences        ← configured before gameplay, repeats allowed
     ├─ exactly 4 selectedScopeIds   ← this occurrence's only content pool
     └─ exactly 4 board positions    ← the World's four configured mechanics

3 occurrences × 4 positions = 12 challenge positions
```

`MATCH_UNIFIED_BOARD_POSITION_COUNT` is derived from
`MATCH_WORLD_OCCURRENCE_COUNT × MATCH_SLOT_ORDER.length`, so the number twelve is
never written down as a literal.

## 4. Repetition policy

`MATCH_WORLD_REPETITION_POLICY` in
`src/modules/match/domain/unified-match-setup.policy.ts` is the single expression
of whether one World may appear at more than one position:

```ts
export const MATCH_WORLD_REPETITION_POLICY = { allowRepeatedWorlds: true };
```

Turning repetition off is a one-line change here plus its tests. Nothing else in
the codebase restates the rule — no controller, no validator, no aggregate — and
it is deliberately **not** exposed as an admin or World-level override.

Related rules, decided once in the same policy:

- repeated `worldId` across occurrences: **allowed** (while the flag is true);
- the same Scope pool at two occurrences of one World: **allowed**;
- the same Scope twice **inside** one occurrence: **forbidden**.

## 5. Occurrence identity

**A board position is `occurrenceIndex + slotKey`. Never `worldId + slotKey`.**

Because a World may be played twice, `worldId` does not identify anything. Two
occurrences of Anime have the same `worldId`, the same four slot keys, and are
eight completely separate positions with two separate Scope pools and two separate
score subtotals.

`MatchBoardPositionKey` (`domain/match-board-position-key.ts`) is the only place
the composite is built or parsed, and an architecture test fails if any other
module joins the two into a string itself. Its form is `"<occurrenceIndex>#<slotKey>"`,
e.g. `2#slot_3`.

Progress is stored per occurrence (`occurrences[i].slots[slotKey]`), and the
configuration of each position — the mechanic it holds — is stored separately in
`configuredBoardPositions`. `Match.unifiedBoard()` merges them. That split is
deliberate: progress and configuration are different facts, and neither is
duplicated.

## 6. Content pool isolation

Each board position draws content **only** from the `selectedScopeIds` of its own
occurrence. `MatchContentPool.assertPlayableItems` takes the occurrence's
`occurrenceIndex` and `worldId` alongside its pool and refuses an item that:

| Failure | Code |
| --- | --- |
| belongs to another World | `CONTENT_ITEM_OUTSIDE_OCCURRENCE_WORLD` |
| belongs to a Scope outside this occurrence's four | `CONTENT_ITEM_OUTSIDE_SCOPE_POOL` |
| is not ready | `CONTENT_ITEM_NOT_READY` |
| is incompatible with the position's mechanic | `CONTENT_ITEM_INCOMPATIBLE` |
| was already played by this occurrence | `CONTENT_ITEM_ALREADY_PLAYED` |
| repeats inside one launch | `CONTENT_ITEM_DUPLICATED` |

Two occurrences of one World therefore cannot reach each other's Scopes even
though they name the same World. This is asserted directly, in both directions,
in `match-content-pool.service.spec.ts` and in the API integration test.

## 7. Free selection across occurrences

For a unified Match, the team holding board selection may launch **any available
position of any occurrence, in any order**. `2/slot_3` first, then `0/slot_1`,
then `1/slot_4` is a legal sequence.

`currentOccurrenceIndex` is not consulted. A unified Match stores
`MATCH_NO_CURRENT_OCCURRENCE` (`-1`) in that field precisely so any code that
still reaches for it finds nothing rather than silently reading occurrence 0.
Architecture tests fail if a `unified-*` module mentions it at all.

Board selection alternates between the two teams, starting with the coin-toss
winner (`UnifiedMatchBoardPolicy.nextSelectingTeamId`). See §11 — this is the one
rule the product had not previously stated.

## 8. Completion

When a challenge completes, a unified Match:

- marks **only** `occurrenceIndex + slotKey` completed;
- clears `currentChallenge`;
- returns to `stage = board`;
- leaves the other eleven positions exactly as they were;
- hands selection to the other team;
- emits `challenge-completed` — never `world-completed`, never
  `advanced-to-next-world`.

For V1 **all twelve positions are required**. When every one is completed the
Match moves to `stage = match_complete`, `status = completed`. There is no
occurrence progression at any point.

## 9. Legacy compatibility

- A stored Match with **no** `setupMode` deserialises as `legacy_sequential`, and
  keeps playing the flow it was created for. Asserted against real Mongo in
  `match-persistence.integration-spec.ts`.
- The legacy endpoints still exist and still work. `POST .../match/create`,
  `/start`, `/coin-toss`, `/worlds/select`, `/scopes/select`, `/worlds/continue`
  are marked `@deprecated` in code and are removed in Phase 5.
- The new endpoint creates **only** `unified_preconfigured` Matches, and is
  mounted on the production `/match` path only — never under the
  `/match/development` alias.
- `challenges/launch`, `cancel`, and the snapshot `GET` are shared by both modes.
- The branches are explicit and temporary. There is no abstraction that funnels a
  unified command through a sequential concept, and there is no second Match
  engine: one aggregate, one repository, one reconciliation bridge, one snapshot
  projection.

**No new frontend may be built against the legacy stages.** Phase 2 and 3 consume
`snapshot.match.unified` only.

## 10. Snapshot contract

`snapshot.match.setupMode` is always present. For a unified Match,
`snapshot.match.unified` carries:

```
unified: {
  occurrences: [{ occurrenceIndex, worldId, selectedScopeIds[4],
                  selectedScopes[{scopeId,name}], completedAt?, subtotals[] }] × 3
  board: {
    positions: [{ positionKey, occurrenceIndex, worldId, slotKey,
                  challengeTypeId, challengeKey, challengeName,
                  launchability, status, runtimeId?, completedAt?,
                  scoreSummary? }] × 12
    totalPositionCount: 12
    completedPositionCount: number
  }
  selectingTeamId?: string
}
```

Alongside the existing `id`, `revision`, `status`, `stage`, `coinToss`,
`currentChallenge`, `scoring`, `result`, and `availableActions`.

The legacy-only sections (`board`, `currentOccurrence`, `scopeSelection`) are
**absent** for a unified Match rather than filled with a guess, and are unchanged
for a legacy Match. Nothing authoring-only or ContentItem-private is exposed: a
position names its mechanic and its Scope pool, never its content.

## 11. Persistence

Added to the `matches` collection:

| Field | Notes |
| --- | --- |
| `setupMode` | Indexed. Absent ⇒ `legacy_sequential`. |
| `configuredBoardPositions` | The twelve positions with their mechanic identity. |
| `selectingTeamId` | Unified only. |
| `currentOccurrenceIndex` | Existing field; `-1` for a unified Match. |

The board is **persisted, not re-derived**. The mechanic in each position is
captured at creation, so a World edited mid-match cannot change what is already on
the table, and a reload rebuilds exactly the board that was stored. No migration
is needed: the only new required-by-contract field defaults correctly for every
existing document.

Creation writes **once**. Every check — session, controller, teams, all three
occurrences, all twelve positions, the coin toss — happens before the first write,
so a rejected configuration leaves no Match at all. That is why no transaction is
involved: there is nothing partial to roll back. Asserted by counting documents
after each invalid request in the API integration test.

## 12. Planned removal of the sequential flow (Phase 5)

Everything to delete is marked `@deprecated` in code, and an architecture test
fails if a module speaks the sequential journey without that marker. The list:

- `MatchStage.LOBBY`, `COIN_TOSS`, `WORLD_SELECTION`, `SCOPE_SELECTION`,
  `WORLD_COMPLETE` and their presentation entries;
- `WorldSelectionMethod.TEAM_PICK`, `AGREED`, `RANDOM`;
- `Match.create`, `start`, `resolveCoinToss`, `nextSelectionTurn`, `selectWorld`,
  `selectScopes`, `advanceToNextWorld`, `assertLegacySetupAvailable`,
  `requireCurrentOccurrence`, `currentOccurrenceIndex`, and the
  `MATCH_NO_CURRENT_OCCURRENCE` sentinel with it;
- `MatchUseCases.create`, `start`, `resolveCoinToss`, `listSelectableWorlds`,
  `selectWorld`, `listSelectableScopes`, `selectScopes`, `advanceToNextWorld`;
- `MatchContentPool.assertSelectableScopes`;
- `MatchSnapshotComposer.boardSlots` and the legacy snapshot sections;
- `MatchTransitionNotifier.worldSelectionReason` and the five legacy reasons;
- the legacy routes on `MatchDevelopmentController`, and the
  `/match/development` path alias.

## 13. What Phase 2 and 3 consume

| Concern | Module |
| --- | --- |
| Create a Match | `POST /live-game-sessions/:sessionId/match/unified` |
| Request shape | `presentation/unified-match.dto.ts` |
| Snapshot shape | `live-game-sessions/application/live-session-match.projection.ts` (`LiveSessionUnifiedMatchProjection`) |
| Board position identity | `domain/match-board-position-key.ts` |
| Setup contract / repetition | `domain/unified-match-setup.policy.ts` |
| Board rules | `domain/unified-match-board.policy.ts` |
| Launch a position | `POST .../match/challenges/launch` with `occurrenceIndex`, `slotKey`, `contentItemIds`, optional `selectingTeamId` |

---

## 14. Phase 3 addendum — server-owned content and the functional board

Implemented 2026-08-06. The contract above is unchanged; this records what Phase 3
added on top of it.

### Server-owned content selection

The player never selects or submits a ContentItem id. `POST
.../match/unified/challenges/launch` accepts only `commandId`,
`expectedMatchRevision`, `occurrenceIndex`, `slotKey`, and an optional
`selectingTeamId`. `forbidNonWhitelisted` validation means a request that tries to
name content is rejected outright, and an architecture test fails if the DTO or the
controller ever grows such a field.

`MatchContentSelector` (`application/match-content-selection.service.ts`) draws the
content from the named occurrence alone: its World, its four Scopes, and the
mechanic configured in that position. The draw is spread across the occurrence's
Scopes one at a time, and is seeded by `matchId + positionKey` — so a retried
launch draws exactly the set the first attempt drew, and two positions of the same
Match draw independently.

### Required item counts and phone requirement

Both come from the launcher, which is the only source of truth:

```ts
readonly launchRequirements: {
  contentItemCount: number;
  requiresPhones: boolean;
  isPlayableItem?(item: MatchSelectableContentItem): boolean;
}
```

| Mechanic | Items | requiresPhones | Why |
| --- | --- | --- | --- |
| `read-your-opponent` | 3 | true | Needs a private answer from one team and a private steal/trust decision from the other before it resolves. |
| `distributed-information` | 3 | true | Each puzzle is split across 2–3 connected phones per team; startup refuses a team outside that range. |
| `top-10` | 1 | true | `assign-card` is authorised `active-team-player`; the controller can only reveal and time out. |

**Every currently implemented mechanic requires phones.** There is no non-phone
example to show, and none was invented.

`isPlayableItem` carries the mechanic's own payload contract (machine-checkable
answer modes for RYO; variant plus author safety confirmation for
`distributed-information`; the poison-deck variant for `top-10`), so the draw can
never hand a runtime an item it would refuse.

### Insufficient content

`MATCH_INSUFFICIENT_PLAYABLE_CONTENT` is raised before anything is created: no
runtime, no content binding, no Match mutation, and the position stays available.

### Board projection additions

Per position: `worldName`, `description`, `instructions`, `requiresPhones`, and
`unavailableReason` (`launcher_not_implemented` | `invalid_configuration`). Plus
`standings` on the Match projection — both teams with names and totals.

`worldName` is captured at configuration time, for the same reason the mechanic is:
a World renamed mid-match must not change what a Match says it is playing. World
*imagery* is deliberately **not** duplicated into the Match snapshot; the board
reads it from the public World projection it already consumes, which stays the one
source of truth for World presentation.

`unavailableReason` covers the reasons that are knowable statically. Exhausted
content is not one of them: computing it for all twelve positions on every snapshot
read would mean twelve extra aggregate queries per read, so it surfaces as a precise
typed error at launch time instead.

---

## 15. Phase 4 addendum — challenge preflight and phone pairing

Implemented 2026-08-06.

### The defect this closed

Phase 3's launch started the runtime the moment a tile was clicked. Every
implemented mechanic needs phones, so a launch would frequently start a runtime and
*then* fail inside it — ركّبها refuses a team without two or three connected
players. Selecting a tile now **prepares** the position instead.

### Mid-match joining

Phones join a unified Match at a challenge preflight, long after the session went
`active`. Three places refused that, and now ask one rule instead:

```ts
LiveGameSession.joinableStatuses(modeKey)
// bomb → ['waiting']; everything else → ['waiting', 'ready', 'active']
```

`enrollParticipant`, `CreateSessionJoinAccess`, and `ResolveJoinCode` all defer to
it. Bomb mode is unchanged — it hands out private roles at the start and cannot
absorb a latecomer.

### Prepare / launch / cancel

| Route | Effect |
| --- | --- |
| `POST .../match/unified/challenges/prepare` | Holds the position, reuses the session's join code, moves to `stage = preflight`. **Starts nothing.** |
| `POST .../match/unified/challenges/launch` | Re-checks readiness server-side, draws content, starts exactly one runtime, clears the preflight. |
| `POST .../match/unified/challenges/cancel` | Returns to the board. Consumes nothing, changes no turn, keeps the phones paired. |

All three name a position only. Neither accepts a ContentItem id.

`MatchStage.PREFLIGHT` is the single canonical marker, and it is what enforces
"one pending challenge per Match": prepare only runs from `board`. The board
position itself stays `available` throughout, so cancelling needs no rollback.

### Content selection timing — decided

**Content is drawn at launch, after readiness passes.** A cancelled or never-launched
preflight therefore reserves nothing and releases nothing. The draw stays
deterministic in `matchId + positionKey`, so a retried launch draws the identical
set. `pendingChallenge` holds no ContentItem ids.

### Readiness descriptors, from the launcher

| Mechanic | min/team | max/team | Derived from |
| --- | --- | --- | --- |
| `distributed-information` | 2 | 3 | `StartDistributedInformation.eligibleTeams` refuses anything else |
| `read-your-opponent` | 1 | — | `connected-player` submissions; resolves on one answer + one decision |
| `top-10` | 1 | — | `assign-card` is `active-team-player`; the controller can only reveal/time out |

All three additionally require both teams, team assignment, and connected presence.
`MatchChallengeReadinessService` is the only thing that counts: a controller is never
a player, a removed participant is not in the room, and a joined-but-disconnected
phone does not count. The same service runs at launch, so the button and the server
cannot disagree.

### Persistent pairing

Participants belong to the session, not to a challenge. They are never removed
between challenges, the join code is reused rather than rotated, and a phone that
rejoins with the same `joinRequestId` gets the same participant back. A second
phone-required challenge therefore reports `readyToLaunch: true` immediately, and the
preflight collapses its QR to **إضافة لاعب أو إدارة اللاعبين**.

### Join URL

The snapshot exposes `joinCode` and a relative `joinPath`; the client composes the
absolute URL with its own origin for the QR. No server-side public base URL was
introduced, and no controller token or credential appears in the preflight.
