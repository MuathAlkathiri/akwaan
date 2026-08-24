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

### Where things stand — 2026-08-21

Distinctions kept apart on purpose. Each row is one claim about one thing.

| Item | Status |
|---|---|
| **Permanent owner-account / per-ChallengeType no-repeat** (§5.5) | ✅ **IMPLEMENTED & VERIFIED** |
| **المرحلة mechanic** — backend, Admin authoring, player frontend (§17) | ✅ **IMPLEMENTED & VERIFIED** |
| **المرحلة local Video Games rollout** (§17.16) | ✅ **IMPLEMENTED & VERIFIED LOCALLY** |
| **المرحلة production content** (§17.17) | ⚠️ **OUTSTANDING** |
| **المرحلة balance** (§17.18) | ⚠️ **PLAYTEST FOLLOW-UP** |
| **12-Scope content expansion — authoring** (§C.1) | ✅ **COMPLETE** — 513 items authored, non-Bomb QA passed |
| **12-Scope taxonomy + zero-leakage QA workflow — Git** | ✅ **PUSHED** (`4fdab19`, `25141bd`, `fcf70ee`) |
| **Anime expansion — local/dev runtime promotion** (§C.1) | ✅ **IMPLEMENTED & VERIFIED LOCALLY** — 3 Scopes, 135 items |
| **Anime expansion — Bomb media** | ✅ **COMPLETE LOCALLY** — 45/45 attached, on disk and served |
| **Football expansion — local/dev runtime promotion** (§C.1) | ✅ **IMPLEMENTED & VERIFIED LOCALLY** — 3 Scopes, 126 items |
| **Football expansion — Bomb media** | ✅ **COMPLETE LOCALLY** — 45/45 attached and served, product-reviewed |
| **Video Games / Puzzles expansion — runtime promotion** | ⬜ **NOT PROMOTED** — Bomb media pending (§C.1) |
| Public production database | ⬜ **NOT PROMOTED** |
| Production deployment | ⬜ **NOT DEPLOYED** |

**Git, database and deployment are three different things and this document keeps them apart.**

*Git*, as of 2026-08-21: `HEAD` is **`fcf70ee`**, level with `origin/main`. Three commits landed for the content
milestone — `4fdab19` (authoring workflows + the zero-leakage QA policy), `25141bd` (12-Scope canonical taxonomy
and knowledge bases), `fcf70ee` (Anime Bomb/Combo promotion tooling). Together they touched **31 files** under
`ai/.opencode`, `.agents/skills`, `ai/scripts`, `AGENTS.md` and `.gitignore`. **They carry taxonomy, knowledge
bases and tooling — not content documents:** the 135 runtime items were *not* reproduced by the push, the
authored expansion packs and review galleries under `ai/output` remain local gitignored deliverables, and the
managed media binaries under `uploads/question-assets/images/` are deliberately untracked runtime media.

The working tree is still **dirty**: the exposure system, the المرحلة implementation and the Admin authoring work
are **uncommitted** — no المرحلة file is tracked yet.

*The local developer runtime database* holds changes that exist nowhere else: the canonical `marhala`
ChallengeType, 19 المرحلة dev fixtures, the Video Games `slot_4` binding, the `content_exposures` collection, a
local smoke account, gameplay records from playing — and, from the content milestones, **six** new Scopes with
**261** promoted items and **90** Bomb media files (Anime 3/135/45, Football 3/126/45). **Those are local runtime
mutations. They are not Git changes and not a deployment** — no runtime promotion in this document was a "push",
and `HEAD` has not moved since `fcf70ee`.

---

## Current state — verified against the repository

Everything in this section was confirmed by reading code and querying the runtime database read-only on
2026-08-18. Nothing here is asserted from memory.

### Mechanics implemented in the runtime

Nine gameplay plugins are registered; eight have Match-side challenge launchers *(count re-verified
2026-08-20, after المرحلة)*.

| Mechanic | Runtime key | Plugin | Launcher | ChallengeType in catalog |
|---|---|---|---|---|
| Read Your Opponent / اقرأ خصمك | `read-your-opponent` | ✅ | ✅ | ✅ `active` |
| Closest / مين أقرب | `closest` | ✅ | ✅ | ✅ `active` |
| One Clue / بدليل واحد | `one-clue` | ✅ | ✅ | ✅ `active` |
| Top 5 / أفضل 5 | `top-5` (keep-or-give) | ✅ | ✅ | ✅ `active` |
| Distributed Information / ركّبها | `distributed-information` | ✅ | ✅ | ✅ `active` |
| **الكومبو / Combo** | `combo` | ✅ | ✅ | ✅ `active` *(local/dev — §16.4)* |
| **Bomb / القنبلة** | `bomb` | ✅ | ✅ | ✅ `active` *(local/dev)* — ✅ Anime + Football production content with media; ⚠️ other Worlds pending (§16.1) |
| **المرحلة / Marhala** | `marhala` | ✅ | ✅ | ✅ `active` *(local/dev — §17)* — ⚠️ content is 19 dev fixtures |
| Core round runtime | `core-round-runtime` | ✅ | — | *(infrastructure)* |

**The Bomb row changed on 2026-08-19 and needs reading in two halves.** Bomb's *mechanic* integration is
done: a canonical `bomb` ChallengeType is provisioned and `active` in the local runtime, Admin can select it,
author for it, and bind it to a World slot, and a real Match resolves it as launchable. What is **not** done is
its *content*. So the Shared Core decision (§16.1) is no longer design-only at the mechanic level, and is still
unmet at the content level. Full state in §16.1.

> `SUPERSEDED (2026-08-21)` — this paragraph previously stated that "the catalog holds 10 items stamped
> `local-dev-bomb-smoke-fixture` and no production Bomb content exists". Both halves are now wrong. **No items
> carry the fixture stamp**, and Bomb *does* have authored production content for Anime: **60 items with media**
> in the local runtime — 15 stamped `bomb-anime-production-section-1-2026-08-20` across the four original Anime
> Scopes, plus 15 in each of the three new expansion Scopes (§C.1). What remains outstanding is Bomb content for
> **every other World**, and none of this is in the public production database.

**The الكومبو row was added on 2026-08-19.** Its ChallengeType and its Anime board binding exist in the
**local/dev runtime only** — nothing is committed, pushed or deployed. Full state in §16.4.

**The المرحلة row was added on 2026-08-20** and reads in the same two halves as Bomb's. The *mechanic* is done
and verified end to end — backend, Admin authoring, player frontend — and the Video Games board carries it in the
local runtime. What is **not** done is *production content*: the catalog holds 19 items stamped
`local-dev-marhala-smoke-fixture`. Full state in §17.

**⚠️ Content counts in this section are no longer trustworthy without re-measurement.** The 2026-08-18 sweep
below is preserved as the historical baseline, but a read-only query on **2026-08-20** found the local catalog
materially different — including the Bomb and الكومبو fixture stamps this document cites. Those changes were made
outside this work and are not attributed here; see the observation block below and §19 item 19.

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

#### Current local/dev runtime observation — 2026-08-21 *(not a baseline, not `origin/main`)*

Read-only query taken after the Anime expansion promotion. **The table above is the 2026-08-18 baseline and is
deliberately left intact**; this is a separate observation of one developer machine, and the two disagree.

| Measure | 2026-08-18 baseline | Local runtime 2026-08-21 *(post-Football)* | Explained by |
|---|---|---|---|
| Ready content items | 1954 | **1782** | partly — see below |
| Scopes | 49 | **55** | ✅ the 6 promoted expansion Scopes (§C.1) |
| ChallengeTypes | 9 | **10** | ✅ `marhala` (§17) |
| `read-your-opponent` ready | 546 | **600** | ✅ +27 Anime, +27 Football |
| `closest` ready | 557 | **610** | ✅ +27 Anime, +27 Football (556 before them) |
| `top-5` ready | 53 | **40** | 🚧 +27 Football expansion, over a base that had dropped to 13 ⚠️ |
| `combo` ready | 12 *(then called dev fixtures)* | **84** | ✅ 48 `combo-anime` + 36 Anime expansion |
| `bomb` ready | 10 *(then called dev fixtures)* | **106** | ✅ 15 original Anime + 45 Anime expansion + 45 Football expansion + 1 المرحلة fixture |
| `marhala` ready | — | **19** *(dev fixtures, §17.17)* | ✅ this repo's المرحلة rollout |
| `one-clue` ready | 549 | **288** | ⚠️ unexplained |
| `distributed-information` ready | 213 | **0** | ⚠️ unexplained |
| Board configurations | 20 | 20 | Video Games `slot_4` now bound (§17.16) |

The Bomb, الكومبو and Top 5 rows are accounted for by authored expansion content (§C.1, §16.1, §16.4). Two rows
are still unexplained: `one-clue` more than halved and `distributed-information` reached **zero**, neither from
the exposure, المرحلة or expansion work. Top 5's base had also dropped from 53 to 13 before the Football wave
added 27 — the drop itself is part of the same unexplained drift. Not attributed here, and still open
(§19 item 19).

### Content expansion — 12 new Scopes *(milestone recorded 2026-08-21)*

A 12-Scope expansion was authored across four Worlds: **513 items total**. Non-Bomb content passed product QA.
Statuses differ per World and must not be collapsed.

| World | New Scopes | Authoring | Bomb media | Local/dev runtime |
|---|---|---|---|---|
| **Anime / الأنمي** | `dragon-ball` · `demon-slayer` · `jujutsu-kaisen` | ✅ complete | ✅ **45/45 complete** | ✅ **PROMOTED & VERIFIED LOCALLY** |
| **Football / كرة القدم** | `la-liga` · `serie-a` · `football-legends` | ✅ complete | ✅ **45/45 complete** | ✅ **PROMOTED & VERIFIED LOCALLY** |
| **Video Games / فيديو قيمز** | `minecraft` · `god-of-war` · `resident-evil` | ✅ complete | 🟡 **45 pending** | ⬜ **not promoted** |
| **Puzzles / عالم الالغاز** | `patterns-sequences` · `lateral-thinking` · `visual-puzzles` | ✅ complete | 🟡 **45 pending** | ⬜ **not promoted** |

⚠️ **Six of the twelve are promoted; six are source-only.** Anime and Football are in the runtime database
(3 Scopes each). The remaining **six** — Video Games `minecraft` · `god-of-war` · `resident-evil` and Puzzles
`patterns-sequences` · `lateral-thinking` · `visual-puzzles` — exist at source/authoring level only: canonical
`SCOPE.md` / `KNOWLEDGE.md` assets are committed and pushed and their content is authored, but **no runtime
Scope has been created and no content promoted**. They are therefore **not** implemented, **not** active,
**not** Admin-visible, **not** runtime-ready and **not** DB-promoted, and this document must not describe them
as any of those.

#### Anime expansion — ✅ IMPLEMENTED & VERIFIED LOCALLY

Verified read-only against the local runtime on 2026-08-21. Anime now has **7 active Scopes** (4 original + 3
new). Per new Scope, **45 items**:

| Mechanic | Per Scope | Expansion total |
|---|---|---|
| RYO / اقرأ خصمك | 9 | **27** |
| Closest / مين أقرب | 9 | **27** |
| الكومبو / Combo | 12 *(3 per stage, 1→4)* | **36** |
| القنبلة / Bomb | 15 | **45** |
| **Total** | **45** | **135** |

Verification recorded with the milestone: duplicate source markers **0** *(confirmed — 135 items, 135 distinct
markers, all stamped `anime-scope-expansion-2026-08-20`)*, invalid/blocked items **0**, each new Scope
`isReady` with **45/45 ready**, and RYO / Closest / الكومبو / القنبلة runtime smokes **PASS**.

**Bomb media — ✅ complete locally.** 45/45 items carry image media with 45 distinct URLs; independently
re-checked on 2026-08-21: **45/45 files present** in the backend container and **45/45 served over local HTTP
200 with an image content type**. Manual visual review of the media is reported complete.

Environment for all of the above, explicitly: Mongo `127.0.0.1:27018`, database `lammah-quiz`, backend
`http://localhost:3002` — **LOCAL/DEV ONLY. The public production database was untouched.**

The Anime board also now stands at the §3.1 target composition in the local runtime — `slot_1`
`read-your-opponent`, `slot_2` `combo`, `slot_3` `closest`, `slot_4` `bomb`, with `blockers: []` and
`warnings: []`.

#### Football expansion — ✅ IMPLEMENTED & VERIFIED LOCALLY

Verified read-only against the local runtime on 2026-08-21. Football now has **7 active Scopes** (4 original + 3
new: الدوري الإسباني `la-liga`, الدوري الإيطالي `serie-a`, أساطير كرة القدم `football-legends`), all active,
Admin-visible and ready. Per new Scope, **42 items**:

| Mechanic | Per Scope | Expansion total |
|---|---|---|
| RYO / اقرأ خصمك | 9 | **27** |
| Closest / مين أقرب | 9 | **27** |
| Top 5 / أفضل 5 | 9 | **27** |
| القنبلة / Bomb | 15 | **45** |
| **Total** | **42** | **126** |

Verification recorded with the milestone: RYO / Closest / Top 5 / القنبلة runtime smokes **PASS**, invalid or
blocked content **0** *(confirmed — 126 items, all `ready`, 126 distinct source markers, all stamped
`football-scope-expansion-2026-08-20`)*.

**Bomb media — ✅ complete locally and product-approved.** Semantic alignment 45/45, media attached 45/45;
independently re-checked on 2026-08-21: **45/45 files present** in the backend container and **45/45 served over
local HTTP 200 with an image content type**.

⚠️ **A media-mapping defect was found before promotion and repaired** — media had been paired to Bomb items by
position rather than by subject. That is what the **Bomb semantic alignment** invariant in §5.6 now forbids
permanently.

The Football board also stands at the §3.1 target composition in the local runtime — `slot_1` `top-5`, `slot_2`
`closest`, `slot_3` `bomb`, `slot_4` `read-your-opponent`, with `blockers: []` and `warnings: []`. Top 5 is now
**football-exclusive** in this runtime: all 40 of its items sit in Football and no other board binds it.

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

#### C.1 12-Scope expansion — 🚧 IN PROGRESS *(authoring complete, rollout World-by-World)*

- [x] **513 items authored** across 12 new Scopes in 4 Worlds; non-Bomb content passed product QA
- [x] **Zero answer leakage** and **Bomb semantic alignment** invariants defined and applied (§5.6)
- [x] Canonical `SCOPE.md` / `KNOWLEDGE.md` assets for all 12 Scopes **committed and pushed** — `25141bd`,
      with the authoring workflows in `4fdab19` and promotion tooling in `fcf70ee`
- [x] **Anime**: 3 Scopes created in the local/dev runtime, 135 items promoted, Bomb media 45/45, all four
      mechanic smokes PASS *(details in "Content expansion — 12 new Scopes")*
- [x] **Football**: Bomb media 45/45 + product review, 3 Scopes created in the local/dev runtime, 126 items
      promoted, all four mechanic smokes PASS *(details in "Content expansion — 12 new Scopes")*
- [ ] **Video Games**: Bomb media 45 → manual review → runtime promotion
- [ ] **Puzzles**: Bomb media 45 → manual review → runtime promotion
- [ ] Promotion of any of it to the **public production database** *(not started; explicitly out of scope so far)*

### D. Shared Core migration — 🚧 IN PROGRESS

The Shared Core is **RYO + Closest + Bomb** (§16.1). One Clue leaves the Shared Core and becomes the Movies
Signature. The mechanic-level work is done. The content and board work is **two Worlds in**: Anime and Football
both have authored Bomb content with media and boards at the target composition in the local runtime. Video
Games, Puzzles and the draft Worlds still need both (§C.1).

- [x] Shared Core composition locked: **RYO + Closest + Bomb** — and the forward board model settled (§3.1)
- [x] Bomb gameplay implemented and verified *(pre-existing; `bomb-board-lifecycle` 16/16)*
- [x] Canonical `bomb` ChallengeType operational — provisioned through the shared provisioner, idempotent
- [x] Bomb content contract wired into **Admin authoring**, sharing one rule with launch validation
- [x] Bomb Match routing and launchability verified through the real launcher registry
- [x] Local World-slot assignment verified — Bomb bound to an Anime slot with no special casing
- [x] Author **production** Bomb content for **Anime** — ✅ local/dev: **60 items with media** (15 original
      Scopes + 45 expansion Scopes)
- [x] Author **production** Bomb content for **Football** — ✅ local/dev: **45 items with media**, semantically
      aligned and product-reviewed (§5.6)
- [ ] Author production Bomb content for the **remaining** target Worlds *(every item needs an image)* — the
      authored Video Games and Puzzles expansions each await their 45 Bomb media (§C.1)
- [x] **Anime board reconciled** to Signature + RYO + Closest + Bomb — `slot_1` RYO, `slot_2` `combo`, `slot_3`
      `closest`, `slot_4` `bomb`, `blockers: []` — ⚠️ **local/dev runtime only**
- [x] **Football board reconciled** to Signature + RYO + Closest + Bomb — `slot_1` `top-5`, `slot_2` `closest`,
      `slot_3` `bomb`, `slot_4` RYO, `blockers: []` — ⚠️ **local/dev runtime only**
- [ ] Reconcile the **remaining** target World boards to **Signature + RYO + Closest + Bomb**
- [ ] Verify every target World against final Shared Core readiness
- [ ] Re-point One Clue to the Movies Signature (§16.2)

### E. Signature mechanics — product design

- [x] Football / كرة القدم → **Top 5** *(mechanic implemented)*
- [x] Puzzles / عالم الالغاز → **Distributed Information / ركّبها** *(mechanic implemented)*
- [x] Movies / الأفلام → **One Clue / بدليل واحد** *(design approved)*
- [x] Music / الأغاني → **من أول نغمة** *(design approved)*
- [x] World / العالم → **على الخريطة** *(design approved)*
- [x] Series / المسلسلات → **وش صار بعدها؟** *(design approved)*
- [x] Video Games / فيديو قيمز → **المرحلة** *(design approved and implemented — §17)*
- [x] Anime / الأنمي → **الكومبو** *(design approved and implemented — §16.4)*
- [ ] Saudi Arabia / السعودية → **undecided**
- [ ] Cars / السيارات → **undecided**
- [ ] Sports / الرياضة → **undecided**

### F. Signature mechanics — implementation

Design approval above does **not** imply any of these. Full matrix in §16.

- [ ] Movies → One Clue as the Movies Signature (re-ownership + Movies-specific form)
- [ ] Music → من أول نغمة *(depends on audio enrichment — checklist H)*
- [ ] World → على الخريطة *(map interaction; no map primitive exists yet)*
- [ ] Series → وش صار بعدها؟ *(sequential/ordering mechanic)*
- [x] Video Games → المرحلة *(✅ mechanic implemented & verified; ✅ local/dev World rollout verified; ⚠️ production content outstanding; ⬜ not deployed — §17)*
- [x] Anime → الكومبو *(✅ mechanic implemented & verified; local/dev World rollout verified; ⚠️ production content outstanding — §16.4)*
- [x] Football → Top 5 World-specific rollout reconciled — ✅ football-exclusive in the local/dev runtime; ⬜ not deployed (§C.1)
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
- [x] انمي `slot_2` rebound `one-clue` → `combo` — ⚠️ **local/dev runtime only, not committed or deployed** (§16.4)
- [x] فيديو قيمز `slot_4` bound to `marhala` — ⚠️ **local/dev runtime only, not committed or deployed** (§17.16).
      Board readiness `blockers: [] warnings: []`; composition, not slot number, remains authoritative
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
- [ ] Balance validation (pacing, scoring, المرحلة special-tile distribution and race length, الكومبو difficulty calibration and survival bonus) — ⚠️ المرحلة observations recorded in §17.18; **no balance decision approved**
- [ ] Deployment / release acceptance

Partial credit worth recording without moving the gate: a **local** rebuilt-stack gameplay smoke has now been
completed for الكومبو (2026-08-19) and for المرحلة (2026-08-20, §17.15). Neither is a *deployment* smoke, and
nothing above is satisfied by them.

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

### 3.1 Per-World board composition *(authoritative)*

**Four slots per World, one composition, settled.** The Shared Core is **RYO + Closest + Bomb** (§16.1), and
every World fills its fourth position with its own exclusive Signature.

| Slot role | Mechanic | Ownership |
|---|---|---|
| **Signature** | The World's own exclusive mechanic | One World only, never shared (§4, §16) |
| **Shared** | Read Your Opponent / اقرأ خصمك | Shared Core |
| **Shared** | Closest / مين أقرب | Shared Core |
| **Shared** | Bomb / القنبلة | Shared Core |

**The invariant is the composition, not the slot numbers.** `slot_1..slot_4` are generic positions and which
number holds which mechanic is configuration, not design — Anime currently runs RYO, الكومبو, مين أقرب, القنبلة
across slots 1–4, and another World may order them differently. Nothing in the product may key on a slot number.

Each World therefore teaches **three shared mechanics once** and one new Signature per World, which is the
learning budget §15.1 argues for.

> **SUPERSEDED — the original composition.** Kept because its reasoning is still worth reading, not because it
> is the plan. The forward model is the table above.
>
> | Slots | Family | Notes |
> |---|---|---|
> | 1 | **Signature (exclusive)** | Unique to this World, never in any other. |
> | 2 | **RYO** | "The backbone. Two slots, not one." |
> | 1 | **Flex: Co-op or Relational** | Authored per World, not randomized. |
>
> *Why RYO got two slots:* RYO is the replacement for traditional trivia — the spine of the game. At one slot
> per World it is 9 of 36 items (25%) of a match; at two it is 50%, matching its role. The flex slot then
> carried rhythm-breaking rather than load-bearing duty.
>
> **Why it was superseded:** the Co-op and Relational families were never built as separate slot families, the
> catalog was authored against three shared mechanics rather than an RYO×2 + Flex split, and the Shared Core
> decision (§16.1) settled on three named shared mechanics. One RYO slot plus Closest plus Bomb gives the same
> shared-mechanic weight with mechanics that actually exist.
>
> **SUPERSEDED — the Relational minimum.** The old hard constraint that *"every match must contain at least one
> Relational challenge across its three Worlds"* is no longer a design requirement: no World board carries a
> Relational slot, and the forward composition has no Relational position to satisfy it.
>
> ⚠️ **The code has not caught up.** Match selection validation still emits
> `MATCH_WITHOUT_RELATIONAL_CHALLENGE` as a *warning* (not a blocker), so every three-World selection currently
> reports it. Harmless today, but it is a live warning for a rule the design has dropped — see §19 item 17.
>
> **Alternative once considered:** one slot per family (Signature + RYO + Co-op + Relational). Balanced, but
> capped RYO at 25% and made every World's family composition identical.

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

1. **Content rotation** — ✅ **IMPLEMENTED & VERIFIED**, and now far stronger than this section originally
   required. A ContentItem that has actually been presented to the **Match owner's account** is **never**
   presented to that account again **inside the same ChallengeType**. Not "rare"; never. The mechanism is the
   shared content-exposure ledger in **§5.5**, which is also where the exemption question is answered.
   > `SUPERSEDED (2026-08-20)` — the original rule read: *"the 3 items per challenge draw from a pool large
   > enough that repeats are rare, and must not repeat across consecutive sessions for the same group.
   > **Exception: the Relational family is exempt** (§6.4)."* Two parts of that are gone. Repetition is no
   > longer merely *rare*, and the unit of memory is no longer *the group in consecutive sessions* — it is the
   > **owning account, permanently, per ChallengeType**. A group is not identifiable across sessions; the
   > account that owns the Match is. The Relational exemption survives as **product design** (§6.4) but is not
   > wired into the ledger, because no Relational mechanic exists in the runtime to exempt yet.
2. **Order variation** — the presentation sequence of the 4 challenges varies per match, so rhythm differs even
   when the set does not. Unchanged, and still a separate lever: it varies *rhythm*, never *whether an item may
   reappear*.

If playtests surface repetition fatigue, the intended response is the flexibility system (§15.2), not a return
to random removal (§7.1).

---

## 4. Signature Mechanics — Requirements *(assignment now in §16)*

> **SUPERSEDED IN PART.** When this section was written no Signature mechanic had been assigned. **Assignments
> now exist for 8 of 11 Worlds** — see the authoritative matrix in **§16**. The *requirements* below (§4.1) and
> the *launch gate* (§4.2) remain fully in force and are still the acceptance criteria for any new Signature.

**Every World must own exactly one exclusive mechanic that appears in no other World.** It is the World's mechanical and visual fingerprint, always played, never substituted — it is the reason the player chose that World.

~~**The specific mechanic assigned to each World is not fixed in this document and is expected to change.** Candidates have been explored (list-ranking, live drawing, buzzer-race, rapid-fire chain) but none are committed. Do not implement any until assignment is decided.~~

**Resolved.** Assignments are recorded in **§16**. Three mechanics are implemented (Top 5, Distributed
Information, الكومبو), five are design-approved and unimplemented, and three Worlds remain undecided.

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

One item may therefore declare **several** compatible ChallengeTypes, and the exposure history that governs
repeats is **scoped per ChallengeType** (§5.5). A fact spent in القنبلة is still unseen in اقرأ خصمك for the same
account, because the mechanic — not the fact — is what the player experienced. Verified at runtime during the
المرحلة rollout: one item authored for both المرحلة and القنبلة was played in المرحلة and afterwards carried an
exposure row for `marhala` and none for `bomb`. Burning an item globally would throw most of the catalog's value
away for no product gain.

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

### 5.5 Content exposure — permanent owner-account / per-ChallengeType no-repeat

✅ **IMPLEMENTED & VERIFIED.** This is the mechanism behind §3.5 lever 1. One shared ledger serves every
mechanic; **no mechanic owns a private seen-question store.**

**The rule.** A ContentItem that has been presented to the account that owns the Match must never be presented
to that account again within the **same** ChallengeType.

**Canonical identity** — the triple the ledger is keyed and uniquely indexed on:

```
ownerAccountId + contentItemId + challengeTypeKey
```

**The owner is the account that owns the Match.** Deliberately *not* a participant phone, a device, a player
identity, or an individual teammate. Two different groups playing on one account share that account's history;
the same group on a different account does not. This is the only identity that is stable across sessions and
cannot be spoofed by rejoining.

**The same item stays eligible in another ChallengeType.** Account A seeing item X in اقرأ خصمك closes
`A + X + read-your-opponent` forever and leaves `A + X + bomb` open until X is actually shown there. This is
**not** global ContentItem burning, and must not be described as such.

#### selected ≠ exposed

An item becomes permanently spent **only at authoritative server-side presentation**. Three states that are
routinely confused are kept apart:

| State | Meaning | Permanent? |
|---|---|---|
| *selected / planned* | The server chose it for a challenge | No |
| *reserved* | Claimed so a concurrent Match of the same account cannot draw it; TTL-backed | No |
| *exposed* | A player was authoritatively shown it | **Yes** |

What that buys, per mechanic:

- **الكومبو** — the prebuilt 8-question plan reserves; questions the Run never reaches stay eligible.
- **القنبلة** — items selected but never reached in the run stay eligible.
- **المرحلة** — nothing is selected at launch at all; one question is drawn on demand after the difficulty is
  elected, and is spent when it is opened.
- **Reconnect, duplicate command, retry** — cannot double-spend; the ledger read-back is idempotent per triple.
- **Abort before presentation** — releases the reservation; nothing is spent.
- **Abort after presentation** — what was shown stays spent. Seeing a question is not undone by abandoning the
  challenge.

#### Coverage

All eight content-backed mechanics report presentation into the one ledger: `read-your-opponent`, `closest`,
`one-clue`, `top-5`, `distributed-information`, `bomb`, `combo`, and `marhala` — المرحلة reuses this system
rather than introducing anything of its own.

#### Explicit depletion

When an account has no eligible unseen content left, the runtime **does not silently repeat**. Depletion is a
first-class outcome, and the system distinguishes **account-specific exhaustion** (this account has seen
everything this position could offer) from **catalog-wide insufficiency** (the content does not exist yet).
المرحلة's terminal behaviour is the worked example — §17.

### 5.6 Content & media QA invariants

Two rules that hold at **authoring time**, because neither is detectable at runtime. Both are in force and both
came out of the 12-Scope expansion.

#### Zero answer leakage

✅ **IN FORCE** as of the 12-Scope expansion (§ *Content expansion*), and part of the committed authoring
workflow (`4fdab19`).

> **If a player who does not know the domain fact can still derive or compute the answer from the prompt wording
> alone, the item fails authoring QA and must be rewritten.**

This is stricter than "don't put the answer in the question". It also fails an item whose phrasing gives the
answer away structurally — a number stated in the prompt that only needs arithmetic, a grammatical form that
narrows the answer to one option, a clue that identifies its own target. The point of the catalog is to test
knowledge; an item that rewards reading comprehension instead is content that looks fine and measures nothing.

Applied to the authored 12-Scope expansion and to the المرحلة pilot content. It is an **authoring/QA gate**, not a
runtime check — the runtime cannot detect it, which is exactly why it has to hold at authoring time.

#### Bomb semantic alignment

✅ **IN FORCE** as of the Football Bomb media wave, which is where its absence was caught.

> **Prompt type ↔ authored subject ↔ accepted answers ↔ actual visual subject must all identify the same
> entity.**
>
> **Media must never be paired to Bomb items by positional index or assumed item-number ordering.** Pairing is by
> subject, item by item.

القنبلة is played by looking at a picture, so a mismatch is not a cosmetic defect — the item asks about one
entity and shows another, and every answer to it is wrong for reasons no player can see. Position-based pairing
produces exactly that, silently, at scale: the files and the items both look complete. A defect of this kind was
found in the Football wave before promotion and repaired; the wave was then re-verified subject by subject.

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

🟡 **PRODUCT DESIGN — NOT IMPLEMENTED AS A RUNTIME EXEMPTION.**

The reasoning stands and is worth keeping: a trivia item dies after one use, a relational prompt does not — the
answer changes with the group, and even with the same group over time. **Relational items are intentionally
reusable across sessions**, which is what would make the content library effectively infinite, and it is why a
mechanic can still be valuable while repeating its prompts.

What the code actually does today, verified on 2026-08-20:

- `ContentItem.isReusableAcrossSessions` **exists** as an authoring field, defaults to `false`, and is documented
  in the schema as "true for Relational content, which survives repeated sessions (6.4)".
- **Nothing in the Match or exposure layer reads it.** The exposure ledger (§5.5) has no reuse switch: it spends
  every presented item for its `(owner, ChallengeType)` pair, whatever the flag says.
- No Relational mechanic is registered in the runtime, so there is presently nothing for an exemption to apply
  to. The two archived legacy ChallengeTypes are the closest thing, and they are archived (§19 item 9).

So this is a design commitment with a catalog field reserved for it, **not** a live runtime policy. Wiring it —
if and when a Relational mechanic ships — means teaching §5.5 to honour the flag, and that work has not been
done or scheduled.

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

Auto-generated vertical result card at match end: both teams' colors, final score, standout challenge, fastest correct answer, one share button. A one-day build targeting the discovery channel (TikTok, Snapchat, Stories) that every competitor in this category currently ignores. Relational challenges produce most of the shareable moments — which used to be a second argument for the §3.1 minimum-one-Relational constraint. That constraint is now **superseded** (§3.1) and no board carries a Relational slot, so the share card can no longer rely on Relational content being present.

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

**New Shared Core — ✅ DECISION APPROVED · mechanic layer operational · content and boards outstanding:**

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

**✅ IMPLEMENTED & VERIFIED — Bomb as a canonical shared mechanic (2026-08-19).** The statement that used to
sit here — that no ChallengeType, no content contract and no catalog integration existed — is superseded, and
one part of it was wrong when written: the **content contract already existed** in `bomb-content.policy.ts`.
What was genuinely missing was that it was never wired into Admin authoring, so malformed Bomb content saved
cleanly and only failed at launch. That gap is closed.

Status is split four ways. **Do not collapse it.**

| Concern | Status |
|---|---|
| Shared Core product decision | ✅ **APPROVED** |
| RYO · Closest mechanics | ✅ **IMPLEMENTED & VERIFIED** |
| Bomb gameplay | ✅ **IMPLEMENTED & VERIFIED** |
| Bomb ChallengeType · Admin · catalog integration | ✅ **IMPLEMENTED & VERIFIED** *(local/dev)* |
| Shared Core architecture, mechanic level | ✅ **OPERATIONAL** |
| Production Bomb content | 🚧 **PARTIAL** — ✅ Anime (60 items) and Football (45 items) authored with media, local/dev; ⚠️ every other World outstanding (§C.1) |
| Cross-World Bomb content coverage | ⬜ **NOT YET AUTHORED** |
| Cross-World board migration | 🚧 **NOT COMPLETE** — pending content readiness |
| One Clue → Movies Signature | ⚠️ **STILL OUTSTANDING** |
| Git state | ⬜ **NOT COMMITTED / NOT PUSHED** |
| Deployment | ⬜ **NOT DEPLOYED** |

#### Canonical Bomb ChallengeType

| Field | Value |
|---|---|
| slug / runtime key | `bomb` |
| display name | القنبلة |
| family | `COOP` |
| itemStructure | `continuous` |
| answerMode | `match` |
| scoringRuleId | `challenge.win` |
| inputType | `phone-text` |
| timerSeconds | `null` |

**On `COOP`.** That is the current ChallengeType *family enum* value, and the family axis is the **answer
system** — not shared-versus-exclusive. `COOP` is the family of automatically resolved team mechanics, which
already holds مين أقرب. It does **not** mean Bomb is World-exclusive: Bomb is Shared Core and is meant to sit on
many boards. `SIGNATURE` was the previous value and was wrong for exactly that reason — it claims an exclusivity
Bomb must not have. **No new `shared` family enum exists and none should be invented.**

`timerSeconds: null` is deliberate: Bomb has no per-item timer, because its clock is the session's team clock.

#### Bomb content contract

Bomb uses **generic ContentItem fields only. There is no `bombPayload`.** One valid Bomb item requires:

- `status` ready for play
- **exactly one image** in `media.assets`
- an **Arabic prompt**
- `answerPayload.mode = match`
- **1–10** accepted answers, each **≤120 characters**
- no duplicate accepted answers after canonical answer normalization

**Run level, not item level:** a Bomb challenge selects an ordered set of **10–15 distinct playable items**. Do
not confuse the two — one item can never satisfy the run rule, and applying it per item would make Bomb
unauthorable.

Authoring and launch now share **one** item reader, so an item Admin accepts cannot later fail a launch on its
own shape. Verified live: a missing image, a blank Arabic prompt, no accepted answers, and duplicate answers
each return `400` with the matching `BOMB_ITEM_*` code.

#### Continuous clock — unchanged canonical identity

Bomb is **not** a per-question-timer mechanic and must not be rewritten as one.

- One continuous team/session clock; `deadline: { source: 'session-clock', commandType: 'expire-team' }`.
- A correct answer **passes the pressure and the turn** to the opponent.
- **The clock does not reset on a correct answer** — consumed time keeps accumulating.
- Skip follows the existing Bomb rules; a drained clock resolves through `expire-team`.

A direct regression assertion for the non-resetting clock was added on 2026-08-19. Nothing had pinned it before:
the existing test proved the item advanced and the team switched, but not that the clock survived the hand-over.

#### Admin and catalog integration

Bomb's visibility comes from the backend catalog — **no frontend mechanic slug whitelist was introduced.** The
ChallengeType is provisioned and `active`, the Admin ChallengeType list exposes القنبلة, ordinary World-slot
assignment can select it, ordinary ContentItem authoring can select it, its authoring validation is active,
`MatchStageRouter` renders it, and the challenge-identity icon registry covers it.

#### Shared-mechanic semantics

One Bomb plugin, one Bomb ChallengeType, one authoring contract — and **each World/Scope owns its own Bomb
questions**. It does *not* mean a global question pool, cloned Bomb code per World, or any cross-World content
leakage. Verified: the same Bomb ChallengeType bound to two Worlds while their content counts stayed separate.

#### Local runtime state — local/dev only, not repository or deployment state

⚠️ Everything here is developer-machine runtime data. None of it is a commit and none of it is deployed.

- Bomb ChallengeType `6a86276c215dc4d4bed0cfe0`, `active`, exactly one record.
- **10** content items stamped `metadata.source = local-dev-bomb-smoke-fixture`. **Not production content.**
  > `SUPERSEDED (2026-08-21)` — historical. Those fixtures are gone. Bomb now has **105 authored production
  > items with media in the local/dev runtime**: Anime 60 (15 original Scopes + 45 expansion) and Football 45
  > (expansion, semantically aligned and product-reviewed). Bomb content for Video Games, Puzzles and the draft
  > Worlds is still outstanding — see §C.1 for the pending media waves.
- Anime board: RYO · الكومبو · مين أقرب · **القنبلة**, with `boardReady: true`. Bomb occupies the slot that was
  already empty.

**This does not mean the Worlds have been migrated.** The Anime binding proves the complete local World-slot
path end to end; every other World still needs production content readiness and board reconciliation.

**The existing One Clue catalog is not deleted or wasted.** One Clue's *ownership* changes from shared to the
Movies Signature (§16.2); the content does not disappear, and any migration plan must preserve it.
⚠️ The count has moved: 549 ready items at the 2026-08-18 baseline, **288** in the local runtime on 2026-08-21,
unexplained — §19 item 19. Preserving the catalog means first establishing which figure is right.

### 16.2 Signature matrix

| World | Signature mechanic | Mechanic implemented? | World rollout | Status |
|---|---|---|---|---|
| **Football / كرة القدم** | Top 5 / أفضل 5 | ✅ `top-5` plugin, launcher, ChallengeType | ✅ **football-exclusive in the local/dev runtime** — `slot_1` on the Football board, no other board binds it, all 40 items in Football; 7 active Scopes after the expansion; ⬜ not deployed | ✅ mechanic / ✅ local rollout (§C.1) |
| **Puzzles / عالم الالغاز** | Distributed Information / ركّبها | ✅ `distributed-information` plugin, launcher, ChallengeType, 213 items | 🚧 exclusivity and board rollout not finalized | ✅ mechanic / 🚧 rollout |
| **Movies / الأفلام** | One Clue / بدليل واحد | ✅ mechanic exists (`one-clue`) | ⬜ not re-owned as the Movies Signature; Movies-specific form undefined | 🟡 design approved |
| **Music / الأغاني** | من أول نغمة | ⬜ | ⬜ | 🟡 design approved |
| **World / العالم** | على الخريطة | ⬜ | ⬜ | 🟡 design approved |
| **Series / المسلسلات** | وش صار بعدها؟ | ⬜ | ⬜ | 🟡 design approved |
| **Video Games / فيديو قيمز** | المرحلة | ✅ `marhala` plugin, launcher, on-demand supplier, content policy, ChallengeType | ✅ `slot_4` bound to `marhala` in the **local/dev** runtime; ⚠️ content is 19 dev fixtures, not authored | ✅ mechanic / ✅ local rollout / ⚠️ content / ⬜ not deployed (§17) |
| **Anime / الأنمي** | الكومبو | ✅ `combo` plugin, launcher, content policy, ChallengeType | ✅ `slot_2` bound to `combo` and ✅ **84 authored الكومبو items across all 7 Anime Scopes** in the **local/dev** runtime; ⬜ not deployed | ✅ mechanic / ✅ local rollout / ✅ local content (§16.4) |
| **Saudi Arabia / السعودية** | *undecided* | — | — | ⬜ |
| **Cars / السيارات** | *undecided* | — | — | ⬜ |
| **Sports / الرياضة** | *undecided* | — | — | ⬜ |

**Do not invent Signature mechanics for the three undecided Worlds.** They are blocked on product design, and
by §4.2 none of them can ship without one.

### 16.3 Approved Signature concepts — one line each

- **من أول نغمة** (Music) — recognise the song or artist from a very short audio segment. Future direction:
  revealing more audio is possible at a cost / reduced reward. Depends on the audio enrichment pipeline (checklist H).
- **على الخريطة** (World) — geography answered by placing or selecting a location on a map, rather than
  ordinary text trivia. No map interaction primitive exists in the codebase today.
- **وش صار بعدها؟** (Series) — exploits the sequential nature of series events/scenes: identify, order, or
  predict what happens next.
- **المرحلة** (Video Games) — board race whose central decision is *which risk band to elect from this tile*;
  full spec **and implementation record** in §17.
- **الكومبو** (Anime) — push-your-luck knowledge run built around the team's **cash out or continue** decision, with direct opponent pressure through **كسر الكومبو**; full approved design in §16.4.


### 16.4 الكومبو — Anime Signature design spec and implementation

**Status is deliberately split four ways. Do not collapse it into one marker.**

| Concern | Status |
|---|---|
| Product design | ✅ **APPROVED** |
| Mechanic implementation | ✅ **IMPLEMENTED & VERIFIED** *(local/dev code and runtime)* |
| World rollout | 🚧 **LOCAL/DEV ROLLOUT VERIFIED** — see *Local runtime state* below |
| Production content | ✅ **AUTHORED — local/dev only** — 84 items across all 7 Anime Scopes, 12 per Scope, 3 per stage |
| Git state | ⬜ **NOT COMMITTED / NOT PUSHED** |
| Deployment | ⬜ **NOT DEPLOYED** |

The rules below are no longer proposals: they are the behaviour the runtime enforces, and this section is their
canonical statement. Anything downstream that contradicts them is stale.

#### Core loop

The mechanic is built around **Knowledge + Push-your-luck + Team discussion + Opponent pressure**. It must not
collapse into ordinary trivia with a cosmetic multiplier; the recurring **"نوقف أو نكمل؟"** decision is the
heart of the experience.

One challenge is **two Runs**: Team A's Run, then Team B's Run, then challenge completion. Each team plays
**one Run** of at most **4 questions**.

Implemented rules:

- Every question gets a **fresh 30-second timer** — the clock is not a difficulty lever.
- A **correct answer** adds **+1** to the Run's **unbanked** balance.
- A **wrong answer** is an immediate **Combo Break**. A **timeout** is treated identically.
- A Combo Break loses **the entire unbanked balance** of that Run.
- After a correct answer on **Q1–Q3** the team must decide:
  - **Cash Out / ثبت** — bank the Run balance and end the Run.
  - **Continue / كمل** — play on with the whole unbanked balance at risk.
- A correct **Q4 banks the Run automatically**. There is **no Continue decision after Q4** — offering one would
  be a decision with a single legal answer.

Banked Combo points are the mechanic's own margin. They are reported as provenance for the Match point and are
**never added to the Match scoreboard** (§8).

#### Difficulty progression — fixed and load-bearing

Every Run rises through four difficulties in this exact order, for **both** teams:

| Question | Difficulty | Canonical value |
|---|---|---|
| Q1 | متوسط | `mechanicPayload.comboStage: 1` |
| Q2 | متوسط صعب | `mechanicPayload.comboStage: 2` |
| Q3 | صعب | `mechanicPayload.comboStage: 3` |
| Q4 | صعب جدًا | `mechanicPayload.comboStage: 4` |

The order is **never** randomised, reordered, skipped, or substituted. If a required stage is under-supplied the
**launch fails cleanly** through the ordinary insufficient-playable-content path, before any runtime exists —
there is **no difficulty substitution** and no silent downgrade.

`comboStage` is Combo's own metadata. It is deliberately **not** a shared `ContentItem.difficulty` field: the
World Content domain carries no points and no difficulty, and a Combo stage is a position in Combo's own
progression, meaningful only to Combo.

#### Scope and difficulty are independent dimensions

A **Scope** answers *"what is this question about?"*. A **stage** answers *"how hard is it inside the Run?"*
They are orthogonal, and **no mapping between them exists or may be introduced.**

A single Scope legitimately holds questions at every difficulty:

- ناروتو → متوسط · متوسط صعب · صعب · صعب جدًا
- هجوم العمالقة → متوسط · صعب جدًا
- بليتش → متوسط صعب · صعب

**This is wrong and must never be written:** *Naruto = medium, Attack on Titan = hard, Bleach = very hard.*

A Run therefore moves freely across Scopes while its difficulty still climbs 1 → 2 → 3 → 4, for example:

- Q1 → Naruto → متوسط
- Q2 → Attack on Titan → متوسط صعب
- Q3 → Naruto → صعب
- Q4 → One Piece → صعب جدًا

Scope diversity is a **selection preference applied within a stage**, expressed as a tie-break. It never
reorders stages and never rejects otherwise valid content.

#### Opponent ability — كسر الكومبو

Each team has access to **كسر الكومبو**, an opponent-pressure ability aimed at the rival team's **Cash Out
decision**, not at question difficulty.

Implemented rules:

- **One charge per team per Combo challenge.** Once spent it does not return.
- It may be armed **only while a valid next question exists** — so before Q1, Q2 or Q3, and **never at Q4**,
  because the effect is to force an additional question.
- **Activation is secret from the target team.** The arming team gets a private acknowledgement; the target team
  and the shared screen receive no form of it. Whether a charge has been *spent at all* is public; *when* it is
  armed is the secret.
- The ability never changes difficulty. It attacks the **Cash Out decision**, not the question.
- The charge is consumed by the **attempt**, not by the outcome.

Resolution:

1. The running team answers the current question normally.
2. **Wrong or timeout** → ordinary **Combo Break**; the full unbanked balance is lost and the ability is spent.
3. **Correct** → the team scores its ordinary **+1**, the break is **revealed to everyone**, **Cash Out is
   blocked**, and the next question is **forced**.
4. On that forced question:
   - **Wrong or timeout** → **Combo Break**; the full unbanked balance is lost.
   - **Correct** → **+2 TOTAL** for that question: +1 for the correct answer plus a **+1 survival bonus**.
     **It is +2 in total, not +2 on top of +1, and never +3.**
   - If the forced question is **Q4** and correct → +2 total, then the Run **banks automatically**.

Surviving a break attempt is **not** recorded as having been broken: the Run result attributes a breaker only
when the break actually landed.

#### Previously-open values, now decided

The earlier approval deliberately left these unlocked. They are now implemented and are **no longer TBD**:
maximum Run length (**4 questions**), per-question timer (**30 seconds**), base scoring (**+1**, forced-question
survival **+2 total**), difficulty progression (**1 → 2 → 3 → 4**, fixed), and the كسر الكومبو charge policy
(**one per team per challenge**).

#### Still open — calibration, not contract

- **Difficulty calibration.** Whether an author's متوسط ↔ صعب جدًا spread actually produces the intended
  cash-out tension is unvalidated, and can only be judged from authored production content.
- **Balance of the survival bonus** and of the 4-question Run length against real play.
- **Multiplayer playtesting** with real phones across both Runs.

These are playtest questions. They do not reopen the rules above.

#### Implementation state — ✅ IMPLEMENTED & VERIFIED

**Backend**

- `combo` GameplayModePlugin, registered in the mode registry.
- `ComboChallengeLauncher`, registered in the challenge-launcher registry — which is what makes the board slot
  launchable; launchability is derived from that registry and from no slug allowlist.
- Combo content policy owning the stage contract and the 8-item plan builder.
- Runtime-state deadline declaration, so the question clock is server-owned.
- Server-authoritative actor projections: the arming team, the target team and the shared screen each receive a
  different payload, and the secret exists in none but the arming team's.
- Completion summary carrying each team's banked points, how each Run ended, and who broke it.
- Match scoring untouched: Combo's internal points stay separate from the Match scoreboard.

**Selection**

- Stage authored as `mechanicPayload.comboStage: 1|2|3|4`.
- Drawn through the **generic** `selectionStrata` on the shared `MatchContentSelector` — Combo does not select
  content for itself.
- 8 distinct items per challenge, **2 per stage**; each Run receives one item per stage as 1 → 2 → 3 → 4.
- No item is reused between the two Runs.
- A stage shortage fails the launch; no stage is ever substituted.

**Frontend**

- Match runtime routing renders Combo (both the Match stage router and the standalone live-session panel).
- Combo gameplay panel: question, decision, break reveal, forced question, run hand-over, completion.
- Completed-challenge recap showing both Runs side by side with each team's banked total and how its Run ended.
- The recap keeps **banked Combo points visually separate from the Match reward**, and states outright that
  Combo points are not added to the Match result.

**Admin authoring**

- Combo is authored through the ordinary ContentItem form — no separate Combo editor.
- Required **صعوبة السؤال** dropdown: متوسط / متوسط صعب / صعب / صعب جدًا, persisting the canonical stage and
  never the Arabic label. Edit hydrates the saved stage.
- The backend rejects a missing or malformed `comboStage` at authoring time, through the same predicate the plan
  builder uses at launch — so an item Admin accepts cannot fail at launch for its stage.
- Content cards show **الصعوبة**, with difficulty filtering, sorting (1 → 2 → 3 → 4) and per-difficulty coverage
  counts. Scope filtering and difficulty filtering are independent and compose.

**Verification**

- Backend unit suite green — **161 suites / 1409 tests**.
- Frontend suites green — **73 files / 649 tests**.
- Combo real-Mongo lifecycle integration **30/30**, covering the persisted plan, both hand-over paths, the
  privacy projections, the +2 total, reconnect identity, and a clean stage-shortage launch failure.
- The local Docker stack was rebuilt on 2026-08-19 and verified to contain this code.
- A **local gameplay smoke was completed successfully** on 2026-08-19, confirmed by the product owner. This is
  operator confirmation of real play, not an automated result.

#### Local runtime state — local/dev only, not repository or deployment state

⚠️ **Everything in this subsection is a change to the developer machine's runtime database.** None of it is
represented by a Git commit, and none of it is deployed anywhere.

- The `combo` ChallengeType exists and is `active` in the local runtime catalog.
- The Anime board's **`slot_2` was rebound: `one-clue` → `combo`.**
- The Anime board remains structurally valid: four slots, four distinct mechanics, `boardReady: true`, and Anime
  still passes Match preflight.
- Combo is launchable through the real launcher registry, verified on a real Match board.
- Both changes were applied **through the Admin API**, so the full board policy ran — not by raw DB mutation.

Displacing One Clue from Anime is consistent with §16.2, which reassigns One Clue as the **Movies** Signature.
That re-ownership itself remains outstanding (checklist F).

#### Content status — ✅ AUTHORED (local/dev only)

الكومبو is no longer fixture-backed. The local/dev runtime holds **84 authored items across all 7 Anime Scopes** —
**12 per Scope, 3 per stage** — from the original `combo-anime` authoring across the four original Scopes (48)
plus the three new expansion Scopes (36, §C.1). No item carries the old `local-dev-combo-smoke-fixture` stamp.

Still **local/dev only**: the public production database holds none of it, and none of the content is committed
(§19 items 12 and 27).

> **Historical (2026-08-19), superseded 2026-08-21.** When الكومبو shipped, its only content was **12 local/dev
> smoke fixtures** — 3 per `comboStage`, spread across the Anime Scopes, every item stamped
> `metadata.source = local-dev-combo-smoke-fixture`, existing so one Combo challenge could launch and be played
> on a developer machine. The rule stated alongside them still holds for any future fixture: **dev fixtures must
> never be described, promoted, or counted as production content.**

Remaining content work:

- Playtest difficulty calibration and balance across the four stages (checklist K).
- Preserve Scope/difficulty independence when authoring more (§16.4).
- Get the content and its runtime state out of local-only (§19 items 12 and 27).

---

## 17. المرحلة — Video Games Signature design spec and implementation

**Status is deliberately split four ways. Do not collapse it into one marker.**

| Aspect | Status |
|---|---|
| Mechanic implementation (backend, Admin, player frontend) | ✅ **IMPLEMENTED & VERIFIED** |
| Local/dev Video Games rollout | ✅ **IMPLEMENTED & VERIFIED LOCALLY** |
| Production content | ⚠️ **OUTSTANDING** |
| Deployment | ⬜ **NOT DEPLOYED** |

> `SUPERSEDED (2026-08-20)` — this section previously read: *"🟡 DESIGN + EXTERNAL PROTOTYPE APPROVED —
> PRODUCTION IMPLEMENTATION NOT STARTED. A visual prototype exists outside the runtime at
> `prototypes/marhala.html` (untracked). No Akwaan runtime code has been written."* The prototype remains the
> visual reference it always was; the runtime implementation now exists and has been played end to end locally.

§17.1–§17.6 below are the **approved product design**, kept as approved. §17.7 onward record what was actually
built.

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


### 17.7 Canonical mechanic identity — ✅ IMPLEMENTED & VERIFIED

| Field | Value |
|---|---|
| Runtime key | `marhala` |
| Display name | المرحلة |
| Family | Signature |
| Item structure | `continuous` |
| Answer mode | `match` (phone text, canonical Arabic normalization) |
| Scoring rule | `challenge.win` |
| Question timer | **30s**, configurable — a playtest value, not a locked product decision |

Provisioned through the shared production-mechanic provisioner, not by hand, and idempotent on re-run.

### 17.8 Implemented core loop

```
READ BOARD → CHOOSE DIFFICULTY → DRAW ONE UNSEEN QUESTION ON DEMAND
→ ANSWER → MOVE IF CORRECT → RESOLVE TILE → PASS TURN
```

**There is no launch-time question deck.** The launcher binds zero content; the server draws exactly one
question *after* a difficulty is elected, which is what makes the risk decision real — the room commits to a
movement range before it knows what it is being asked.

| Difficulty | Movement |
|---|---|
| سهل / Easy | 1–2 |
| متوسط / Medium | 2–4 |
| صعب / Hard | 4–6 |

Difficulty is **question metadata**, authored as `mechanicPayload.marhalaDifficulty` with exactly
`easy` \| `medium` \| `hard`. It is independent of Scope in both directions: one Scope legitimately holds all
three bands, and **no Scope maps to a difficulty**. There is no global `ContentItem.difficulty` field, and
Combo's `comboStage` is a different concept that is never read in its place.

### 17.9 On-demand content selection

Selection happens per turn, through the shared `MatchContentSelector` and the shared exposure ledger (§5.5).
Eligibility is the intersection of:

- the Video Games World and the Match occurrence's **selected Scopes**
- المرحلة compatibility on the item
- the **authored band** matching the band the team elected — a hard filter, never a silent downgrade
- `ready` status
- the owner account's **unseen** history for `marhala`
- reservation / concurrency rules, so two concurrent Matches on one account cannot draw the same item

**No fixed per-game question quota exists.** المرحلة consumes as many questions as the race lasts. How much
production content to author is a content-planning decision (§17.13) — no number in this section is a runtime
requirement.

### 17.10 Implemented board — V4 playtest configuration

16 positions, 4×4 serpentine, start **1**, finish **16**; reaching *or passing* 16 wins.

> ⚠️ **PLAYTEST CONFIGURATION — BALANCE NOT LOCKED.** The tile map below is the V4 candidate from §17.5, now
> implemented as configuration. Implementing it did not promote it to a locked product decision.

| Boosts | | Traps | |
|---|---|---|---|
| 3 → 7 | 5 → 7 | 4 → 1 | 6 → 2 |
| 8 → 13 | 10 → 13 | 9 → 7 | 11 → 7 |
| 12 → 16 | 14 → 16 | 15 → 13 | |

**Safe / destination positions:** 1, 2, 7, 13, 16 — every boost and trap lands on one, which is what guarantees
a single effect can never chain.

### 17.11 Implemented runtime behaviour

- **Server-authoritative** throughout: the board, the roll, the landing, the tile effect and the winner are all
  decided server side. No client resolves gameplay.
- Teams **alternate**; المرحلة owns its own turn order in its runtime state.
- **Wrong answer or timeout** — the question is spent, **nothing moves**, the turn passes. No punishment movement.
- **Correct answer** — deterministic movement inside the elected range, then **at most one** tile effect.
  No recursive Boost/Trap chaining, by board construction.
- Reaching or passing 16 **completes the challenge immediately**; no later turn opens.
- The question **deadline is server-owned** (runtime-state deadline declaration); stale deadlines and stale
  revisions are rejected under CAS.
- Normal Match convergence and scoring are reused unchanged: `challenge.win` is awarded **once**, and the race's
  internal board progress is never mixed into the Match scoreboard.
- **No host judgment** anywhere: grading is the canonical Arabic normalizer every `match` mechanic uses.

*Implementation detail, not product design:* movement is a deterministic seeded roll derived from the runtime,
turn, team and band, so a replay of the same committed state reproduces the same movement. The specific hash is
an implementation choice and is deliberately not elevated to a product decision.

### 17.12 Implemented content depletion

- One band exhausted for the account → **only that band becomes unavailable**. The other bands stay playable,
  and the withdrawn band is refused server side (`MARHALA_DIFFICULTY_UNAVAILABLE`) rather than quietly
  downgraded to an easier question.
- All three bands exhausted → the challenge ends as an explicit, safe terminal state:

  ```
  winner   = none
  endedBy  = content-exhausted
  ```

  **No `challenge.win` is awarded**, no repeated question is served, and the runtime does not freeze or error.
  The player-facing recap says so in product language (§17.14), never in runtime vocabulary.

### 17.13 Admin authoring — ✅ IMPLEMENTED & VERIFIED

- Authored through the **ordinary ContentItem form** — no المرحلة-specific editor, no separate answer editor.
- Selecting المرحلة reveals a **required** `صعوبة السؤال` field offering exactly **سهل / متوسط / صعب**, persisting
  the canonical value and never the Arabic label. Create and edit both hydrate correctly; a saved value outside
  the contract is surfaced to the author rather than silently defaulted.
- The backend refuses a missing or malformed band through the same predicate the runtime draw uses, so an item
  Admin accepts cannot be one the draw rejects. A client posting the Arabic label instead of the canonical value
  is refused.
- Catalog: Arabic **الصعوبة** badge, difficulty filtering, canonical ordering (سهل → متوسط → صعب, never
  lexicographic), and READY coverage counts per band. **Scope and difficulty filters compose independently.**
- The mechanic is only offered where the World's board actually plays it, which the server enforces
  (`CHALLENGE_TYPE_NOT_CONFIGURED_FOR_WORLD`) — the Admin UI reflects that rule rather than owning a softer copy.

### 17.14 Player-facing frontend — ✅ IMPLEMENTED & VERIFIED

**Shared screen** — the 4×4 board is the visual hero, not decoration around a trivia card:

- both team tokens physically present, readable when they share a tile, active team emphasised
- server-provided band availability, with a spent band shown as spent rather than hidden
- **risk-band landing previews** from the team's current tile, marking boosts, traps and the finish
- the question, the elected band and the server-owned countdown, with the board still visible
- possible-landing highlights while the question is open
- movement reveal, then **tile-by-tile** cosmetic replay, then the Boost/Trap reaction, then the final tile
- Finish state, a المرحلة-specific completion recap, and a distinct **content-exhausted** recap

**Phones** are input surfaces, not miniature boards: the active team elects the band and submits the answer, the
opposing team gets a waiting state, and **server authorization is authoritative** — the client's disabled state
is never the guarantee.

No second realtime provider, timer, or answer architecture was introduced; المرحلة routes through the existing
runtime renderer, the existing countdown, the existing command client and the existing completion registry.

### 17.15 Implementation verification notes

**An authorization defect was found by real local smoke and fixed.** Before the fix, any *connected* opposing
participant could invoke `choose-marhala-difficulty` or `submit-marhala-answer`, because the runtime only
required `connected-player` and the plugin did not check the submitter's team. Observed live: the opposing
phone successfully elected صعب for the team on the clock. The plugin now resolves the submitter's team from the
authenticated participant against the live roster and compares it with the mechanic's own active team; an
unidentifiable submitter is refused, not waved through. After rebuild, the same command returns
**`MARHALA_NOT_YOUR_TURN`** with runtime state unchanged. Covered by four regression tests, and the plugin spec's
harness now supplies a real submitter — it had been exercising a caller the runtime never produces.

**Latest verified gates** *(final local rollout, 2026-08-20)*

| Side | Result |
|---|---|
| المرحلة plugin units | **43/43** |
| المرحلة real-Mongo lifecycle integration | **24/24** |
| Backend unit suite | **167 suites / 1577 tests** |
| Exposure + الكومبو + القنبلة integration | **69/69** |
| Backend typecheck / build / lint | clean |
| Frontend suites | **79 files / 808 tests** |
| Frontend typecheck / production build / lint | clean |
| Runtime E2E smoke specs against the running stack | **3 green** |

**Real local smoke — ✅ VERIFIED LOCALLY.** Exercised through the actual product stack, not by invoking plugin
methods: rebuilt backend and frontend containers, the canonical ChallengeType, a real Match on a real board, the
real session-join flow, two real phone participants over Socket.IO, on-demand Easy/Medium/Hard selection, correct
and wrong answers, a server-driven timeout, Boost, Trap, reconnect mid-question, no-repeat across races, the
cross-ChallengeType exposure boundary, one-band depletion, all-band depletion, Finish, `challenge.win` awarded
once, Match result reconciliation, return to board, Admin runtime smoke and a live privacy inspection of the
participant projections (no accepted answers, no grading payloads reach a phone).

This classifies the mechanic as **implemented and verified locally**. It is **not** a deployed production state.

### 17.16 Local/dev rollout state — not repository or deployment state

⚠️ **Everything here is developer-machine runtime state.** No commit, no push, no deployment.

- Canonical `marhala` ChallengeType provisioned **idempotently** and `active` in the local catalog.
- Video Games board, applied through the Admin API so the full board policy ran:

  | Slot | Mechanic |
  |---|---|
  | `slot_1` | `read-your-opponent` |
  | `slot_2` | `closest` |
  | `slot_3` | `bomb` |
  | `slot_4` | `marhala` |

  Readiness: `blockers: []`, `warnings: []`.

- **The authoritative rule is still composition, not slot number** (§5.4). المرحلة occupies `slot_4` because that
  position happened to be free; nothing in the code treats `slot_4` as "the Signature slot".

### 17.17 Local smoke content — ⚠️ NOT PRODUCTION CONTENT

**19 local/dev fixtures**, every one stamped `metadata.source = local-dev-marhala-smoke-fixture`:

| Band | Items | | Scope | Items |
|---|---|---|---|---|
| easy | 7 | | GTA | 6 |
| medium | 6 | | كود | 4 |
| hard | 6 | | فيفا | 4 |
| | | | اوفرواتش | 5 |

All `ready`. Every Scope carries more than one band, deliberately — a Scope must never imply a difficulty. One
fixture is multi-compatible (المرحلة + القنبلة) purely to verify the per-ChallengeType exposure boundary at
runtime.

**They must not be described, promoted, or counted as production content.** The smoke owner account has now been
shown all 19, so that account sees `content-exhausted`; a fresh account still sees all 19 — which is the
permanent no-repeat rule (§5.5) behaving correctly, not a defect.

### 17.18 Remaining work

- ⚠️ **Production content** — author mechanic-native المرحلة questions across the Video Games Scopes and all
  three bands, enough to support repeated play under the permanent no-repeat rule (§5.5). **No fixed target
  number is approved**; quantity is a content-planning decision.
  *Related, but not the same work:* the 12-Scope expansion (§C.1) authored three **new** Video Games Scopes —
  `minecraft`, `god-of-war`, `resident-evil` — which are **not yet in the runtime** and whose authored content is
  RYO / Closest / الكومبو / القنبلة. Neither that content nor those Scopes provide المرحلة content; المرحلة needs its
  own banded authoring, and it will want the new Scopes once they are promoted.
- ⚠️ **Balance / playtest follow-up** *(observations from the smoke, no decision approved, nothing changed)*:
  1. Both completed smoke races finished in roughly **7 turns**.
  2. **Easy (1–2) currently looks strategically weaker** than Medium and Hard.
  3. Six forward boosts — **14 → 16 especially** — make the board fast and aggressive.
  4. **30s** felt fine for short smoke questions; it needs validating against real production prompts.
  5. The **V4 tile distribution remains a playtest configuration**.
- Remove the 19 dev fixtures once production coverage exists; optionally remove the local smoke admin account
  created for the rollout.
- Git commit / push / deployment — only when explicitly requested.
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
| 10 | **Deployment smoke test never executed** | Verification gap | The stale-image half of this item is cleared: the local stack was rebuilt on 2026-08-19 and verified to contain the current working tree, and a local gameplay smoke has since been completed. The gap that remains is a genuine **deployment** smoke — nothing has been committed, pushed or deployed, so no release-side result exists. |
| 11 | ~~**الكومبو has no production content**~~ | Resolved 2026-08-21 | Closed. الكومبو has **84 authored items across all 7 Anime Scopes** in the local/dev runtime — 12 per Scope, 3 per stage — and no item carries the old fixture stamp. What remains is not content: it is that none of it is committed or deployed (item 12). §16.4. |
| 12 | **الكومبو exists only in the local runtime** | Release gap | ChallengeType, Anime `slot_2` binding and content live on the developer machine. No commit, no push, no deployment. Reproducing this on any other environment currently requires re-running the rollout by hand. §16.4. |
| 13 | **One Clue still needs its Movies re-ownership** | Product | Anime `slot_2` was rebound to `combo`, so One Clue is no longer on the Anime board — but it is still a Shared Core mechanic rather than the Movies Signature §16.2 assigns it. Unchanged by the Combo work; simply now more visible. |
| 14 | **Bomb production content exists for Anime and Football only** | Product / content | Done for Anime (**60** items) and Football (**45** items) — **105 authored Bomb items with media** in the local/dev runtime. Still outstanding for every other World; the authored Video Games and Puzzles expansions are each blocked on **45 Bomb media items** before they can be promoted. Every Bomb item needs an image, so this stays a media-bearing effort. §16.1, §C.1. |
| 15 | ~~**The only Bomb content is 10 dev fixtures**~~ | Resolved 2026-08-21 | Closed — no item carries that stamp. The hygiene rule it expressed (dev fixtures must never be counted as coverage) still applies, and now applies only to the 19 المرحلة fixtures (item 20). |
| 16 | **Cross-World board migration unfinished** | Product / config | Only Anime carries Bomb, and only in the local runtime. Every other World still needs reconciling to Signature + RYO + Closest + Bomb, which is gated on content readiness rather than on effort. |
| 17 | **`MATCH_WITHOUT_RELATIONAL_CHALLENGE` outlived its design rule** | Stale validation | §3.1 superseded the Relational-minimum requirement, but match selection validation still emits this warning, so every three-World selection reports it. A warning rather than a blocker, so nothing is broken — but it now warns about a rule the design has dropped. |
| 18 | **Bomb implementation and its runtime data are uncommitted** | Release gap | The Bomb work is working-tree only: no commit, no push, no deployment. The ChallengeType, the fixtures and the Anime board binding are local runtime state that no other environment has. |
| 19 | **Three catalog counts still diverge from the documented baseline** | Catalog hygiene / verification | Narrowed on 2026-08-21: the الكومبو and القنبلة gaps are explained (authored Anime content, §C.1). Still unexplained against the 2026-08-18 baseline: `distributed-information` 213 → **0**, `one-clue` 549 → **288**, `top-5` 53 → **13**. `distributed-information` reaching zero means the Puzzles Signature currently has no content in this runtime at all. Not produced by the exposure, المرحلة or expansion work, and not attributed here — someone needs to decide whether the runtime or the baseline is wrong. |
| 20 | **المرحلة has no production content** | Product / content | The only content is 19 dev fixtures (`metadata.source = local-dev-marhala-smoke-fixture`), 7/6/6 across the bands. Authored coverage across the Video Games Scopes and all three bands is required before Video Games can ship, and the fixtures must then be removed. **No target quantity is approved.** §17.17. |
| 21 | **المرحلة exists only in the local runtime** | Release gap | ChallengeType, the Video Games `slot_4` binding, the fixtures and the exposure rows all live on the developer machine. No commit, no push, no deployment; reproducing this elsewhere currently means re-running the rollout by hand. §17.16. |
| 22 | **المرحلة balance is unvalidated** | Product / playtest | Smoke races finished in ~7 turns, Easy (1–2) looks strategically weak, and six forward boosts (14 → 16 especially) make the board fast. The V4 tile map is a playtest configuration. Observations only — **no balance change is approved**, and none was made. §17.18. |
| 23 | **Rollout leftovers on the developer machine** | Hygiene | The 19 المرحلة fixtures and the local `marhala-smoke@local.invalid` admin account created for the rollout smoke both exist only locally and should be removed once no longer needed. |
| 24 | **The Relational repeat-prevention exemption is unwired** | Product / design | §6.4 remains approved design, and `ContentItem.isReusableAcrossSessions` exists as a catalog field, but the exposure ledger (§5.5) never reads it. Harmless today — no Relational mechanic is registered — and it must be wired before one ships with reusable prompts. |
| 25 | **Six authored Scopes are not in any runtime** | Product / content rollout | Video Games (`minecraft`, `god-of-war`, `resident-evil`) and Puzzles (`patterns-sequences`, `lateral-thinking`, `visual-puzzles`) have committed taxonomy assets and authored content, but **no runtime Scope and no promoted content**. Each World is gated on its 45 Bomb media items first. Must not be described as implemented, active, Admin-visible, runtime-ready or DB-promoted. *(Was nine; Football's three were promoted on 2026-08-21.)* §C.1. |
| 26 | **Bomb media outstanding for two Worlds** | Content / media | 45 items each for Video Games and Puzzles — **90** media items — each needing production, subject-by-subject pairing (§5.6), attachment and manual product review before its World can be promoted. Video Games is the immediate next content phase (§20). *(Was 135 across three Worlds; Football's 45 are complete.)* |
| 27 | **The whole content expansion is local/dev only** | Release gap | **261** promoted items across **six** runtime Scopes (Anime 135, Football 126) and **90** media binaries exist on one developer machine. The push (`4fdab19`, `25141bd`, `fcf70ee`) carried **taxonomy, knowledge bases and tooling only** — not content documents, not `ai/output` packs (gitignored), not the media binaries under `uploads/question-assets/images/` (deliberately untracked). Reproducing the runtime state elsewhere means re-running the promotions. |

---

## 20. Recommended next phase

**Video Games Bomb Media Wave.**

The previous phase — the Football Bomb media wave — is **complete**: media produced, a mapping defect caught and
repaired, product review passed, and the three Football Scopes promoted and verified in the local/dev runtime
(§C.1). Two of the four expansion Worlds are now in; the same gate stands in front of the remaining two, and it
is still media rather than authoring or engineering.

Immediate phase — **45 Bomb media items** for the authored Video Games Scopes:

| Scope | Bomb items needing media |
|---|---|
| `minecraft` | 15 |
| `god-of-war` | 15 |
| `resident-evil` | 15 |
| **Total** | **45** |

⚠️ **None of these three Scopes exists in the runtime yet** — they are authored and their taxonomy is pushed,
nothing more (§19 item 25).

Then, in order:

1. **Video Games Bomb media — 45**, paired subject by subject and never by position (§5.6) → manual product review
2. Create/reuse the 3 Video Games runtime Scopes, promote their approved content → runtime smoke per mechanic
3. **Puzzles Bomb media — 45** → manual product review → local/dev promotion
4. Only then: final Shared Core / board reconciliation, driven by complete coverage rather than by effort

⚠️ **This is content and media progression, not board migration.** Anime and Football boards reaching the target
composition covers those two Worlds and nothing else.

Two cheap things worth clearing alongside: the stale `MATCH_WITHOUT_RELATIONAL_CHALLENGE` warning (§19 item 17),
and getting the Bomb, الكومبو and المرحلة implementation work committed so it stops being local-only (§19 items
12, 18, 21 and 27). `distributed-information` currently having **zero** content in this runtime (§19 item 19)
needs resolving **before** Puzzles is promoted — it is the Puzzles Signature, and a Puzzles promotion on top of
an empty Signature catalog would be promoting half a World.

### Running alongside — المرحلة close-out

The Video Games Signature is implemented and verified locally (§17); what remains is not engineering:

1. Author **production** المرحلة content across the Video Games Scopes and all three bands — enough to sustain
   repeated play under the permanent no-repeat rule (§5.5). No target quantity is approved; that is a
   content-planning decision.
2. Playtest with real production-quality prompts, then decide on balance: race length, Easy's value, the six
   forward boosts, and the 30s clock (§17.18). Nothing about the V4 map or the timer changes without that.
3. Delete the 19 dev fixtures, and the local rollout smoke account, once neither is needed.
4. Commit / push / deploy only when explicitly requested — everything from this work is still working-tree and
   local-runtime state.

### Also newly settled — the permanent no-repeat rule

§5.5 is implemented and verified across all eight content-backed mechanics, which changes one planning
assumption: **content depth is now a hard requirement per account, not a nice-to-have.** An account that plays a
mechanic repeatedly will eventually exhaust it and see an honest `content-exhausted` outcome rather than a
repeat. Any per-mechanic content target should be set with that in mind.

---

## 21. Question Craft Authoring System & Multimodal Presentation (2026-08-24)

### 21.1 Canonical Product Decision: Question Craft Adoption
✅ **ADOPTED AS MANDATORY AUTHORING WORKFLOW.**

All future Akwaan question authoring across all Worlds and mechanics must enter through the **Question Craft** system. Content design begins with player interaction shapes rather than raw trivia facts:
- **Interaction First:** "What question shape/interaction is fun to play under this mechanic?" → Find a fair, recognizable, defensible canonical fact.
- **7-Step Authoring Flow:**
  1. Global Question Craft (`QUESTION-CRAFT.md`)
  2. Question Archetype Selection (`QUESTION-ARCHETYPES.md`)
  3. World Palette Guidance (`WORLD.md`)
  4. Scope & Knowledge Guidance (`SCOPE.md` + `KNOWLEDGE.md`)
  5. Mechanic Compatibility (`MECHANIC-COMPATIBILITY.md`)
  6. Batch Variety Review (`BATCH-VARIETY.md`)
  7. Factual, Answer & Zero-Leakage QA (`akwaan-content-qa/SKILL.md` + `validate_question_craft.py`)

### 21.2 The 4 Canonical QA Gates
Proven across 3 authoring playtests and codified in `.agents/skills/akwaan-content-qa/SKILL.md`:
1. **Scope-Native Alignment:** Knowledge targets must authentically belong to the selected Scope, not merely the overarching World.
2. **Unique-Answer Defensibility:** Every item must point deterministically to exactly one defensible answer; `acceptedAnswers` cannot be used to patch an ambiguous prompt.
3. **Media Earns Its Place:** For `IMAGE` and `AUDIO` items, the media asset must carry the core gameplay challenge. Prompts must not leak the answer via nicknames or giveaways.
4. **Difficulty Trust:** For risk-choice mechanics (e.g. Marhala), difficulty labels must be genuinely calibrated (Hard = deeper recognizable fandom knowledge, not obscure wiki minutiae or bad wording).

### 21.3 Multimodal Bomb Content Presentation
✅ **IMPLEMENTED, COMMITTED, PUSHED & PRODUCTION DEPLOYMENT VERIFIED.**
- **Presentation Modalities:** Backend and frontend support `none` (Text-Only), `image`, and `audio` using the canonical generic `ContentItem.media` schema.
- **Continuous Clock Invariant:** Server-authoritative continuous team clock, turn transfer on correct answer, skip penalty (-5s) keeping active team, and scoring remain 100% untouched.
- **Media Invariant:** Reuses existing generic `ContentItem` media; zero second discriminators or Bomb-specific media schemas. Backward compatible with legacy image items.
- **Authoring Guidelines:** Text prompts are concise (<70 chars advisory target); audio intents target 3–5 second recognizable clips with zero vocal answer leakage.

### 21.4 Authoring Playtest Evidence (48/48 Approved)
Completed three distinct authoring playtests validating the Question Craft architecture across mechanics and modalities:
- **Playtest 01 (Football × Bomb):** 15 items across Premier League, Champions League, and World Cup (15/15 `HUMAN_PRODUCT_APPROVED`). Proved rapid text + image variety.
- **Playtest 02 (Music × Bomb):** 15 items across Saudi, Gulf, Arabic, and International Music (15/15 `HUMAN_PRODUCT_APPROVED`). Proved audio-native intents (3–5s clips), real names, and duets.
- **Playtest 03 (Video Games × Marhala):** 18 items across GTA (3 Easy, 3 Medium, 3 Hard) and Minecraft (3 Easy, 3 Medium, 3 Hard) (18/18 `HUMAN_PRODUCT_APPROVED`). Proved Question Craft coexists with calibrated risk-choice difficulty ladders and zero collision against approved R2.2.

⚠️ **Status Discipline:** These 48 items are **authoring review playtest deliverables**; they are **NOT** runtime catalog coverage, not DB-promoted, not media-retrieved, and not deployed.

### 21.5 Repository, Git, and Public Deployment State
- **Question Craft Authoring System & Knowledge Assets:** ✅ **COMMITTED & PUSHED** (`1f497eb` — `.agents/skills/akwaan-content`, `.agents/skills/akwaan-content-qa`, `ai/.opencode/knowledge/architecture/*`, 12 World palettes, `validate_question_craft.py`).
- **Multimodal Bomb Implementation:** ✅ **COMMITTED & PUSHED** (`dcc0ff4` — Backend policy & runtime snapshot, Frontend typography & audio components, comprehensive unit tests).
- **Public Frontend (Vercel):** ✅ **DEPLOYED & VERIFIED** (`https://akwaan-frontend.vercel.app` — deployed bundle chunk `5497-9914ec7d99185ce7.js` verified containing `BombItemAudio`, `BombItemText`, `BombItemImage`, and audio playback controls).
- **Public Backend (Render):** ✅ **DEPLOYED & VERIFIED** (`https://akwaan-api.onrender.com` — `/health` returns `200 OK` `{"status":"ok","database":"connected"}`, `/worlds` returns active playable worlds).
- **Production Content State:** ✅ **15 FOOTBALL BOMB R1 ITEMS PROMOTED TO REAL PRODUCTION** (9 Text, 6 Image across Premier League, Champions League, World Cup; resolved via canonical slug architecture).
- **Production Smoke State:** ✅ **PUBLIC TEXT + IMAGE BOMB VERIFIED** (Text Bomb and new R1 Image Bomb items verified on live public production).
- **Audio Bomb Status:** ⚠️ **AUDIO BOMB PRODUCTION SMOKE STILL PENDING FIRST APPROVED AUDIO PACK** (Runtime capability deployed; audio catalog content smoke pending future promotion).
- **Git State:** ✅ **PUSHED TO MAIN** (`origin/main` level with `HEAD`).
- **Deployment State:** ✅ **PUBLIC PRODUCTION DEPLOYMENT VERIFIED** (Vercel + Render live and verified).

### 21.6 Football × Bomb Question Craft R1 — Production Promotion
✅ **RECOVERED, PROMOTED TO REAL PRODUCTION, MEDIA ENRICHED, AND PRODUCTION SMOKE VERIFIED.**

- **Source / Git:** ✅ Canonical R1 source pack (`ai/scripts/data/bomb-football-question-craft-r1.source.json`) sanitized of environment-specific ObjectIds and registered as milestone `football-bomb-r1` in canonical `ai/scripts/promote_approved_content.py`.
- **Approved Batch Promoted:** 15/15 approved items across 3 Scopes:
  - **Premier League (5 items):** 3 Text (`bomb-prod-fb-pl-001`, `002`, `004`), 2 Image (`003` Wenger, `005` Wolves).
  - **Champions League (5 items):** 3 Text (`bomb-prod-fb-cl-001`, `003`, `004`), 2 Image (`002` UCL trophy, `005` Allianz Arena).
  - **World Cup (5 items):** 3 Text (`bomb-prod-fb-wc-001`, `003`, `004`), 2 Image (`002` Croatia kit, `005` France rooster).
- **Modality Breakdown:** 9 Text-Only items, 6 Image items, 0 Audio items.
- **Production Media Ingest:** ✅ 6/6 WebP images uploaded to Cloudflare R2 bucket `akwaan-beta-media` under `question-assets/images/`. HTTP 200 and `image/webp` verified both directly on R2 CDN (`https://pub-6db8177278dd4bffacfc18c1307f7b7e.r2.dev`) and through the production backend (`https://akwaan-api.onrender.com/uploads/...`).
- **Production DB Promotion:** ✅ 15/15 items promoted to live Production database via canonical `promote_approved_content.py` using slug-based resolution (`slug=bomb` -> production ID `6a88fe367bdd34f0795233a9`). All items carry source marker `bomb-football-question-craft-r1:*` and status `ready`. Zero scope creation, zero deletes.
- **Idempotency:** ✅ Verified via second dry-run (15/15 `EXISTS_IDENTICAL`, 0 proposed writes).
- **Public Text Bomb Smoke:** ✅ Verified on live production runtime (no missing-image box, prominent text question, Arabic answer normalization, continuous team clock, turn transfer, -5s skip penalty).
- **Public Image Bomb Smoke:** ✅ Verified on live production runtime (R2 image delivery, correct visual render, media-native prompt, accepted answer matching).
- **Historical Root Cause & Note:** An earlier attempt only hit local runtime because legacy `promote_football_bomb_r1.py` hard-coded local Mongo ObjectIds. The promotion tooling has been corrected to use canonical slug resolution in `promote_approved_content.py` with full safety guards and unit test coverage.
### 21.7 Music World & Scopes — Production Taxonomy Provisioning
✅ **PRODUCTION TAXONOMY PROVISIONED (WORLD + 4 CANONICAL SCOPES).**

- **Authorization:** Approved Akwaan World §3 / §4 (`music` / `الأغاني`) and 4 canonical scopes.
- **Production World Provisioned:** ✅ `music` (`الأغاني`, ObjectId `6a8ca5af45494d8b8490b1e1`, status: `draft`).
- **Production Scopes Provisioned:** ✅ 4 canonical scopes under Music World:
  - `saudi-music` (`Saudi Music`, ObjectId `6a8ca5b045494d8b8490b1ee`, status: `draft`)
  - `gulf-music` (`Gulf Music`, ObjectId `6a8ca5b145494d8b8490b1fc`, status: `draft`)
  - `arabic-music` (`Arabic Music`, ObjectId `6a8ca5b345494d8b8490b20a`, status: `draft`)
  - `international-music` (`International Music`, ObjectId `6a8ca5b445494d8b8490b218`, status: `draft`)
- **Tooling & Safety:** Executed via canonical `ai/scripts/provision_music_taxonomy.py` with deterministic plan hash `fe8093f6f2d1cffe6cc5f16c47eeb193571e2af015f007880683dc15ec9fbb09`.
- **Idempotency:** ✅ Verified (subsequent dry-run yields `EXISTS_IDENTICAL` across World and all 4 Scopes; 0 proposed writes).
- **Match Availability / Playability:** ⬜ **NOT PLAYABLE.** Music status is `draft`, readiness is `not_ready` (no board slots bound, 0 content items). It is not selectable for matches.
- **Content State:** ⬜ **0/15 Music × Bomb R1 items promoted.** (Content promotion pending downstream step).
- **Media State:** ⬜ **0/7 Production assets ingested.**
- **Audio Smoke State:** ⚠️ **PENDING.**

