# Akwaan — Game System Roadmap

> **This document is the authoritative source of truth for the Akwaan game system.**
> It carries both the product/architecture design (§0–§15, largely unchanged since the original build) and the
> current implementation status (status legend, baseline, current state and the Master Checklist below, plus §16–§20). Where a design section has been overtaken by a
> later decision it is marked `SUPERSEDED` in place rather than deleted, so the reasoning survives.
>
> The name is settled: **Akwaan**. The earlier candidate list (Kawn, Shalla, Falak) is closed. Internal code
> identifiers remain neutral and are *not* brand-named — that rule from §13 still stands.

**Companion document:** [`docs/WORLD_CONTENT_EXPANSION_PLAN.md`](docs/WORLD_CONTENT_EXPANSION_PLAN.md) is the
authoritative record for the **shared content catalog** — target Worlds/Scopes, wave audits, duplicate
remediation, and the Final Catalog Audit. This roadmap references it; it does not duplicate it.

---

## Status legend

Used consistently throughout this document. **A design decision being approved is not implementation.**

| Marker | Meaning |
|---|---|
| ✅ **IMPLEMENTED & VERIFIED** | Exists in code/runtime **and** has been validated by tests or audit |
| 🚧 **IN PROGRESS** | Implementation genuinely exists and is actively incomplete |
| 🟡 **DESIGN APPROVED — NOT IMPLEMENTED** | Product decision made; implementation not started or incomplete |
| ⬜ **NOT STARTED** | No meaningful implementation, or no decision yet |
| ⚠️ **KNOWN DEBT / FOLLOW-UP** | Non-blocking technical or product work that remains |

---

## Baseline reference

Recovery points for future sessions. Both are on `origin/main`.

| Baseline | Commit | Subject |
|---|---|---|
| **Shared Content Catalog** *(current)* | `302bc37` | `feat(content): establish Akwaan shared-content catalog baseline` |
| Deployment / performance | `4f33704` | `perf: optimize live game runtime and realtime synchronization` |
| Lifecycle / anti-freeze | `0961082` | `game lifecycle fixed` |

Performance acceptance state at `4f33704`: **READY TO DEPLOY WITH KNOWN NON-BLOCKING DEBT**.

---

## Current state — verified against the repository

Everything in this section was confirmed by reading code and querying the runtime database read-only on
2026-08-18. Nothing here is asserted from memory.

### Mechanics implemented in the runtime

Seven gameplay plugins are registered; six have Match-side challenge launchers.

| Mechanic | Runtime key | Plugin | Launcher | ChallengeType in catalog |
|---|---|---|---|---|
| Read Your Opponent / اقرأ خصمك | `read-your-opponent` | ✅ | ✅ | ✅ `active` |
| Closest / مين أقرب | `closest` | ✅ | ✅ | ✅ `active` |
| One Clue / بدليل واحد | `one-clue` | ✅ | ✅ | ✅ `active` |
| Top 5 / أفضل 5 | `top-5` (keep-or-give) | ✅ | ✅ | ✅ `active` |
| Distributed Information / ركّبها | `distributed-information` | ✅ | ✅ | ✅ `active` |
| **Bomb / القنبلة** | `bomb` | ✅ | ✅ | ⬜ **no ChallengeType, no catalog content** |
| Core round runtime | `core-round-runtime` | ✅ | — | *(infrastructure)* |

**The Bomb row is the single most important fact in this table.** Bomb is a fully implemented *gameplay*
mechanic, but it has no ChallengeType registered and no authored content in the catalog. The decision to make
it a Shared Core mechanic (§16.1) is therefore design-only.

### Runtime catalog inventory

| Measure | Verified value |
|---|---|
| Worlds — `active` | **4** — كرة قدم · انمي · فيديو قيمز · عالم الالغاز |
| Worlds — `draft` | **8** — مسلسلات · الأفلام · الأغاني · السعودية · العالم · السيارات · الرياضة · معلومات عامة |
| Scopes | **49** |
| Ready content items | **1954** |
| Scopes meeting ≥9 ready on **all three** shared mechanics | **49 / 49** |
| Board configurations | **20** — 5 Worlds × 4 slots (4 active + مسلسلات draft) |
| Draft Worlds with **no** board configuration | **7** |

Per-mechanic ready content: `closest` 557 · `one-clue` 549 · `read-your-opponent` 546 ·
`distributed-information` 213 · `top-5` 53. Two archived legacy mechanics retain 36 residual items
(⚠️ see §19 item 9).

### Authoring-side assets preserved

| Asset | Location | Verified |
|---|---|---|
| Music media intents | `ai/.opencode/media-intents/music/` | **36** — 9 each for Saudi / Gulf / Arabic / International |
| Push tooling | `ai/scripts/push_gap_packs_2026_08_13.py` | Fingerprinting, `--skip-existing`, `--dry-run`, `DEFAULT_PACKS = []` |
| Canonical authoring structures | `ai/.opencode/skills/` | `WORLD.md` / `SCOPE.md` / `KNOWLEDGE.md`, manifest, validators |

The media intents are **not** in the runtime database. They are the tracked input for future media enrichment
and must not be deleted.

---

## Akwaan Master Checklist

The day-to-day view. Detail lives in the referenced sections; this stays short enough to be useful.

### A. Core runtime / lifecycle — ✅ COMPLETE

- [x] Server-authoritative deadline ownership — one owner, state-derived arming, stale-timer identity guards
- [x] Presence isolated from gameplay aggregate state; reconnect and multi-socket safe
- [x] Mechanics own mechanic completion; Match owns global Match completion
- [x] Durable Runtime → Match convergence (`Match.currentChallenge` as the obligation; one applier)
- [x] Authoritative challenge Abort / Back-to-Board; cancelled runtime is terminal and non-blocking
- [x] No score or result awarded on abort; aborted slot returns to available
- [x] Partial-launch compensation and orphan-runtime recovery
- [x] Abort race safety (vs answer / timeout / skip / natural completion) under revision CAS
- [x] Restart recovery for interrupted convergence
- [x] Lifecycle regression coverage — 11 real-Mongo lifecycle suites green

### B. Performance — ✅ COMPLETE *(baseline `4f33704`)*

- [x] **Batch A** — lightweight command ack; frontend clock isolated from the session context
- [x] **Batch B** — deadline synchronization reuses committed state (3 DB ops → 0; Bomb 3 → 2)
- [x] **Batch C** — snapshot skips reconciliation when state proves nothing pending (3 ops → 1)
- [x] **Batch D** — realtime revision dedupe and stale-response protection; participant-private projections
      deliberately **retained** rather than unsafely globalized
- [x] **Batch E** — convergence sweeper bounded by runtime lifecycle status (~925 KB / 78 trips → ~3 KB / 1)

### C. Shared content catalog — ✅ COMPLETE *(baseline `302bc37`)*

- [x] Waves 1–5 authored and accepted
- [x] Final Catalog Audit ✅
- [x] Duplicate remediation — historical inflation cleaned, final target duplicate scan = 0
- [x] Shared-mechanic catalog QA ✅ — RYO, One Clue and Closest all PASS
- [x] Structural RYO defects corrected; minimum RYO gap replacements authored
- [x] Answer-leakage corrected; contamination = 0
- [x] Architecture audit PASS
- [x] Repository cleanup — generated wave packs and one-off scripts removed; music media intents preserved
- [x] Push tooling hardened — fingerprinting, `--skip-existing`, `--dry-run`, `DEFAULT_PACKS` cleared
- [x] Content baseline committed and pushed to `origin/main`

### D. Shared mechanic migration — ⬜ NOT STARTED

New product decision (§16.1): the Shared Core becomes **RYO + Closest + Bomb**. One Clue leaves the Shared Core.

- [ ] Register a `bomb` ChallengeType and define the Bomb content contract
- [ ] Author and validate Bomb coverage across the target Worlds/Scopes
- [ ] Reconcile board/slot configuration for the new Shared Core
- [ ] Verify every target World against the new Shared Core
- [ ] Re-point One Clue to its new owner (Movies Signature — §16.2)

### E. Signature mechanics — product design

- [x] Football / كرة القدم → **Top 5** *(mechanic implemented)*
- [x] Puzzles / عالم الالغاز → **Distributed Information / ركّبها** *(mechanic implemented)*
- [x] Movies / الأفلام → **One Clue / بدليل واحد** *(design approved)*
- [x] Music / الأغاني → **من أول نغمة** *(design approved)*
- [x] World / العالم → **على الخريطة** *(design approved)*
- [x] Series / المسلسلات → **وش صار بعدها؟** *(design approved)*
- [x] Video Games / فيديو قيمز → **المرحلة** *(design + external prototype approved — §17)*
- [ ] Anime / الأنمي → **undecided**
- [ ] Saudi Arabia / السعودية → **undecided**
- [ ] Cars / السيارات → **undecided**
- [ ] Sports / الرياضة → **undecided**

### F. Signature mechanics — implementation

Design approval above does **not** imply any of these. Full matrix in §16.

- [ ] Movies → One Clue as the Movies Signature (re-ownership + Movies-specific form)
- [ ] Music → من أول نغمة *(depends on audio enrichment — checklist H)*
- [ ] World → على الخريطة *(map interaction; no map primitive exists yet)*
- [ ] Series → وش صار بعدها؟ *(sequential/ordering mechanic)*
- [ ] Video Games → المرحلة *(production implementation not started)*
- [ ] Football → Top 5 World-specific rollout reconciled
- [ ] Puzzles → ركّبها World-specific rollout reconciled

### G. Taxonomy / catalog changes — 🟡 APPROVED DIRECTION, NOT IMPLEMENTED

- [ ] General Knowledge / معلومات عامة consolidated into عالم الالغاز as a Scope (§18.3)
- [ ] Arabic Movies scopes/content added under the existing Movies World (§18.2)
- [ ] Arabic Series scopes/content added under the existing Series World (§18.2)

### H. Media — ⬜ NOT STARTED

- [ ] Music audio enrichment from the 36 canonical intents (Wigolo-backed discovery → snippets)
- [ ] Cars visual enrichment
- [ ] Banners / logos / imagery backlog across Worlds

### I. Board configuration — 🚧 PARTIAL

- [x] 4 active Worlds configured (4 slots each)
- [x] مسلسلات configured while still draft
- [ ] Remaining 7 draft Worlds: الأفلام · الأغاني · السعودية · العالم · السيارات · الرياضة · معلومات عامة
- [ ] Re-reconcile every board after the Shared Core migration (phase D) lands

### J. Activation — 🚧 PARTIAL

- [x] Active: كرة قدم · انمي · فيديو قيمز · عالم الالغاز
- [ ] Promote the 8 draft Worlds once Signature + board configuration + content gates are met
- [ ] Enforce the §4.2 launch gate: no World ships without a defined Signature mechanic

### K. Final QA / release — ⬜ NOT STARTED

- [ ] Full runtime QA against a build that actually contains the current baseline
- [ ] Deployment smoke test on a rebuilt stack *(see §19 item 10 — the last attempt could not run)*
- [ ] Multiplayer playtesting
- [ ] Balance validation (pacing, scoring, المرحلة special-tile distribution)
- [ ] Deployment / release acceptance

---

## 0. Engineering Governance (read before writing any code)

Non-negotiable, and applies to every commit — not just the initial build. This project has already been through one architecture (the legacy question-based system) and is now on its second. The highest risk to the codebase is not missing features; it is accumulated duplication from the transition.

### 0.1 Architecture-first rule

**Before writing any new code, type, component, or utility, verify it does not already exist architecturally.**

Required check, in order:
1. Does a type/interface already model this concept under a different name? (Do not add `QuestionPayload` if `ContentItem` covers it.)
2. Does an existing component already handle this presentation with different props? (Do not add `RYOTimer` if `ChallengeTimer` accepts a duration.)
3. Does an existing utility already do this transformation? (Never a second Arabic string normalizer.)
4. Is this a genuinely new **mechanic** (needs code) or a new **configuration** of an existing mechanic (needs data only)? See §5.4 — the single most important distinction in this codebase.

If 1–3 is yes, extend the existing abstraction. Do not create a parallel one. Two components that render a challenge, two ways to score, or two socket message shapes for the same event are the failure mode this rule exists to prevent.

### 0.2 Delete-on-replace rule

**Any legacy code, type, field, table, component, or asset no longer in use must be deleted in the same PR that replaces it** — not commented out, not kept "just in case".

Specifically and urgently, from the legacy system:
- Host-judgment code paths (approve/reject controls, judge state, host role)
- The 200/400/600 point-tier system
- Flat category models predating World → Scope
- Any 4-of-6 rotation, draft, or pick/ban logic (**cancelled — see §7**)
- Any open-answer free-text judging path (all answers are machine-checkable now — §6.5)

Dead code is unusually dangerous here because the new system deliberately reuses old vocabulary (challenge, item, score). Leave both alive and someone will wire the wrong one.

### 0.3 Single source of truth

One scoring module. One socket event registry. One challenge state machine. One Arabic normalization utility. If a second appears in a PR, the PR is wrong.

---

## 1. Product Vision

A web-based party game for groups of friends, played in-session (one shared screen plus each player's phone as a private input channel), built around **Worlds** rather than flat trivia categories.

The differentiating bet: **remove the traditional "ask a question, host judges the answer" loop entirely.** That loop is what every Arabic competitor is built on, and it is why the genre feels exhausted — the most knowledgeable player dominates every exchange, everyone else spectates, and one person stops playing in order to referee.

Four independent answer systems replace it, each targeting a different social dynamic:

| System | Social dynamic it rewards | What it replaces |
|---|---|---|
| **Read Your Opponent (RYO)** | Reading your rival's honesty vs. bluff | The traditional trivia question — entirely |
| **Signature mechanic** | World identity and spectacle | Nothing — new, one per World |
| **Co-op (split information)** | Communication under partial information | Nothing — new |
| **Relational** | Knowing your own teammate | Nothing — new |

No host judgment exists anywhere in the default flow. Every answer type resolves automatically on the server.

---

## 2. Core Terminology

| Term | Definition |
|---|---|
| **World** | Top-level theme (Football, Anime, Video Games, General Knowledge; future: Series, Movies, Music). Owns exactly one exclusive Signature mechanic, plus a sound pack, timer profile, and tone profile. |
| **Scope** | Sub-topic inside a World (e.g. within General Knowledge: General Trivia, Religious Knowledge, Countries & Capitals). A content-tagging dimension only — never changes mechanics. |
| **Challenge Type** | One mechanic from a family (Signature / RYO / Co-op / Relational). Defines how items are presented and scored. |
| **Content Item** | The question/prompt/media, tagged to one Scope, playable through any compatible Challenge Type. |
| **Board** | The 4 Challenge Types of a World for a match. **System-determined — no player selection.** See §7. |
| **Match** | One session: team setup → 3 World selections → 12 challenges → result card. |

---

## 3. Match Structure

```
1 Match
 └─ 3 Worlds (player-selected — the only pre-match choice)
     └─ 4 Challenge Types per World   ← system-determined, no draft
         └─ 3 Content Items per Challenge Type

Total: 3 × 4 × 3 = 36 items per match
Total: 3 × 4 = 12 challenges per match
```

### 3.1 Per-World board composition

> **⚠️ PARTIALLY SUPERSEDED — reconcile before the Shared Core migration.**
> The table below is the *original* composition design. What actually shipped is **4 configured slots per
> World** (verified: 20 configurations across 5 Worlds), and the catalog was authored against **three shared
> mechanics** — RYO, One Clue, Closest — rather than the RYO×2 + Flex split described here. The
> Co-op/Relational families were never built as separate slot families.
>
> The Shared Core is now changing again (§16.1: One Clue → Bomb). **Board composition must be re-decided as
> part of that migration**, at which point this table should be rewritten to match reality rather than intent.

| Slots | Family | Notes |
|---|---|---|
| 1 | **Signature (exclusive)** | Unique to this World, never in any other. Always played. See §4 and §16. |
| 2 | **RYO** | The backbone. Two slots, not one — see rationale below. |
| 1 | **Flex: Co-op or Relational** | Authored per World, not randomized. |

**Why RYO gets two slots:** RYO is the full replacement for traditional trivia — the spine of the game. At one slot per World it would be 9 of 36 items (25%) of a match. At two, it is 18 of 36 (50%), which matches its role. The flex slot then carries rhythm-breaking rather than load-bearing duty, which is what Co-op and Relational are for.

**Hard constraint:** every match must contain **at least one Relational challenge** across its three Worlds. Relational content is the only family immune to depletion and the only one that generates shareable moments (§6.4, §12). A match with zero Relational challenges is a misconfiguration.

**Alternative composition (documented, not chosen):** one slot per family (Signature + RYO + Co-op + Relational). Balanced and simpler to reason about, but caps RYO at 25% and makes every World's family composition identical. Switching to it is a one-line change here.

### 3.2 Signature item structure

A Signature mechanic occupies a 4-slot position but **may define its own internal item structure** rather than literally holding 3 discrete items — a ranking list or a rapid-fire chain is one continuous unit. It still counts as filling its slot's 3-item budget for pacing and scoring purposes. The data model must allow this (`itemStructure`, §13).

### 3.3 Why 3 items per challenge, not 2

**Every mechanic carries a fixed learning cost.** A team needs roughly one full item to understand a mechanic and one more to play it well.

- At 2 items: item one is learning, item two is playing. **50% of the challenge is consumed by comprehension.**
- At 3 items: item one is learning, items two and three are real play — with room for tactics to develop.

RYO benefits most. A steal decision on item three is genuinely smarter than on item one, because the team has built a read on their opponent. Two items never allow that read to form.

Secondary benefit: 12 transitions instead of 18, which is cleaner pacing.

### 3.4 Pacing

| Family | Per-item budget |
|---|---|
| RYO | ~25s (10s blind window + reveal) |
| Relational | ~25s |
| **Co-op** | **45s — reduced from 60s, see below** |
| Signature | Mechanic-defined |

**Co-op timer reduced to 45s deliberately.** At 60s × 3 items, Co-op becomes 3 continuous minutes in a single format — the longest single-format stretch in the match and the first place fatigue will appear. 45s is sufficient once the team has learned the mechanic from item one.

**Challenge intro: 5–8 seconds maximum.** Not 10–15.

**Estimated duration: ~40–45 minutes** including natural discussion and laughter. This sits inside the target band. Validate with live playtests rather than assuming.

> **Correction to an earlier estimate:** a 6×2 structure is *not* faster than 4×3 — both hold 36 items, and 6×2 is marginally slower due to six extra transitions. The real duration gain versus the legacy system comes from **RYO itself** (a ~25s exchange replacing a ~60s host-judged question), and applies to any distribution. Do not use item distribution as a duration lever.

### 3.5 Known risk: structural repetition

Because the board is fixed and system-determined, **every match within the same World is structurally identical.** This is accepted deliberately in exchange for pacing, zero wasted authored content, and a far lighter UX (§7.1).

Variety must therefore come from two levers, both mandatory:
1. **Content rotation** — the 3 items per challenge draw from a pool large enough that repeats are rare, and must not repeat across consecutive sessions for the same group. **Exception: the Relational family is exempt** (§6.4).
2. **Order variation** — the presentation sequence of the 4 challenges varies per match, so rhythm differs even when the set does not.

If playtests surface repetition fatigue, the intended response is the flexibility system (§15.2), not a return to random removal (§7.1).

---

## 4. Signature Mechanics — Requirements *(assignment now in §16)*

> **SUPERSEDED IN PART.** When this section was written no Signature mechanic had been assigned. **Assignments
> now exist for 7 of 11 Worlds** — see the authoritative matrix in **§16**. The *requirements* below (§4.1) and
> the *launch gate* (§4.2) remain fully in force and are still the acceptance criteria for any new Signature.

**Every World must own exactly one exclusive mechanic that appears in no other World.** It is the World's mechanical and visual fingerprint, always played, never substituted — it is the reason the player chose that World.

~~**The specific mechanic assigned to each World is not fixed in this document and is expected to change.** Candidates have been explored (list-ranking, live drawing, buzzer-race, rapid-fire chain) but none are committed. Do not implement any until assignment is decided.~~

**Resolved.** Assignments are recorded in **§16**. Two mechanics are implemented (Top 5, Distributed
Information), five are design-approved and unimplemented, and four Worlds remain undecided.

### 4.1 Requirements

1. **Exclusive** — not reused in any other World, now or later.
2. **Self-evident identity** — passes the §9 guardrail.
3. **Auto-resolvable** — scores without host judgment.
4. **Fits the slot budget** — completes within a 3-item pacing envelope (§3.4).
5. **Declares its own scoring** explicitly in the scoring registry (§8), since it will not follow the standard per-item pattern.

### 4.2 Launch gate

**No World ships without a defined Signature mechanic.** A World with only shared mechanics is a content category wearing a World's name — the exact anti-pattern this architecture exists to prevent (§9).

---

## 5. Architecture: World → Scope → Challenge Type → Content Item

The four-layer model is unchanged. What this revision changed is **what a Challenge Type is allowed to be**.

```
World (Football)
 ├─ signatureMechanicId: <TBD — not yet assigned>
 ├─ soundPack, timerProfile, toneProfile
 └─ Scopes: [Players, Tournaments, Transfers, Tactics]
      └─ Content Items tagged per Scope, consumed by whichever
         Challenge Types are compatible with that Scope
```

### 5.1 Content items are not owned by mechanics

A Content Item belongs to a **Scope**, not a Challenge Type. The same underlying fact can play as an RYO prompt, a Co-op split clue, or a Relational prompt. The data is reused; the experience differs. This is what keeps content production cost sane.

### 5.2 Scope-level exclusions

Not every Scope is compatible with every mechanic. A Religious Knowledge Scope must be excluded from Relational mechanics (built on teasing) and from split-clue mechanics (fragmenting religious text is inappropriate).

```
Scope.excludedChallengeTypes: ChallengeTypeId[]
```

Readiness calculation must respect this. A player selecting only a narrow Scope may fall below 4 valid challenges — **test this edge case early; it is the first thing that will break.**

### 5.3 World-level presentation differentiation (mandatory)

Shared mechanics are the same code but must not *feel* shared. Every shared mechanic must differ between any two Worlds in at least **two** of:

`inputType` · `timerSeconds` · `mediaType` · `soundPack` · `revealStyle`

Additionally, each shared mechanic **must be renamed per World.** The player should never see the same challenge name in two Worlds. Same code, different name, different visual frame, different input — this is where nearly all perceived World difference comes from, at almost zero engineering cost. See §15.1 for why this substitutes for full mechanical differentiation.

A shallow reskin (same name, different accent color) fools no one. The rename and revisual must be genuine.

### 5.4 The mechanic vs. configuration rule

> **New content identity = data. New mechanic = code.**

Classify before building. A reskin, timing change, media change, or prompt change of something existing is **configuration** and ships as data. Only genuinely novel interaction models get new code. This rule is what allows a 5th, 6th, and 7th World to launch for the cost of one exclusive mechanic each instead of four.

---

## 6. Answer Systems

### 6.1 Read Your Opponent (RYO) — the replacement for all traditional trivia

RYO is not a layer wrapped around questions. **It is the format that replaces them.** Wherever the legacy system had a host-judged trivia question, this system has an RYO exchange.

**Flow:**
1. A knowledge prompt appears on the shared screen as multiple-choice (2–4 options) or numeric-estimate. **Never open free text** — this is what makes host-free judging possible.
2. A ~10-second simultaneous blind window opens:
   - **Answering team** privately selects their answer on their phone.
   - **Opposing team** privately chooses **Steal** or **Trust** on their phone.
   - Neither side receives any data about the other's in-progress state.
3. Simultaneous reveal: answer, correctness, and the opponent's choice appear together.
4. Score resolves automatically. No host action.

**Payoff matrix (balanced — do not simplify):**

| Opponent's choice | Answering team correct | Answering team wrong |
|---|---|---|
| **Steal** | Opponent **+1** | Opponent **−1** |
| **Trust** | Answering team **+1** | Opponent **+1** |

The `−1` on a failed steal is load-bearing. Without it, Steal carries no downside, dominates every decision, and the mind-game collapses into a free option. With it, both teams face a real blind simultaneous choice — and the answering team gains a genuine reason to deliberately answer wrong when it suspects a steal.

Across 3 items, teams build a read on each other. This is why 3 items matters (§3.3).

### 6.2 Co-op — Split Information

Information is split across teammates' phones; no single player can answer alone. Forced cooperation is architectural, not a social suggestion.

| Mechanic | Description |
|---|---|
| Split Clue | Phone A shows half the clue, Phone B the other half. They combine verbally within the timer. |
| Twenty Questions | The answer is shown privately to one player, whose phone accepts only yes/no input. Teammates interrogate within the timer. |

Timer: 45s (§3.4).

### 6.3 Relational — no objective answer

Scoring is based on agreement or prediction between teammates, not correctness against external truth.

| Mechanic | Description |
|---|---|
| Same Wavelength | Both teammates privately answer an open subjective prompt simultaneously. Point only on exact match. |
| Who Among Us | All players privately vote on a teammate for a playful prompt. Point on team consensus. |
| Guess Your Teammate | Player A answers privately; Player B predicts A's answer. |

### 6.4 Why Relational content is exempt from repeat-prevention

A trivia item dies after one use. A relational prompt does not — the answer changes with the group, and even with the same group over time. **Relational items are intentionally reusable across sessions** and are excluded from the duplicate-prevention rule in §3.5. This is what makes the content library effectively infinite.

### 6.5 Automatic validation

| answerMode | Validation | Needs phone? |
|---|---|---|
| `ryo` | Payoff matrix (§6.1) | Yes — both sides |
| `multiple_choice` | Direct match against stored option | Only if wrapped in RYO/Relational |
| `closest` | Absolute distance to correct value | Yes |
| `match` | Text match after Arabic normalization | Yes |
| `vote` | Tally + consensus check | Yes |
| `split` | Combined answer vs. accepted-answers list | Yes |

**Arabic normalization is correctness-critical, not cosmetic.** Strip tashkeel, normalize alef/hamza/ya variants, collapse whitespace, before any comparison. Unnormalized matching will reject valid answers and destroy trust in automatic judging within one session.

**No free-text judged answers exist.** Legacy open-answer content must be converted to multiple-choice at import time — a one-time content task, never a runtime judgment.

---

## 7. Selection and Turn Order

### 7.1 Challenge selection is system-determined (decided)

The 4-of-6 draft, rotation, and pick/ban logic is **cancelled and must not be built** (§0.2).

Two reasons, both decisive:

**UX weight.** Challenge selection adds a heavy step to setup for no gain.

**Uninformed choice.** A first-time player does not know what "Split Clue" is. Asking them to select or deselect mechanics they have never experienced is a choice without information — pure burden. (This constraint expires with experience, which is why the flexibility system in §15.2 is gated on it.)

Related principle worth preserving: **randomness that adds reads as a gift; randomness that removes reads as a punishment.** Any future variety mechanism must add or substitute, never silently delete something the player wanted.

### 7.2 What remains

**World selection:** players choose 3 Worlds at setup. This is now the only meaningful pre-match choice, which raises its stakes — the World-selection screen must clearly communicate each World's Signature mechanic, since that is the differentiator being chosen.

**Challenge order:** varied per match by the system (§3.5), not player-drafted.

**Turn order within a challenge:** applies only to turn-based Signature mechanics. RYO, Co-op, and Relational are **simultaneous by design** — precisely what makes them tamper-proof without a host (§10.4).

---

## 8. Scoring

| Source | Points |
|---|---|
| RYO — Trust + correct | +1 answering team |
| RYO — Trust + wrong | +1 opposing team |
| RYO — Steal + correct | +1 opposing team |
| RYO — Steal + wrong | −1 opposing team |
| Co-op success | +1 per item |
| Relational match/consensus | +1 per item |
| Signature mechanic | Declared per mechanic in the scoring registry (§4.1) |

**Perfect-clear bonus: +1 for clearing all 3 items of a challenge — but only for Co-op, Relational, and Signature challenges.** It does **not** apply to RYO, where the payoff matrix already supplies the tension and "perfect" is ambiguous (points there depend on the opponent's choice, not only on correctness).

**Negative totals:** clamp at 0 for display, but preserve the true signed delta in the event log — the post-match stat card needs real values.

**One scoring module only** (§0.3). Every mechanic registers its rule there; no mechanic computes points locally.

---

## 9. World Design Guardrail

Before shipping any World, it must pass:

> **If you saw a 10-second silent clip of this World's board, could you identify which World it is?**

If no, the World is not designed yet. This was the largest risk in the original architecture: a General Knowledge World has no distinguishing media the way Football or Anime do, so **its identity must come from format rather than content** — its Signature mechanic and RYO framing, not its subject matter.

---

## 10. Real-Time Session Architecture (web-first)

### 10.1 Platform shape

A **web application**, not a mobile app.

- **Shared screen** (laptop/TV browser) runs the main client and displays all public state.
- **Phones** are a private input/output channel, used only when information must be hidden from the room or the other team. Not a parallel game client.
- The two are **separate builds from one codebase** — shared state types, different views. Not one responsive layout. Their information-visibility rules are fundamentally different (§10.4), not just their screen sizes.

### 10.2 Persistent QR session — scan once per match

**Requirement: a player scans the QR exactly once, at setup, and their phone stays connected and correctly-scoped for the whole match. Re-scanning between challenges is unacceptable.**

1. **QR encodes a match join URL** — `https://<app>/join/<matchCode>` — not a per-challenge or per-round token. Static for the whole match.
2. **On scan**, the phone opens a persistent web client that immediately opens a WebSocket and holds it for the match duration.
3. **Server issues a device identity** bound to `{matchId, playerId, teamId}` plus a short-lived access token and a match-scoped refresh token.
4. **Persist both plus a stable `deviceId` in local storage.** This survives a refresh, an accidental back-navigation, or a browser restart without re-scanning.
5. **Token rotation happens silently over the existing socket.** The server pushes a fresh access token before expiry. The phone never re-authenticates visibly and never re-scans.
6. **The phone is a dumb terminal.** It renders whatever phase the server pushes. When a challenge needs no phone input, the server pushes an idle/spectator view. Views are pushed, never polled, never re-scanned.

### 10.3 Reconnection and mobile-browser realities

These are the failure modes that will actually break a session in the room:

- **Socket drops** (wifi blip, network switch): auto-reconnect with exponential backoff, re-authenticating from the stored `deviceId` + refresh token. Server restores the phone to the correct team, player, and phase — no visible interruption.
- **Phone screen sleeping:** request a Screen Wake Lock while a match is active; release on match end. Provide a visible reconnect affordance as fallback where unsupported.
- **iOS Safari suspends backgrounded tabs aggressively.** Listen for `visibilitychange` and force reconnect-and-resync on return to foreground. Assume the socket is stale after any backgrounding and re-fetch current phase rather than trusting local state.
- **Server is authoritative on resync.** On reconnect the phone discards local state and adopts the server's current phase. Never let a reconnecting phone replay a stale action into a resolved challenge.
- **Late joiners and dropouts:** a player joining after setup, or leaving mid-match, must not corrupt team composition. Define this before building Relational mechanics, which depend on a stable known roster (Who Among Us needs a list of who is actually present).

### 10.4 Server-authoritative visibility (no host, no leakage)

The server is the single source of truth for what each client may see. This one decision solves both "no interference between teams" and "no host judgment" at once.

```
ChallengeSession.state {
  phase: "collecting" | "resolved"
  visibleTo: { teamA: fieldList, teamB: fieldList }   // server decides, per phase
  timerEndsAt: timestamp
}
```

**No field is hidden by the UI.** A value a client should not see is never included in that client's payload. Hiding data with CSS or client-side conditionals while it still ships over the wire is not acceptable and is trivially defeated with dev tools.

---

## 11. Content Safety Policy — Relational Family

Mandatory for every Relational prompt in every World.

**Disallowed:** money or income, weight and body shape, religion, romantic relationships, intelligence, and anything that would cause an awkward silence in front of extended family.

**Allowed:** habits, reactions, preferences, harmless quirks — always framed inside the World's theme. The World is a natural fence against drift: "who would rage-quit first" stays inside Video Games and out of personal life.

---

## 12. Sharing / Growth Hook

Auto-generated vertical result card at match end: both teams' colors, final score, standout challenge, fastest correct answer, one share button. A one-day build targeting the discovery channel (TikTok, Snapchat, Stories) that every competitor in this category currently ignores. Relational challenges produce most of the shareable moments, which is a second reason for the §3.1 minimum-one-Relational constraint.

---

## 13. Data Model

```
World {
  id, name
  signatureMechanicId          // TBD per World — see §4
  soundPack, timerProfile, toneProfile
  scopes: Scope[]
}

Scope {
  id, worldId, name
  excludedChallengeTypes: ChallengeTypeId[]
}

ChallengeType {
  id
  family: "signature" | "ryo" | "coop" | "relational"
  isExclusive: boolean
  itemStructure: "discrete_triple" | "continuous"   // see §3.2
  answerMode: "ryo" | "multiple_choice" | "closest" | "match" | "vote" | "split"
  presentation: { inputType, mediaType, timerSeconds, soundPack, revealStyle }
  displayNameByWorld: Record<WorldId, string>       // rename per World — see §5.3
  scoringRuleId                                     // resolved in the single scoring module
}

ContentItem {
  id, scopeId
  compatibleChallengeTypes: ChallengeTypeId[]
  correctOption? | acceptedTolerance? | acceptedAnswers? | splitPayload?
  isReusableAcrossSessions: boolean                 // true for relational — §6.4
}

Board {
  worldId
  slots: ChallengeType[4]        // 1 signature + 2 ryo + 1 flex — §3.1
}

MatchSnapshot {
  teams: Team[]
  worlds: World[3]
  boards: Board[3]
  presentationOrder: ChallengeTypeId[]   // varied per match — §3.5
  events: ScoreEvent[]                   // signed deltas, unclamped
  currentChallengeSession: ChallengeSession
  participants: Participant[]            // device-bound — §10.2
}
```

---

## 14. Future Technology & Tooling Notes

Working notes, not commitments.

**Real-time layer:** WebSocket-based (Socket.io, or managed via Ably/Pusher). Required for the sub-second simultaneous reveal in RYO and Relational — polling cannot deliver it. Session and timer state should live in a fast in-memory store (Redis) keyed by match ID, not the primary database, to avoid a DB round-trip per phone input.

**Session/auth:** short-lived signed access tokens plus match-scoped refresh tokens, rotated silently over the open socket (§10.2). Never encode player identity in the QR — it carries only a match code.

**Arabic text normalization utility:** one shared module (§0.3). Correctness-critical for `match` mode.

**Content authoring tool:** given the Scope × Challenge Type compatibility grid, a lightweight internal CMS will be needed to tag content with `compatibleChallengeTypes`, set `isReusableAcrossSessions`, manage `displayNameByWorld`, and convert legacy open-answer items to multiple-choice before RYO consumes them at scale. This becomes a bottleneck earlier than expected — plan for it before the second World ships.

**Screen Wake Lock API** on phone clients during an active match, with a visible reconnect fallback (§10.3).

**Analytics required from day one:**
- Average match duration, validated against the ~40–45 minute estimate (§3.4).
- RYO steal-rate and steal-success-rate, to detect whether the payoff matrix needs post-launch rebalancing.
- Per-World completion rate, to catch a World that isn't landing before more content is invested.
- Repeat-session fatigue signal, given the structural-repetition risk (§3.5).

---

## 15. Future Evolution Paths (evaluated, not scheduled)

### 15.1 Fully differentiated Worlds — not recommended

**The idea:** give each World four entirely unique challenges instead of one exclusive plus three shared.

**Why not.** The obvious cost is engineering: 4 Worlds × 4 mechanics = 16 bespoke mechanics, and every new World becomes a project rather than a sprint. But the deciding problem is the player, not the budget.

**A player plays 3 Worlds per match.** Under the shared model, they learn 4 mechanics in World 1, then only **one new mechanic** in each of Worlds 2 and 3 (the Signature) — 6 learning events total. Under full differentiation, that becomes **12 rule explanations in 40 minutes.** The player never exits comprehension mode and never reaches tactical play. That recreates the exhaustion this product exists to solve, in a new form.

**Sharing mechanics across Worlds is therefore a design feature, not a compromise** — it frees the learning budget to be spent on depth.

**The cheaper path to the same goal:** don't make Worlds share challenges *visibly*. Same mechanic code, but different name, different visual frame, different input type, different media per World (§5.3). Players experience presentation, not source code.

**The one case that justifies a bespoke mechanic:** when a shared mechanic genuinely *cannot* work in a World — e.g. an audio-based mechanic in a World with no audio content. That is a real mechanical need, not a differentiation goal.

### 15.2 Pre-match flexibility (challenge substitution) — recommended, gated

**The idea:** Worlds keep 3 shared + 1 exclusive, but before starting a match the player may swap one or two challenges for other available ones.

**Why this works despite §7.1.** The objection in §7.1 was to *uninformed* choice, not to choice itself. A first-time player cannot meaningfully pick mechanics they've never seen. A player five matches in absolutely can — they know what Split Clue is and whether their group enjoys it.

**Design conditions:**
- **Default stays system-determined.** Never the initial experience.
- **Gate on experience** — unlock after N matches, or place behind a "customize" affordance collapsed by default.
- **Frame as substitution, never removal.** "Swap this for that", not "deselect". Removal reads as punishment; substitution reads as control (§7.1).
- **The Signature mechanic is never swappable.** It is the reason the World was chosen.
- **The minimum-one-Relational constraint (§3.1) still binds** after any swap.

**Dependency:** this feature requires a library of alternates to swap into, so it cannot ship until more than 4 challenges per World are authored. It sequences naturally after content expansion.

**Why this outranks §15.1:** it is far cheaper (UI plus configuration versus 12+ new mechanics), and it *partially achieves* full differentiation anyway — once players can swap, Worlds become differentiated by the player's own configuration. It also doubles as a retention feature, giving returning players a new layer to explore around session five, which is exactly when a party game normally goes stale.

---

## 16. Signature & Shared Mechanic Assignment *(authoritative)*

This section supersedes the "deliberately unspecified" framing of §4. The requirements in §4.1 and the launch
gate in §4.2 still govern every entry here.

### 16.1 Shared Core — product decision changed

**Previous Shared Core:** RYO + One Clue + Closest. This is what the entire content catalog was authored
against, and it is `SUPERSEDED` as a *forward* plan.

**New Shared Core — 🟡 DESIGN APPROVED, MIGRATION NOT STARTED:**

1. **Read Your Opponent / اقرأ خصمك** — unchanged
2. **Closest / مين أقرب** — unchanged
3. **Bomb / القنبلة** — **replaces One Clue**

**Two clearly separate things — do not conflate them.**

**✅ ALREADY IMPLEMENTED — Bomb gameplay.** Bomb is a working mechanic in the runtime today, and its established
identity is preserved as-is. It is *not* being redesigned:

- One **continuous session clock** (~30s), not a per-item timer. Bomb declares
  `deadline: { source: 'session-clock', commandType: 'expire-team' }` — the deadline *is* the active team's
  clock, which is why Bomb is the one mechanic whose deadline is derived from session rather than runtime state.
- The current team/player receives a question; a **correct answer passes the turn/pressure to the opponent**.
- **The timer does not reset on a correct answer.** `TeamClock` accumulates `consumedMs` and reports
  `allocatedMs - consumedMs - liveElapsed`, so the bomb stays under continuous time pressure.
- **Skip** uses the existing Bomb rules (`skip` command), and `adjust-active-team-time` supports time
  adjustment. A drained clock resolves through `expire-team`.
- Text and **voice** interaction already exist in the player-facing implementation.
- Lifecycle correctness is covered: a Bomb skip ends the *challenge*, never the whole live session, and the
  Bomb clock path is exercised by the real-Mongo `bomb-board-lifecycle` suite.

**⬜ NOT IMPLEMENTED — Bomb as a Shared Core mechanic.** None of the following exists:

- No `bomb` **ChallengeType** is registered (verified: the catalog holds `read-your-opponent`, `one-clue`,
  `closest`, `top-5`, `distributed-information` — and no `bomb`).
- No **catalog ownership** — Bomb has zero authored content items.
- No **cross-World Bomb content coverage** — the 49 scopes are authored to ≥9 on RYO / One Clue / Closest, and
  none of that content is Bomb content.
- No **board/slot reconciliation** for a Shared Core that includes Bomb.

So Bomb is *playable* but not *shared*. Nothing about the migration has begun.

**The existing One Clue catalog is not deleted or wasted.** 549 ready One Clue items remain in the runtime and
keep their value — One Clue's *ownership* changes from shared to the Movies Signature (§16.2), it does not
disappear. Any migration plan must preserve that content.

### 16.2 Signature matrix

| World | Signature mechanic | Mechanic implemented? | World rollout | Status |
|---|---|---|---|---|
| **Football / كرة القدم** | Top 5 / أفضل 5 | ✅ `top-5` plugin, launcher, ChallengeType | 🚧 active in football + video-games; ownership needs reconciling to football-exclusive | ✅ mechanic / 🚧 rollout |
| **Puzzles / عالم الالغاز** | Distributed Information / ركّبها | ✅ `distributed-information` plugin, launcher, ChallengeType, 213 items | 🚧 exclusivity and board rollout not finalized | ✅ mechanic / 🚧 rollout |
| **Movies / الأفلام** | One Clue / بدليل واحد | ✅ mechanic exists (`one-clue`) | ⬜ not re-owned as the Movies Signature; Movies-specific form undefined | 🟡 design approved |
| **Music / الأغاني** | من أول نغمة | ⬜ | ⬜ | 🟡 design approved |
| **World / العالم** | على الخريطة | ⬜ | ⬜ | 🟡 design approved |
| **Series / المسلسلات** | وش صار بعدها؟ | ⬜ | ⬜ | 🟡 design approved |
| **Video Games / فيديو قيمز** | المرحلة | ⬜ external visual prototype only (§17) | ⬜ | 🟡 design + prototype approved |
| **Anime / الأنمي** | *undecided* | — | — | ⬜ design not started |
| **Saudi Arabia / السعودية** | *undecided* | — | — | ⬜ |
| **Cars / السيارات** | *undecided* | — | — | ⬜ |
| **Sports / الرياضة** | *undecided* | — | — | ⬜ |

**Do not invent Signature mechanics for the four undecided Worlds.** They are blocked on product design, and
by §4.2 none of them can ship without one.

### 16.3 Approved Signature concepts — one line each

- **من أول نغمة** (Music) — recognise the song or artist from a very short audio segment. Future direction:
  revealing more audio is possible at a cost / reduced reward. Depends on the audio enrichment pipeline (checklist H).
- **على الخريطة** (World) — geography answered by placing or selecting a location on a map, rather than
  ordinary text trivia. No map interaction primitive exists in the codebase today.
- **وش صار بعدها؟** (Series) — exploits the sequential nature of series events/scenes: identify, order, or
  predict what happens next.
- **المرحلة** (Video Games) — board race; full spec in §17.

---

## 17. المرحلة — Video Games Signature design spec

🟡 **DESIGN + EXTERNAL PROTOTYPE APPROVED — PRODUCTION IMPLEMENTATION NOT STARTED.**
A visual prototype exists outside the runtime at `prototypes/marhala.html` (untracked). No Akwaan runtime code
has been written.

### 17.1 Core fantasy

> Two teams race across a short game-board level toward the finish.
> Knowledge controls whether they move. Difficulty controls the possible movement range.
> Board state determines whether taking the harder question is strategically smart.

This is explicitly **not** "quiz → random dice". The intended loop is:

`READ BOARD → CHOOSE RISK → ANSWER → MOVE → RESOLVE BOOST/TRAP`

### 17.2 Board

- 16 numbered positions
- Compact **4×4 serpentine** layout, borrowing the readability of Snakes & Ladders
- Styled as a **Video Games level**, never as literal snakes and ladders
- Position **16 = Finish / Exit**; reaching *or passing* 16 wins

### 17.3 Difficulty → movement range

| Difficulty | Movement |
|---|---|
| Easy | 1–2 |
| Medium | 2–4 |
| Hard | 4–6 |

### 17.4 Answer behaviour

- **Correct** — random movement inside the selected range; token advances; landing effect resolves
- **Wrong** — no movement; turn passes

Design intent: **Hard must not automatically be the best choice.** Players inspect the possible landing tiles
before selecting difficulty, so a wide range can be a liability near a trap cluster.

### 17.5 Special tiles — V4 playtest candidate

> ⚠️ **These values are a PLAYTEST CANDIDATE, not locked balance.** Expect them to change after real content
> and gameplay testing.

| Boosts | | Traps | |
|---|---|---|---|
| 3 → 7 | 5 → 7 | 4 → 1 | 6 → 2 |
| 8 → 13 | 10 → 13 | 9 → 7 | 11 → 7 |
| 12 → 16 | 14 → 16 | 15 → 13 | |

**Safe / destination positions:** 1, 2, 7, 13, 16

**Hard design rule:** each numbered tile has exactly **one** identity — Normal, Boost, Trap, or Finish. A
special *destination* must never also be a special *source*.

### 17.6 Visual direction

- 4×4 serpentine board with two team tokens physically present on it
- Video-games / arcade styling; boosts read as jump pads, warps or energy; traps read as glitch, corruption or
  hazard — **not** literal snakes and ladders
- Possible landing tiles highlighted from the selected difficulty
- Lucky-movement reveal after a correct answer
- Movement animates tile by tile; Boost/Trap resolution plays *after* landing

---

## 18. Taxonomy decisions *(product direction)*

### 18.1 Status

All three decisions below are 🟡 **APPROVED DIRECTION — NOT IMPLEMENTED**. The runtime catalog at `302bc37`
remains the implementation truth until a dedicated migration is approved and executed. **No World was
deleted, renamed, moved or altered while this roadmap was updated.**

### 18.2 Movies and Series stay separate Worlds

Movies and Series remain **two distinct Worlds**. Each carries both Arabic and international/foreign content:

- **Movies / الأفلام** — Arabic movies *and* international movies
- **Series / المسلسلات** — Arabic series *and* international series

**Explicitly rejected:** splitting screen content into a "Hollywood World" and an "Arabic World". Language and
cultural origin are handled by **Scopes and content organisation**, not by creating parallel Worlds for the
same medium.

*Remaining work:* Arabic Movies and Arabic Series scopes/content do not exist yet and are future authoring work.

### 18.3 General Knowledge → a Scope of عالم الالغاز

🟡 **TAXONOMY / PRODUCT DIRECTION — NOT IMPLEMENTED.** Nothing has been merged, deleted, renamed or migrated.
معلومات عامة **still exists as its own draft World** in the runtime and remains the implementation truth.

The standalone **General Knowledge / معلومات عامة World** is a candidate for consolidation into
**عالم الالغاز** as a Scope, rather than remaining its own World.

Current runtime state: معلومات عامة exists as a **draft World** with its own scopes, *and* عالم الالغاز
already contains a distinct معلومات عامة scope. Consolidation would need to reconcile the two without losing
content.

Not implemented. Not scheduled.

---

## 19. Known debt & follow-up register

⚠️ All non-blocking. None of these gates the current baseline.

| # | Item | Class | Note |
|---|---|---|---|
| 1 | Plugin-invalid runtime can yield a snapshot with **no Match projection** | Hardening | `enrich` throws, the enricher registry catches and logs, and the client silently loses `snapshot.match`. The sweeper already avoids this class via `findStateById`. Surfaced during Performance Batch C. |
| 2 | Abandoned non-terminal Matches never expire | Product policy | 39 Matches hold a challenge indefinitely. Batch E made them nearly free to sweep but deliberately does **not** end them. Needs a product decision, not an optimization. |
| 3 | Music integration tests depend on ffmpeg/ffprobe | Test environment | The default integration container lacks both; the repo's own `media` compose profile exists to supply them. Tests are being run under the wrong profile. |
| 4 | Manual AI test expects `503`, route documents `400` | Stale test expectation | `AdminAiGeneratorController.generateReviewed` never had the up-front guard; its own `@ApiResponse` documents 400. Needs an AI-module owner decision. |
| 5 | `participantMutation` and read handlers still return full snapshots as acks | Optional performance | The Batch A transform would cover them. |
| 6 | Session-command deadline path still fully persistence-backed (3 ops) | Optional performance | Holds committed *session* state but no runtime state, so it cannot use Batch B's hint API without its own freshness proof. |
| 7 | Per-snapshot content-scope lookups (2 ops per distinct World) | Optional performance | Purely to resolve display names that never change for a Match. Not viewer-sensitive, so safe to cache. |
| 8 | Compound `{status, currentChallenge.runtimeId}` index on `matches` | Optional performance | Measured: would cut the sweeper candidate scan from 118 examined docs to 39. Declined as a schema change taxing every Match write. |
| 9 | Two archived legacy ChallengeTypes retain **36 residual ready items** | Catalog hygiene | `mechanic-1785789172264` (12) and `mechanic-1785872224173` (24). Harmless but should be reconciled or purged. |
| 10 | **Deployment smoke test never executed against the current baseline** | Verification gap | The local dev stack runs an image built 2026-08-15, predating both `0961082` and `4f33704`; Batch A/D/E code was verified absent inside the running containers. A rebuild is required before any smoke test result can be trusted. |

---

## 20. Recommended next phase

**Shared Core migration — Master Checklist phase D, detail in §16.1.**

It is the correct next step because it blocks almost everything downstream: board composition (checklist I) cannot be
finalised while the Shared Core is changing, World activation (checklist J) depends on board configuration, and the
Movies Signature (§16.2) is waiting for One Clue to be released from the Shared Core.

Sequence, roughly:

1. Register a `bomb` ChallengeType and define the Bomb content contract
2. Decide the new board composition (§3.1 needs rewriting to match reality)
3. Author and validate Bomb coverage across target Worlds/Scopes
4. Re-point One Clue as the Movies Signature
5. Reconcile board configuration, then resume activation

⚠️ Item 10 in §19 is worth clearing first and is cheap: rebuild the dev stack so it actually contains
`302bc37` before any further runtime verification is attempted.
