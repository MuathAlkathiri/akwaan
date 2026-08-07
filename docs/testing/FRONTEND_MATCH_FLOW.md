# Frontend Match flow — manual playtest

This is a development-only playtest for the snapshot-driven Match UI. It does
not replace backend validation or production content rotation.

> ## ⛔ This journey is the legacy sequential flow
>
> Everything below drives a `legacy_sequential` Match: coin toss, then World
> selection, then Scope selection per occurrence, then one World's board at a
> time. **It is deprecated and Phase 5 deletes it. Do not use it to exercise a new
> Match, and do not build any new UI against the stages it walks through.**
>
> A new Match is created in one step, fully configured, through the production
> route:
>
> ```
> POST /live-game-sessions/<SESSION_ID>/match/unified
> { "occurrences": [
>     { "occurrenceIndex": 0, "worldId": "...", "selectedScopeIds": ["...","...","...","..."] },
>     { "occurrenceIndex": 1, "worldId": "...", "selectedScopeIds": ["...","...","...","..."] },
>     { "occurrenceIndex": 2, "worldId": "...", "selectedScopeIds": ["...","...","...","..."] } ] }
> ```
>
> It returns a Match already at `stage = board` with twelve playable positions
> under `snapshot.match.unified.board.positions`, and it sends no
> `world_selection` or `scope_selection` command at all. Launch any position with
> `POST .../match/unified/challenges/launch`, naming only its `occurrenceIndex` and
> `slotKey` — in any order, across any occurrence. That route accepts no
> ContentItem id; the server draws the content.
>
> **Phase 2 shipped the setup journey**, so a new Match is created from the UI at
> `http://localhost:3001/games/new/setup`:
>
> 1. Home → **ابدأ لعبة جديدة**.
> 2. Pick the World for العالم الأول, then exactly four Scopes (a fifth is
>    refused until one is released), then **متابعة**.
> 3. Repeat for العالم الثاني and العالم الثالث. Re-pick an earlier World on
>    purpose to confirm repeats are accepted and keep their own four Scopes.
> 4. On **مراجعة المباراة** confirm three separate occurrence cards, 12 Scopes,
>    and no QR or session code anywhere.
> 5. Name the two teams, press **ابدأ المباراة**. Exactly one session and one
>    Match are created and the browser lands on `/matches/<sessionId>` showing all
>    twelve board positions.
>
> Before step 5 the server is untouched: no session, no Match, no QR, no
> participants. Verify by watching the backend log or counting
> `livegamesessions` while stepping through the wizard.
>
> The board at `/matches/<sessionId>` shows all three occurrences and their twelve
> challenges at once, and the host chooses any available one — from any occurrence,
> in any order. Choosing a tile opens its **preflight**: no runtime starts yet.
>
> 6. Pick any tile. The preflight names the challenge, its Scope pool, the player
>    requirement, and shows a QR plus a short join code.
> 7. Open the join URL on phones — two or three per team for ركّبها, one per team
>    for RYO or Top 10. Each team's counter fills in; **ابدأ التحدي** stays disabled
>    until both teams are ready.
> 8. Press it. The server re-checks readiness, draws the content itself, and starts
>    exactly one runtime. The host never picks ContentItems.
> 9. Finish the challenge. Reconciliation returns every client to the board with
>    that one position completed and the turn alternated.
> 10. Pick a second tile. The phones are still paired, so it is ready immediately
>     and the QR collapses to **إضافة لاعب أو إدارة اللاعبين** — nobody rescans.
>
> **رجوع إلى اللوحة** at any point during preflight cancels it: nothing is consumed,
> the turn does not change, and the phones stay paired. A refresh during preflight
> restores the same preflight.
>
> See `docs/UNIFIED_MATCH_PHASE_1_ARCHITECTURE.md` (including its Phase 3 and Phase 4
> addenda) for the contract.
>
> The steps below remain valid **only** for verifying that already-stored legacy
> Matches still play.

## Routes

- Controller: `http://localhost:3001/admin/live-sessions/<SESSION_ID>`
- Shared screen: `http://localhost:3001/live-sessions/<SESSION_ID>/screen`
- Participant phone: `http://localhost:3001/join/live-session/<JOIN_CODE>`

The controller and shared-screen browser must have a valid admin login. Phones
authenticate with the participant credential issued by the join route.

## Local-data prerequisite (last inspected 2026-08-04)

The current Docker database cannot run a complete Match:

- `كرة قدم` is active, but has only two enabled board configurations rather
  than the structurally required four.
- Its configured RYO-looking mechanic uses a generated slug, not the canonical
  `read-your-opponent` launcher key, and has only one ready compatible item.
- Its `top-5` Signature slot has zero ready compatible ContentItems.
- `انمي` is active but has no enabled board configurations.
- There is no canonical `read-your-opponent` ChallengeType record.

Consequently, that database snapshot returned no playable World. This is a data
prerequisite, not a Match-runtime limitation. Run the generic-board,
distributed-information, and relevant content migrations, then repair/activate
the authored World records before attempting this playtest. Recheck the catalog
instead of assuming the 2026-08-04 snapshot still describes the current database.

The Match runtime currently has launchers for:

1. Signature: Top 10 Poison Deck — one ready compatible ContentItem.
2. RYO 1: Read Your Opponent — three distinct ready compatible ContentItems.
3. RYO 2: Read Your Opponent — another three distinct ready compatible
   ContentItems (reuse only if backend content policy permits it).
4. Flex: ركّبها (`distributed-information`) — three distinct ready compatible
   ContentItems, with two or three connected players on each team.

A World whose four configured slots all resolve to those registered launchers can
now reach `world_complete`, and three completed occurrences can reach
`match_complete`. Any other configured mechanic remains honestly
`configured_but_unimplemented`; it must not be marked complete or skipped.

## Full legacy playtest once compatible development data exists

Deprecated — see the notice at the top of this file. These steps drive the
sequential flow and must not be used to exercise a new Match.

1. Run `docker compose up -d --build` from the repository root.
2. Log in as an admin and create or open a live session with exactly two active
   teams.
3. Create join access and open the join URL on two or three phone browsers per
   team. ركّبها deliberately refuses teams outside that connected-player range.
4. Join both phones, assign teams if needed, mark players ready, and start the
   live session using the existing session controls.
5. Open the controller route. Use **إنشاء المباراة**, then **ابدأ رمية
   الاختيار**.
6. Open the shared-screen route in a separate browser/window. Confirm it has no
   Match commands or development content controls.
7. Resolve the coin toss from the controller. Confirm all clients show the
   stored winner and the winner's phone says **أنتم تختارون أولًا**.
8. Select the first World for the toss winner and the second for the other team.
   Re-select the first World to prove repeated Worlds are accepted.
9. For the third occurrence, choose an agreed World or ask the server to choose
   randomly. Confirm the ordered three-occurrence list on every view.
10. On the board, verify completed, available, in-progress, `قريبًا`, and
    unavailable states come from the snapshot. Only the controller should see
    **أدوات التطوير**.
11. Launch RYO from its controller dialog with exactly three distinct ready
    ContentItem IDs. Optionally select the starting team.
12. On the answering team's phone, submit the multiple-choice or closest-number
    answer. On the opposing phone, choose trust or steal. Repeat for all three
    items.
13. Confirm terminal reconciliation removes the gameplay runtime and every
    client returns automatically to the Match board. Refresh one client before
    and after the return to verify restoration.
14. Launch Top 10 Poison Deck with exactly one ready poison-deck ContentItem ID.
15. Complete all 14 KEEP/POISON decisions from the authorized phone(s), allow at
    least one six-second timeout to verify the server KEEP default, then reveal
    positions 10 through 1 and the four decoys.
16. Confirm terminal reconciliation returns automatically to the board and the
    Match score display adopts the backend-provided displayed totals.
17. Launch ركّبها with three distinct ready compatible ContentItem IDs. Confirm
    each phone receives only its own segment(s) and current answer responsibility,
    while the shared screen shows only team progress. Submit a wrong answer to
    verify the five-second team-only lock, then finish the three-puzzle race (or
    allow its deadline to resolve it). Confirm its signed score event reconciles
    once and every client returns to the board.
18. Complete every scheduled slot backed by a registered launcher. Continue
    through each `world_complete` screen and all three World occurrences to
    `match_complete`.
19. At lobby, selection, board, challenge, World complete, and final result,
    refresh or disconnect/reconnect one shared screen and one phone. Confirm the
    newest authoritative stage is restored without a local transition or score
    change.
