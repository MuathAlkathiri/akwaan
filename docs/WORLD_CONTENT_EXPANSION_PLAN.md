# AKWAAN — World Content Expansion Plan

A living document. Must be read completely before any generation or editing. Must remain updated while implementation progresses. Must remain the long-term source of truth for future Akwaan content expansion.

## Status

- [x] 1. Governing documents read
- [x] 2. Architecture understood
- [x] 3. Scope & phasing confirmed
- [x] 4. Mandatory audit performed
- [x] 5. Audit output written (updated 2026-08-16)
- [x] 6. Target worlds & scopes defined
- [x] 7. Content standards confirmed
- [x] 8. QA validation strategy documented
- [x] 9. Build order / waves confirmed
- [x] 10. Wave 1 complete
- [x] 11. Wave 2 complete
- [x] 12. Wave 3 complete
- [x] 13. Wave 4 complete
- [x] 14. Wave 5 complete
- [ ] 15. Wave 6 complete
- [ ] 16. Final QA
- [ ] 17. Release

---

## 1. Governing Documents

Read completely and in order before any generation:

1. `GAME_NEW_SYSTEM_ROADMAP.md` (repo root)
2. `docs/QUESTION_AUTHORING.md`
3. `ai/.opencode/knowledge/AKWAAN-CONTENT-BIBLE.md`
4. `ai/.opencode/knowledge/architecture/CONTENTITEM-MODEL.md`
5. `ai/.opencode/knowledge/architecture/MEDIA-CONTRACT.md`
6. `ai/.opencode/knowledge/architecture/ONE-CLUE.md`
7. All ChallengeType skills: `ai/.opencode/skills/challenge-types/*/SKILL.md`
8. All validator docs: `ai/.opencode/validators/*.md`
9. `docs/TOP_10_RANKED_LIST_MODE.md`
10. `docs/BOMB_MODE_PHASE_1_ARCHITECTURE.md`

## 2. Architecture

- A Content Item belongs to a **Scope**, not a Challenge Type. The same underlying fact can be reused across mechanics; the experience differs.
- Canonical authoring IDs are the source of truth for authoring; the runtime DB uses timestamp-generated ObjectIds. The mapping lives in the push scripts (`ai/scripts/push_gap_packs_2026_08_13.py`, `ai/scripts/push_content_gaps.py`).
- The runtime board is a four-slot world configuration. Current boards differ from the roadmap's canonical 1 Signature + 2 RYO + 1 Flex.
- Knowledge files own facts/domain coverage; ChallengeType skills own mechanic behavior. Scope `KNOWLEDGE.md` must not contain generation behavior.

## 3. Scope & Phasing

### 3.1 Current phase

- **Current phase: Shared-mechanic content only.**
- World-specific (Signature) mechanics: **Out of scope** for this plan. A world-specific Signature remains a launch blocker per roadmap §4, tracked as a standing open item.
- The three shared mechanics in scope are **Read Your Opponent (RYO)**, **One Clue**, and **Closest**.

### 3.2 Shared Content Completion (this phase)

Completion for this phase is defined ONLY by the three shared mechanics:

| Mechanic | Runtime ChallengeType | Authoring ChallengeType |
|---|---|---|
| Read Your Opponent | `read-your-opponent` | `read-your-opponent` |
| One Clue | `one-clue` | `one-clue` |
| Closest | `closest` | `guess-your-teammate` |

### 3.3 Existing / Extra Mechanic Coverage (preserved, non-blocking)

The following mechanics already exist in the runtime and are **preserved and documented** but **do not block completion** of this phase:

- **Distributed Information / ركّبها** (`distributed-information`) — present in كرة قدم and انمي scopes; referenced by board configs for عالم الالغاز and المسلسلات.
- **Top-5 / أفضل 5** (`top-5`) — present in كرة قدم and فيديو قيمز.
- **Archived mechanics** — items authored against archived challenge types remain in the DB and are preserved, not deleted:
  - `mechanic-1785872224173` — relational/vote (مين فينا), archived.
  - `mechanic-1785789172264` — signature/split (معلومات مقسّمة), archived.

Rules for existing/extra mechanics:
- Do NOT remove them.
- Do NOT archive or de-activate any challenge type.
- Do NOT rewrite their runtime board configuration.
- Document them; treat them as existing coverage.

## 4. Mandatory Audit — Do Not Skip

Audit must be performed before creating anything. Record the results in Section 5. Do not mark something complete because files were created — validate and record.

## 5. Audit Output

**Audit performed: 2026-08-16. Counts re-verified 2026-08-16 against the runtime DB.**

### 5.1 Authoring layer (`ai/.opencode`)

- `audit_active_architecture.py` → **PASS**. 133 active files, 10 ChallengeTypes, 13 patterns, 18 scopes.
- Manifest (`manifest.json`) declares 4 worlds: anime, football, video-games, puzzles — 18 scopes total.
- Canonical ChallengeType slugs: distributed-information, guess-your-teammate, one-clue, read-your-opponent, same-wavelength, split, split-clue, top-5, twenty-inquiries, who-among-us.
- Every World's `WORLD.md` notes "Signature mechanic: unassigned; the World is not launch-ready." — consistent with the plan's shared-mechanics scope.
- Validators present: `audit_active_architecture.py`, `test_one_clue_fixtures.py`, `test_who_among_us_fixtures.py`, `validate_distributed_information.py`, `validate_one_clue.py`, `validate_schema_examples.py`, `validate_top_5.py`, `validate_who_among_us.py`.
- Content health JSON records exist but are empty (0 records) — no derived health data to rely on; QA must re-derive.

### 5.2 Runtime DB (`mongodb://localhost:27018/lammah-quiz`)

- **Worlds (5):** كرة قدم (slug `test`), انمي, فيديو قيمز, مسلسلات (**draft**), عالم الالغاز.
- **Scopes (18):**
  - football: كأس العالم, الدوري الانجليزي, الدوري السعودي, ابطال اوروبا
  - anime: ناروتو, ون بيس, هجوم العمالقة, بليتش
  - video-games: كود, اوفرواتش, فيفا, GTA
  - puzzles: أرقام وحساب, منطق واستنتاج (draft), حروف وكلمات, رموز وشفرات, معلومات عامة
  - series: قيم اوف ثرونز (draft)
- **Challenge types (7):** closest (مين اقرب, coop, active), distributed-information (ركّبها, coop, active), one-clue (بدليل واحد, coop, active), read-your-opponent (اقرأ خصمك, ryo, active), top-5 (أفضل 5, signature, active); split (mechanic-1785789172264, signature, archived) and vote/relational (mechanic-1785872224173, relational, archived).
- **Content: 232 total, 231 ready, 1 draft.** Ready by type: read-your-opponent 52, one-clue 51, closest 51, distributed-information 24, vote (archived) 24, top-5 17 (+1 draft), split (archived) 12. **Total = 231 ready.**
- **Board configurations (enabled):**
  - كرة قدم: slot_1 top-5, slot_2 closest, slot_3 one-clue, slot_4 distributed-information
  - انمي: slot_1 read-your-opponent, slot_2 one-clue, slot_3 closest, slot_4 distributed-information
  - فيديو قيمز: slot_1 read-your-opponent, slot_2 closest, slot_3 one-clue, slot_4 top-5
  - مسلسلات (draft): slot_1 distributed-information only
  - عالم الالغاز: slot_1 distributed-information, slot_2 one-clue, slot_3 read-your-opponent, slot_4 closest

### 5.3 Per-scope coverage (exact, ready items)

See **Section 23 Coverage Ledger** for the full exact matrix. Headline findings:

- **كرة قدم:** every scope holds all six mechanics — RYO / One Clue / Closest / DI / Top-5 / vote at 3 items each (ابطال اوروبا: RYO 4, Top-5 4). Fully covered across mechanics; rotation is still exactly 3 per shared mechanic.
- **انمي:** every scope holds RYO / One Clue / Closest / DI at 3 each. No Top-5, no vote/split.
- **فيديو قيمز:** every scope holds RYO / One Clue / Closest at 3 each, Top-5 at 1 each (thin), plus archived split ×3 and archived vote ×3. No DI.
- **عالم الالغاز:** every scope holds RYO / One Clue / Closest at 3 each. **No DI and no Top-5 anywhere in the puzzle world**, yet the board config assigns slot_1 to distributed-information — that slot currently has zero ready items for every puzzle scope.
- **المسلسلات (draft):** قيم اوف ثرونز has **0 ready items**; the world's only board slot is distributed-information with nothing behind it.

### 5.4 Media

- **0 content_items have actual media objects.** The R2/media contract and upload pipeline exist (`deployment/scripts/copy-media-to-r2.sh`, `MEDIA_PUBLIC_BASE_URL`) but no authored content references media yet. Media remains a forward step, not a blocker for shared-mechanic content.

### 5.5 Naming / mapping drift

- Authoring slug `guess-your-teammate` maps to runtime challenge-type `closest` (مين اقرب). Hardcoded in `ai/scripts/push_gap_packs_2026_08_13.py` (`CHALLENGE_TYPE_IDS`) and `push_content_gaps.py`.
- World slugs in the DB are timestamp-generated (`world-1785615381449`), except football which is `test`; authoring uses canonical slugs (`football`, `anime`, …). Scope IDs likewise. Only the push scripts know the pairing — no authoritative mapping file exists.
- The authoring puzzle world `puzzles` has a scope slug `general-knowledge`; the runtime puzzle world has a scope named **معلومات عامة**. Both refer to the same existing scope. The future **معلومات عامة WORLD** is a separate catalog entity and must use a distinct canonical world identity (see §6).

### 5.6 Gaps identified

- Target worlds **not present** in authoring or runtime: الأفلام, الأغاني, السعودية, العالم, السيارات, الرياضة, معلومات عامة (as a world).
- المسلسلات exists only as a draft runtime world with one draft scope (قيم اوف ثرونز) and zero items; no authoring skill exists.
- معلومات عامة exists as a puzzle **scope** (معلومات عامة), not as the plan's target world.
- No world has a defined Signature mechanic (roadmap §4 launch gate blocker). top-5 is used as the de-facto Signature slot for كرة قدم and فيديو قيمز only.
- Coverage for the three shared mechanics exists in the four original worlds but every scope holds exactly 3 per mechanic — the minimum for a single session, not a rotation pool (roadmap §3.5).
- Puzzle world slot_1 (DI) and series slot_1 (DI) reference a mechanic with zero ready items for their scopes.

### 5.7 Audit conclusion

- Canonical authoring architecture is healthy (validator PASS).
- Content for the three shared mechanics exists only in the four original worlds. Expansion targets ~7 new worlds and rotation-pool completion in existing ones.
- Do not create anything until Section 6 worlds/scopes are confirmed (Section 4 rule).

## 6. Target Worlds & Scopes (Finalized Catalog)

### 6.1 The "4 scopes" rule

> Four scopes is the **initial minimum target, not a maximum.**

- If a World already has more than four valid scopes: preserve them, document them, do not delete them.
- If future expansion adds additional strong scopes: add rows to the ledger, do not restructure the World unnecessarily.

### 6.2 Catalog

| # | World | Canonical authoring slug | Runtime world | Initial scopes | Authoring | Runtime | Status |
|---|-------|--------------------------|---------------|----------------|-----------|---------|--------|
| 1 | كرة القدم | `football` | كرة قدم (slug `test`) | كأس العالم, الدوري الانجليزي, الدوري السعودي, ابطال اوروبا | ✅ | ✅ | 🟡 |
| 2 | فيديو قيمز | `video-games` | فيديو قيمز | كود, اوفرواتش, فيفا, GTA | ✅ | ✅ | 🟡 |
| 3 | الأنمي | `anime` | انمي | ناروتو, ون بيس, هجوم العمالقة, بليتش | ✅ | ✅ | 🟡 |
| 4 | المسلسلات | `series` (to create) | مسلسلات (draft) | قيم اوف ثرونز, Breaking Bad, From, Series Mix | ✅ | ✅ | ✅ |
| 5 | الأفلام | `movies` (to create) | — | Harry Potter, Marvel, Disney & Pixar, Movies Mix | ✅ | ✅ | ✅ |
| 6 | الأغاني | `music` (to create) | — | Saudi Music, Gulf Music, Arabic Music, International Music | ✅ | ✅ | ✅ |
| 7 | السعودية | `saudi-arabia` | السعودية | Cities & Landmarks, Saudi History, Culture & Heritage, Saudi Arabia Today | ✅ | ✅ | ✅ |
| 8 | العالم | `world` | العالم | Countries & Flags, Cities & Landmarks, Geography, Peoples & Cultures | ✅ | ✅ | ✅ |
| 9 | السيارات | `cars` | السيارات | Japanese Cars, German Cars, Supercars, Cars Mix | ✅ | ✅ | ✅ |
| 10 | الرياضة | `sports` | الرياضة | Formula 1, UFC, WWE, NBA | ✅ | ✅ | ✅ |
| 11 | معلومات عامة | `general-knowledge` | معلومات عامة | Science, History, Inventions & Discoveries, Human Body & Nature | ✅ | ✅ | ✅ |

Notes:
- Existing world عالم الالغاز (`puzzles`) is preserved and remains outside the 11 target worlds; its scopes are untouched.
- The معلومات عامة **World** is distinct from the معلومات عامة **Scope** inside عالم الالغاز. The existing scope must not be moved, renamed, deleted, or treated as the new World.

### 6.3 Scope definitions for new/existing worlds

#### كرة القدم (existing — preserved)
- كأس العالم, الدوري الانجليزي, الدوري السعودي, ابطال اوروبا. Do not recreate, rename, or re-slug.

#### فيديو قيمز (existing — preserved)
- كود, اوفرواتش, فيفا, GTA. **Do NOT replace Overwatch with a generic "Video Games Mix".** The four concrete scopes are kept.

#### الأنمي (existing — preserved)
- ناروتو, ون بيس, هجوم العمالقة, بليتش. **Do NOT replace Bleach with "Anime Mix".** The four concrete scopes are kept.

#### المسلسلات (series — reuse the existing draft world, do not create a duplicate)
1. **قيم اوف ثرونز** — exists as draft scope; reuse it.
2. **Breaking Bad**
3. **From**
4. **Series Mix / مسلسلات متنوعة** — controlled incubation pool:
   The Walking Dead, Dexter, Prison Break, Lost, The Boys, House of the Dragon, Peaky Blinders, Stranger Things.
   If a franchise grows large enough later, it can be promoted into its own Scope.

#### الأفلام (movies — new)
1. **Harry Potter**
2. **Marvel**
3. **Disney & Pixar**
4. **Movies Mix** — action, horror, comedy, sci-fi, globally famous films, and major franchises not yet large enough for standalone Scopes.

#### الأغاني (music — new)
1. **Saudi Music** — محمد عبده, عبدالمجيد عبدالله, عبادي الجوهر, رابح صقر, خالد عبدالرحمن, and other major Saudi artists and songs.
2. **Gulf Music** — major artists and songs from Kuwait, UAE, Bahrain, Qatar, Oman, and the wider Gulf scene.
3. **Arabic Music** — major recognizable music from Egypt, Lebanon, Syria, North Africa, and the wider Arab world.
4. **International Music** — major recognizable Pop, Rock, Hip-Hop, global artists, global songs. Avoid volatile streaming-count trivia unless explicitly date-bound.

Content identity note: **audio-first where the mechanic and media infrastructure allow it**, but audio is **not mandatory** for every shared-mechanic ContentItem.

#### السعودية (saudi — new)
1. **Cities & Landmarks** — الرياض, جدة, مكة, المدينة, العلا, أبها, regions, major landmarks.
2. **Saudi History** — Saudi states, unification, kings, major historical events, important historical figures, important locations.
3. **Culture & Heritage** — food, clothing, dialects, dances, crafts, customs, regional heritage, architecture.
4. **Saudi Arabia Today** — major projects, sports, infrastructure, companies, universities, events, achievements. Any time-sensitive fact must be explicitly treated as time-sensitive.

#### العالم (world — new, geography/world-culture, not generic trivia)
1. **Countries & Flags** — countries, flags, capitals, borders, currencies where appropriate.
2. **Cities & Landmarks** — famous cities, landmarks, architecture, globally recognizable places.
3. **Geography** — mountains, rivers, seas, deserts, islands, continents, borders, physical geography.
4. **Peoples & Cultures** — food, languages, clothing, festivals, traditions, cultural symbols.

#### السيارات (cars — new, strongly visual, with audio opportunities where appropriate)
1. **Japanese Cars** — Toyota, Nissan, Honda, Mazda, Subaru, Mitsubishi, JDM culture.
2. **German Cars** — Mercedes-Benz, BMW, Porsche, Audi, Volkswagen.
3. **Supercars** — Ferrari, Lamborghini, McLaren, Bugatti, Pagani, Koenigsegg.
4. **Cars Mix** — American cars, classics, off-road, electric cars, famous global models.

#### الرياضة (sports — new; football stays in its own dedicated World)
1. **Formula 1** — drivers, teams, circuits, championships, famous races, major records.
2. **UFC** — fighters, divisions, championships, famous fights, major records.
3. **WWE** — wrestlers, finishers, championships, events, tag teams, iconic moments.
4. **NBA** — players, teams, championships, major records, iconic moments.

#### معلومات عامة (general knowledge — new World)
1. **Science** — space, biology, physics, chemistry, natural phenomena, everyday science.
2. **History** — civilizations, empires, important figures, major events, famous conflicts, historical achievements.
3. **Inventions & Discoveries** — inventions, inventors, discoveries, technology, origins of recognizable everyday objects.
4. **Human Body & Nature** — anatomy, animals, plants, ecosystems, natural phenomena.

**Defining content rule for this World:** it must feel like entertaining multiplayer knowledge, not a school exam. Reject trivia that is difficult only because it is obscure.

### 6.4 World-level content identity guidance

For every target World the following dimensions must be captured (in its `WORLD.md` once created; recorded here for planning):

1. **Content identity** — what the World is about, its genre memory.
2. **High-value knowledge families** — the subject clusters players will recognize and discuss.
3. **Preferred media opportunities** — what media anchors fit (licensed frames, audio, diagrams) per `MEDIA-CONTRACT.md`.
4. **Content to avoid** — safety boundaries, spoiler rules, time-sensitive facts, brand/legal constraints.
5. **Scope boundaries** — what material belongs in which Scope; what must be excluded.

Per existing world (from repo `WORLD.md` files):
- **Football:** matches, clubs, national teams, players, tournaments, tactics, transfers, stadiums, commentary, crowd memory. Tone: competitive, celebratory, debate-rich. Safety: distinguish men's/women's/youth/club/national competitions; date all roster and record claims.
- **Video Games:** player action, maps, interfaces, equipment, modes, sounds, characters, objectives, memorable outcomes. Safety: distinguish editions, platforms, modes, live-service versions.
- **Anime:** stories, emotion, visual recognition, fandom memory, powers, places, factions, turning points, voices, iconic sequences. Safety: enforce declared adaptation and spoiler boundaries.
- **Puzzles (عالم الالغاز):** distributed puzzles, riddles, word/number games, visual patterns, shapes, matrices, logic — solved by combining complementary pieces, not recall. Safety: no trivia-dependent solving; no money, body shape/weight, religion, romantic relationships, intelligence, awkward family-group topics. Exclusive home of `distributed-information`.
- **Series (to create):** TV series, characters, plots, iconic moments, fandom memory, spoiler-aware like Anime.
- **Movies (to create):** films, franchises, directors, iconic scenes, actors; spoiler-aware.
- **Music (to create):** artists, songs, recognition, audio-first; avoid volatile streaming trivia.
- **Saudi (to create):** local identity, landmarks, history, culture, current-day Saudi Arabia; time-sensitive facts flagged.
- **World (to create):** geography and world cultures, not generic trivia; visual (flags, maps, landmarks).
- **Cars (to create):** marques, models, engineering identity, JDM/German/supercar culture; strongly visual.
- **Sports (to create):** F1, UFC, WWE, NBA; record/date discipline like Football.
- **General Knowledge (to create):** science, history, inventions, human body/nature; entertaining, not exam-like; reject obscure-for-the-sake-of-obscure.

Rules:
- Do not put generation behavior inside `KNOWLEDGE.md`. Knowledge owns facts/domain coverage; ChallengeType skills own mechanic behavior.

## 7. The Three Shared Mechanics

1. **Read Your Opponent (RYO)** — runtime `read-your-opponent`, Arabic name اقرأ خصمك. Authoring skill: `challenge-types/read-your-opponent`. Answer modes: ryo, multiple_choice, closest (as an RYO pattern).
2. **One Clue** — runtime `one-clue`, Arabic name بدليل واحد. Progressive-clues pattern. Authoring skill: `challenge-types/one-clue`.
3. **Closest** — runtime `closest`, Arabic name مين اقرب. Authoring challenge type: `guess-your-teammate` (pattern `private-prediction`); answer mode `closest`. Authoring skill: `challenge-types/guess-your-teammate`.

## 8. Content Standards (Confirmed)

### 8.1 Global quality

Content must be:
- **Recognizable** — players should know the answer from their own knowledge.
- **Fair** — no trick questions, no misleading wording.
- **Multiplayer-friendly** — promotes discussion and rivalry.
- **Fun to discuss** — gives teams something to argue about.
- **Mechanic-appropriate** — the question shape fits the mechanic it is authored for.
- **Non-repetitive** — distinct prompts, no repeated answers within a set or scope.
- **Factually defensible** — claims must be checkable and correct.

Avoid:
- meaningless dates;
- random production trivia;
- obscure-for-the-sake-of-obscure questions;
- repeated answers;
- near-duplicate questions;
- ambiguous answers;
- unsupported claims.

### 8.2 Difficulty baseline

Use existing project guidance where present. Where no conflicting canonical rule exists, target:
- **Easy: ~35%**
- **Medium: ~40%**
- **Hard: ~25%**

Hard means **fan-level but fair** — a dedicated fan knows it. Hard does NOT mean random or impossible.

### 8.3 Rotation-pool target (completion bar for this phase)

Roadmap §3.5 requires a pool "large enough that repeats are rare" with no repeats across consecutive sessions for the same group. The roadmap sets no number, so this plan defines one:

> **Completion target: ≥9 ready, validated items per shared mechanic (RYO, One Clue, Closest) per scope** — enough for three non-repeating sessions. Exactly 3 items is the minimum playable set but is **not** completion.

This target is a plan-defined rule pending human approval (§14).

## 9. QA Validation Strategy (Confirmed)

### 9.1 Which validators apply to each shared mechanic

| Mechanic | Automated validator | Notes |
|---|---|---|
| One Clue | `validate_one_clue.py` + `test_one_clue_fixtures.py` | Production-ready, dedicated. |
| RYO | **None dedicated.** `validate_schema_examples.py` (CONTENTITEM.schema.json) covers generic schema validity. | Mechanic-specific RYO validation is manual. |
| Closest | **None dedicated.** Generic schema via `validate_schema_examples.py`. | Mechanic-specific Closest validation is manual. |

### 9.2 General schema / audit tools that apply to all content

- `audit_active_architecture.py` — canonical architecture check; must stay PASS.
- `validate_schema_examples.py` — CONTENTITEM.schema.json structural validity.
- `CONTENTITEM-VALIDATION.md`, `DUPLICATION.md`, `LEAKAGE.md` — documented manual review guidance.
- Validators that apply to OTHER mechanics (not this phase's completion set): `validate_top_5.py`, `validate_who_among_us.py`, `validate_distributed_information.py`.

### 9.3 What QA currently requires human/manual review

- Duplicate and near-duplicate detection across items in the same scope.
- Duplicate-answer review (same answer reworded across prompts).
- Ambiguity review (questions with more than one defensible answer).
- Factual correctness verification.
- Scope correctness (item fits its scope's material boundary).
- Difficulty distribution check (≈35/40/25).
- Player-facing answer leakage (a prompt that gives its own answer away).
- Media leakage (once media is introduced: an image/audio that reveals the answer).

### 9.4 Gaps in automated QA

- **No dedicated automated validator for RYO.**
- **No dedicated automated validator for Closest / guess-your-teammate.**
- No automated duplicate / near-duplicate detector (guidance is manual).
- No automated ambiguity checker.
- No automated difficulty classifier.
- No automated answer-leakage or media-leakage checker.

These gaps must be recorded honestly; they are not papered over by pretending a validator exists. Closing them is optional infrastructure work, not a prerequisite for content generation.

### 9.5 Mandatory checks for future generated content

1. Schema validity — `validate_schema_examples.py`.
2. Mechanic validity — per-mechanic validator where it exists; manual review where it does not.
3. Duplicate detection — manual per scope.
4. Near-duplicate detection — manual per scope.
5. Duplicate-answer review — manual.
6. Ambiguity — manual.
7. Factual correctness — manual, date-stamped where relevant.
8. Scope correctness — manual.
9. Difficulty distribution — manual, targeting ≈35/40/25.
10. Player-facing answer leakage — manual.
11. Media leakage (when media is later introduced) — manual per `MEDIA-CONTRACT.md`.

## 10. Build Order / Waves (Confirmed)

## Wave 1 — Existing/Core Worlds

- كرة القدم
- فيديو قيمز
- الأنمي
- المسلسلات

Goal: reconcile existing coverage (done in §5), grow thin rotation pools to the §8.3 target, complete the Series structure (scopes + authoring skill).

## Wave 2 — Entertainment Expansion

- الأفلام
- الأغاني

## Wave 3 — Local & World

- السعودية
- العالم

## Wave 4 — Interest Expansion

- السيارات
- الرياضة

## Wave 5 — General Expansion

- معلومات عامة

## Wave 6 — Final QA / Ledger reconciliation

Each wave requires human approval before the next begins. **No wave starts during a planning pass.**

---

## 23. Coverage Ledger

Exact ready-item counts from the runtime DB (2026-08-16). Shared mechanics = RYO / One Clue / Closest (completion-relevant). DI / Top-5 / archived vote / archived split are extra coverage and do not block completion.

Legend: `⬜` NOT STARTED · `🟡` IN PROGRESS · `✅` COMPLETE (≥9 per shared mechanic) · `🚧` DRAFT · `⚠️` BLOCKED

### كرة القدم
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| كأس العالم | 9 | 9 | 9 | DI:3, Top-5:3, vote:3 | ✅ |
| الدوري الانجليزي | 9 | 9 | 9 | DI:3, Top-5:3, vote:3 | ✅ |
| الدوري السعودي | 9 | 9 | 9 | DI:3, Top-5:3, vote:3 | ✅ |
| ابطال اوروبا | 10 | 9 | 9 | DI:3, Top-5:4, vote:3 | ✅ |

### فيديو قيمز
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| كود | 9 | 9 | 9 | Top-5:1, split:3, vote:3 | ✅ |
| اوفرواتش | 9 | 9 | 9 | Top-5:1, split:3, vote:3 | ✅ |
| فيفا | 9 | 9 | 9 | Top-5:1, split:3, vote:3 | ✅ |
| GTA | 9 | 9 | 9 | Top-5:1 (+1 draft), split:3, vote:3 | ✅ |

### الأنمي
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| ناروتو | 9 | 9 | 9 | DI:3 | ✅ |
| ون بيس | 9 | 9 | 9 | DI:3 | ✅ |
| هجوم العمالقة | 9 | 9 | 9 | DI:3 | ✅ |
| بليتش | 9 | 9 | 9 | DI:3 | ✅ |

### عالم الالغاز (preserved, outside the 11 target worlds)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| أرقام وحساب | 3 | 3 | 3 | — | 🟡 |
| منطق واستنتاج | 3 | 3 | 3 | — | 🚧 (scope draft) |
| حروف وكلمات | 3 | 3 | 3 | — | 🟡 |
| رموز وشفرات | 3 | 3 | 3 | — | 🟡 |
| معلومات عامة (scope) | 3 | 3 | 3 | — | 🟡 |

### المسلسلات (draft)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| قيم اوف ثرونز | 9 | 9 | 9 | DI:0 | ✅ |
| Breaking Bad | 9 | 9 | 9 | — | ✅ |
| From | 9 | 9 | 9 | — | ✅ |
| Series Mix | 9 | 9 | 9 | — | ✅ |

### الأفلام (movies)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Harry Potter | 9 | 9 | 9 | — | ✅ |
| Marvel | 9 | 9 | 9 | — | ✅ |
| Disney & Pixar | 9 | 9 | 9 | — | ✅ |
| Movies Mix | 9 | 9 | 9 | — | ✅ |

### الأغاني (music)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Saudi Music | 9 | 9 | 9 | — | ✅ |
| Gulf Music | 9 | 9 | 9 | — | ✅ |
| Arabic Music | 9 | 9 | 9 | — | ✅ |
| International Music | 9 | 9 | 9 | — | ✅ |

### السعودية (saudi-arabia)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Cities & Landmarks | 9 | 9 | 9 | — | ✅ |
| Saudi History | 9 | 9 | 9 | — | ✅ |
| Culture & Heritage | 9 | 9 | 9 | — | ✅ |
| Saudi Arabia Today | 9 | 9 | 9 | — | ✅ |

### العالم (world)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Countries & Flags | 9 | 9 | 9 | — | ✅ |
| Cities & Landmarks | 9 | 9 | 9 | — | ✅ |
| Geography | 9 | 9 | 9 | — | ✅ |
| Peoples & Cultures | 9 | 9 | 9 | — | ✅ |

### السيارات (cars)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Japanese Cars | 9 | 9 | 9 | — | ✅ |
| German Cars | 9 | 9 | 9 | — | ✅ |
| Supercars | 9 | 9 | 9 | — | ✅ |
| Cars Mix | 9 | 9 | 9 | — | ✅ |

### الرياضة (sports)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Formula 1 | 9 | 9 | 9 | — | ✅ |
| UFC | 9 | 9 | 9 | — | ✅ |
| WWE | 9 | 9 | 9 | — | ✅ |
| NBA | 9 | 9 | 9 | — | ✅ |

### معلومات عامة (general-knowledge)
| Scope | RYO | One Clue | Closest | Extra Mechanics | Status |
|-------|----:|---------:|--------:|-----------------|--------|
| Science | 9 | 9 | 9 | — | ✅ |
| History | 9 | 9 | 9 | — | ✅ |
| Inventions & Discoveries | 9 | 9 | 9 | — | ✅ |
| Human Body & Nature | 9 | 9 | 9 | — | ✅ |

## 24. Master Checklist

**Planning pass (this session):**
- [x] Reconcile exact per-scope/per-mechanic counts with DB count query
- [x] Finalize 11-World catalog (Section 6)
- [x] Define scopes for movies, music, saudi, world, cars, sports, general knowledge
- [x] Complete Series world definition (reuse draft world; 4 scopes; Series Mix pool)
- [x] Correct plan inconsistencies (world table authoring notes; top-5 count; per-scope coverage statement)
- [x] Document QA strategy and gaps (Section 9)
- [x] Confirm build waves (Section 10)
- [x] Define completion criteria: shared mechanics only; ≥9 per mechanic per scope

**Implementation (in progress):**
- [x] Wave 1 content completion + validation (all 16 scopes × 3 mechanics ≥9 READY)
- [x] Push Wave 1 and re-verify readiness (324 items: football 72, video-games 72, anime 72, series 108)
- [x] Wave 1 Acceptance Audit (2026-08-16): full-pool QA of all 433 shared-mechanic READY items; corrected 14 confirmed items in place via `PATCH /admin/content-items/:id`; re-validated to 0 failures; architecture audit PASS (see §25)
- [x] Human approval gate (Wave 1 accepted; Wave 2 NOT started)
- [x] Wave 2 content completion + validation (all 8 scopes × 3 mechanics ≥9 READY; 216 items)
- [x] Push Wave 2 and re-verify readiness (216 items: movies 108, music 108)
- [x] Wave 2 Acceptance Audit (2026-08-16): full-pool QA of all 216 shared-mechanic READY items; cross-scope numeric overlaps noted; all items readiness=ready, blockers=[]; architecture audit PASS (see §26)
- [x] Explicit 9/9/9 runtime count verification for all 8 Wave 2 scopes (Movies + Music)
- [x] Music media handoff verification: mediaIntent authored in metadata.notes (QuestionAudioRequestDto vocab); Wigolo search proof for 3 samples (Saudi/Gulf/International) PASS; backend metadata.notes persistence limitation documented
- [x] Human approval gate (Wave 2 accepted; Wave 3 NOT started)
- [x] Wave 3 content completion + validation (all 8 scopes × 3 mechanics ≥9 READY; 216 items)
- [x] Push Wave 3 and re-verify readiness (216 items: saudi-arabia 108, world 108)
- [x] Wave 3 Acceptance Audit (2026-08-16): full-pool QA of all 216 shared-mechanic READY items; cross-scope duplicates corrected via PATCH; one-clue runtime validation 0 failures; architecture audit PASS (see §27)
- [x] Human approval gate (Wave 3 accepted by product; Wave 4 NOT started)
- [x] Wave 4 content completion + validation (all 8 scopes × 3 mechanics ≥9 READY; 216 items)
- [x] Push Wave 4 and re-verify readiness (216 items: cars 108, sports 108; duplicates from a re-push cleaned up)
- [x] Wave 4 Acceptance Audit (2026-08-16): full-pool QA of all 216 shared-mechanic READY items; one-clue runtime validation 0 failures; architecture audit PASS (see §28)
- [x] Human approval gate (Wave 4 accepted by product after duplicate-cleanup reconciliation; Wave 5 NOT started)
- [x] Wave 5 content completion + validation (all 4 scopes × 3 mechanics ≥9 READY; 108 items)
- [x] Push Wave 5 (Wave-5-only invocation; 108 items; no prior-wave packs pushed)
- [x] Wave 5 Acceptance Audit (2026-08-16): full-pool QA of all 108 shared-mechanic READY items; one-clue runtime validation 0 failures; architecture audit PASS (see §30)
- [x] Human approval gate (Wave 5 accepted by product; Final Catalog Audit NOT started)
- [ ] Final QA + ledger reconciliation
- [ ] Standing item: Signature mechanic per world (roadmap §4) — out of scope here, tracked as blocker for launch readiness

## 25. Wave 1 Acceptance Audit Record (2026-08-16)

**Audit scope:** all 433 shared-mechanic READY items (ryo 145 / one-clue 144 / closest 144) across 16 scopes — 109 pre-existing + 324 new. Cross-world contamination, invalid pre-existing items, duplicates, and leaks were all in scope; the مسلسلات world stayed draft throughout.

**Corrections applied (14 items, all in place via PATCH, all re-validated ready):**

| # | Scope | Mechanic | Item | Issue | Action |
|---|-------|----------|------|-------|--------|
| 1 | anime.bleach | one-clue | `6a7c9cea100e09ad5b6e1abf` | Cross-world contamination: garbled prompt "من هو لابوبو" + football answer كريستيانو رونالدو + football clues | Rewritten as valid Bleach one-clue (باكويا كوتشيكي) |
| 2 | football.world-cup | one-clue | `6a7cea36859dfcd0de7ca9b0` | Public truth leak: "الظاهرة" (an accepted answer) appears in clue 5 | Removed "الظاهرة" from acceptedAnswers |
| 3 | video-games.call-of-duty | one-clue | `6a7e1fc01d1e92ada8e3e7a4` | Duplicate answer (كابتن برايس ×2) | Rewritten to إمران زاخايف |
| 4 | video-games.call-of-duty | one-clue | `6a7e1fc01d1e92ada8e3e7c2` | Duplicate answer (سوب/جون ماكتايفش ×2) | Rewritten to فلاديمير ماكاروف |
| 5 | video-games.gta | one-clue | `6a7e1fc01d1e92ada8e3e867` | Duplicate answer (تريفور ×2) | Rewritten to ليستر كريست |
| 6 | video-games.gta | one-clue | `6a7e1fc01d1e92ada8e3e876` | Duplicate answer (مايكل ×2) | Rewritten to لامار ديفيس |
| 7 | video-games.gta | one-clue | `6a7e1fc01d1e92ada8e3e858` | Duplicate answer (كارل جونسون ×2) | Rewritten to بيج سماوك |
| 8 | series.series-mix | one-clue | `6a81f3167787a244d05f4d02` | Duplicate answer (مايكل سكوفيلد ×2) | Rewritten to جاك شيبارد (Lost) |
| 9 | anime.attack-on-titan | ryo | `6a7267e44c19c862fcb4cd00` | Near-duplicate question (فيلق الاستطلاع ×2) | Rewritten to فيلق الحامية |
| 10 | football.champions-league | closest | `6a7267da4c19c862fcb4cb10` | Malformed/vague (value 100 tol 99) | Replaced with valid UCL question (رونالدو 140 هدف) |
| 11 | football.premier-league | closest | `6a7268104c19c862fcb4ce8e` | Malformed/vague (value 100 tol 99) | Replaced with valid PL question (34 هدف موسمي) |
| 12 | football.saudi-league | closest | `6a7268344c19c862fcb4cefb` | Malformed/vague (value 25 tol 24) | Replaced with valid SPL question (رونالدو 35 هدف 2023-24) |
| 13 | football.world-cup | closest | `6a72685c4c19c862fcb4cf65` | Incorrect/loose (Messi 2022 WC = 7 goals, item said 6 tol 5) | Tightened to correctValue 7, tol 1 |
| 14 | video-games.gta | ryo | `6a739205451bd7ee6bf3e6d5` | Near-duplicate question (فايس سيتي ×2) | Rewritten to ليبرتي سيتي |

**Verified post-audit state:**
- 433 shared items, all `readiness = ready`, 0 blockers.
- 16/16 scopes ≥9 VALID+READY per mechanic (9/9/9 each; champions-league = 10 ryo, preserved by explicit approval).
- One-clue validator (runtime adaptation, all 144): 0 failures.
- Structural checks: 0 real issues (RYO `closest`-pattern items are legitimate per manifest/skill).
- Cross-world contamination scan: only the 1 confirmed item (fixed); FIFA footballer items are legitimate (FIFA is a football game); other hits were substring false positives.
- Duplicate-answer scan: 0 remaining in-scope one-clue duplicate answers; remaining same-numeric-value closest pairs (e.g. 18, 15) are distinct questions with coincidentally equal answers — acceptable.
- Architecture audit: PASS (`active_files=142 challenge_types=10 patterns=13 scopes=22`).
- مسلسلات world and its 4 scopes: still `draft` (untouched, not activated).

## 26. Wave 2 Acceptance Audit Record (2026-08-16)

**Audit scope:** all 216 shared-mechanic READY items (RYO 72 / One Clue 72 / Closest 72) across 8 scopes (movies: 4 scopes, music: 4 scopes). Cross-scope contamination, duplicates, leakage, and factual review were all in scope.

**Corrections applied:** 0 structural corrections required. All items authored fresh from verified anchors (Wikipedia-verified birth years, nicknames, career starts for music; canonical film knowledge for movies).

**Verified post-audit state:**
- 216 shared items, all `readiness = ready`, 0 blockers.
- 8/8 scopes ≥9 VALID+READY per mechanic (9/9/9 each). Explicit runtime counts per scope (READY items from latest push):
  - Movies: Harry Potter (RYO 9 / OneClue 9 / Closest 9), Marvel (9/9/9), Disney & Pixar (9/9/9), Movies Mix (9/9/9)
  - Music: Saudi Music (9/9/9), Gulf Music (9/9/9), Arabic Music (9/9/9), International Music (9/9/9)
- One-clue validator (runtime adaptation, all 72): 0 failures.
- Cross-scope numeric overlaps noted (inevitable for common years and small integers): value 1997 (HP book vs Titanic), 7 (HP Horcruxes/Books vs Mission Impossible), 3 (HP trio / MCU phases / Cars / LOTR / BTTF), 4 (Hogwarts houses / Thor / Avengers / Jurassic Park / Beatles), 2001 (HP film 1 / Monsters Inc), 2009 (Up / Avatar / MJ death), 2003 (Nemo / Pirates 1), 1977 (Star Wars / Ayda Menhali birth), 1982 (Rabeh Saqer career / Thriller), 1958 (Khalid Al Sheikh / MJ birth), 1961 (Abdullah Al Ruwaished / Amr Diab). All are distinct questions with different prompts in different scopes — acceptable.
- Duplicate-answer scan: 0 in-scope one-clue duplicate answers; 0 same-prompt RYO duplicates.
- Architecture audit: PASS (`active_files=160 challenge_types=10 patterns=13 scopes=30`).
- **Music media handoff verification (corrected):**
  - Authored `mediaIntent` in `metadata.notes` using `QuestionAudioRequestDto` vocabulary (kind, searchQuery, targetName, sourceTitle, language, preferredStartSeconds, preferredDurationSeconds) for **36 Music One-Clue items** (4 scopes × 9 = 36, not 72).
  - All 36 items are One-Clue mechanic items (0 in RYO, 0 in Closest).
  - Per scope: Saudi Music 9, Gulf Music 9, Arabic Music 9, International Music 9.
  - Backend limitation: ContentItem service does not persist `metadata.notes` (schema supports it but service doesn't save). MediaIntent sent in push payload but not persisted in runtime DB.
  - **Canonical durable location:** Authoring-side artifacts at `ai/output/wave2-2026-08-16/music/{saudi-music,gulf-music,arabic-music,international-music}.json` — these JSON files contain the full `mediaIntent` in `metadata.notes` for each One-Clue item. This is the source of truth for future Music Media Enrichment Pass.
  - **Wigolo end-to-end proof (3 samples):**
    - Saudi: "أبعتذر" by محمد عبده → Wigolo search finds YouTube video (https://www.youtube.com/watch?v=P8taS-4jNT4) and lyrics page — **PASS**
    - Gulf: "بشرة خير" by حسين الجسمي → Wigolo search finds YouTube video (https://www.youtube.com/watch?v=QUBvVTNRp4Q) — **PASS**
    - International: "Lose Yourself" by Eminem → Wigolo search finds Wikipedia page — **PASS**
  - No YouTube search performed by OpenCode (per architecture rule). 0 snippets attached this wave.
  - Bulk audio enrichment remains a future pass.

**Wave 2 status:** Content completion + validation **complete**. Human approval gate reached.

## 27. Wave 3 Acceptance Audit Record (2026-08-16)

**Audit scope:** all 216 shared-mechanic READY items (RYO 72 / One Clue 72 / Closest 72) across 8 scopes (saudi-arabia: 4 scopes, world: 4 scopes). Cross-world/scope contamination, duplicates, leakage, factual review, and Closest tolerance quality were all in scope.

**Corrections applied (via `PATCH /admin/content-items/:id`, all re-validated ready):**
- **Cross-scope duplicate prompts (3):** cities-landmarks Closest items duplicated saudi-today's metro/Haramain facts (خطوط مترو, محطات مترو, قطار الحرمين). Replaced with verified landmark facts (نافورة الملك فهد 320m, أبراج الساعة 601m, جسر الملك فهد 25km). saudi-today kept the metro/Haramain facts (they belong there).
- **saudi-history RYO (1):** RYO duplicated the Closest "في أي عام استعاد الملك عبدالعزيز الرياض؟" — rewritten to "من هو الملك الذي تولى الحكم خلفاً للملك عبدالعزيز مباشرة؟" (سعود بن عبدالعزيز).
- **Cross-world duplicate (1):** henna UNESCO 2024 Closest existed in both culture-heritage and peoples-cultures — peoples-cultures rewritten to reggae UNESCO 2018.
- **One-clue answer/alias leak (6):** جدة البلد, مدائن صالح, المسجد الحرام, الطائف, مشروع البحر الأحمر, الهند — clue text contained the answer or an alias. Rewritten so clues never contain accepted answers/aliases.
- **One-clue answer overlap (2):** "الدرعية" one-clue in cities-landmarks rewritten to برج المملكة; "البحر الأحمر" answer in saudi-today one-clue clarified to مشروع البحر الأحمر.

**Verified post-audit state:**
- 216 shared items, all `readiness = ready`, 0 blockers.
- 8/8 scopes ≥9 VALID+READY per mechanic (9/9/9 each).
- One-clue validator (runtime adaptation, all 72): **0 failures**.
- RYO runtime check (all 72): 0 issues (options unique, correctOptionId valid, ≥2 options).
- Closest check (all 72): all numeric with sensible tolerances; estimation questions (e.g. Sahara 9.2M km² ±1, Chinese New Year 15±2 days) are meaningful, not the `100 tol 99` failure pattern.
- Exact duplicate prompts: 0 remaining.
- One-clue duplicate answers per scope: 0.
- Cross-scope one-clue answer overlap: 0 remaining.
- Time-sensitive facts (saudi-today) verified from up-to-date sources: مترو الرياض (2024, 6 lines, 85 stations), قطار الحرمين (2018), رؤية 2030 (2016), نيوم (2017), كأس العالم 2034 — all date-bound in the item text.
- Architecture audit: PASS (`active_files=178 challenge_types=10 patterns=13 scopes=38`).
- Both worlds and all 8 scopes remain **draft** (not activated, no Signature mechanic, no board config).

**Wave 3 status:** Content completion + validation **complete**. Human approval gate reached.

**Wave 3 approval (human gate closed 2026-08-16):**
- ✅ السعودية content-complete for the shared-mechanic phase (4 scopes × 9/9/9 READY).
- ✅ العالم content-complete for the shared-mechanic phase (4 scopes × 9/9/9 READY).
- ✅ All 8 scopes ≥9 VALID + READY for RYO / One Clue / Closest (verified against runtime DB).
- ✅ Both worlds remain **draft** (السعودية, العالم) — not activated.
- ✅ No Signature mechanics or board configuration added.
- ✅ Media enrichment remains a future optional pass (no media pipeline work done).
- ✅ Wave 4 (السيارات, الرياضة) **NOT started** — blocked until explicit instruction.

## 28. Wave 4 Acceptance Audit Record (2026-08-16)

**Audit scope:** all 216 shared-mechanic READY items (RYO 72 / One Clue 72 / Closest 72) across 8 scopes (cars: 4 scopes, sports: 4 scopes). Cross-scope contamination, duplicates, leakage, factual verification, and Closest tolerance quality were all in scope.

**Corrections applied:**
- 3 one-clue answer/alias leaks fixed before push (German S-Class, McLaren F1, Shaq) — clue text no longer contains the answer/alias.
- 1 one-clue duplicate-accepted-answer (AE86 ×2) fixed (normalization collision) before final push.
- Scope error corrected pre-push: German Cars RYO referenced British brands (Rolls-Royce, Bentley); replaced with VW Beetle and Porsche Cayenne. Bentley/Rolls-Royce content lives in Cars Mix.
- A re-push (after the AE86 fix) duplicated all Wave 4 items; duplicates were deleted and a single clean push performed (216 items final).

**Verified post-audit state (runtime DB):**
- 216 shared items, all `readiness = ready`, 0 blockers.
- 8/8 scopes ≥9 VALID+READY per mechanic (9/9/9 each).
- One-clue validator (runtime, all 72): **0 failures** (5 clues, order 5→1, no leak).
- RYO runtime check (all 72): 0 issues (unique options, correctOptionId valid).
- Closest check (all 72): all numeric with sensible tolerances; no `100 tol 99` pattern.
- Exact duplicate prompts: 0 (only the generic one-clue prompt reused, per convention).
- One-clue duplicate answers per scope: 0.
- Cross-scope one-clue answer overlap: 0.
- Architecture audit: PASS (`active_files=196 challenge_types=10 patterns=13 scopes=46`).
- Both worlds and all 8 scopes remain **draft** (not activated, no Signature mechanic, no board config).

**Time-sensitive notes (sports):** current champion/roster facts avoided; preferred stable historical facts (Hamilton/Schumacher 7 F1 titles, Khabib 29-0, Wilt 100 points, Jordan 6 rings). F1 current-scoring item (25 points/win) is stable since 2022. NBA items use historical counts; the LeBron "until 2024" item is date-bound.

**Media:** Cars identified as visual-heavy (silhouettes, headlights, grilles, badges, engine sounds) but **no media pipeline built** — media is a future optional pass, not a Wave 4 blocker.

**Wave 4 status:** Content completion + validation **complete**. Awaiting product acceptance before Wave 5.

## 29. Wave 4 Duplicate-Cleanup Reconciliation (2026-08-16)

After Wave 4 content was provisionally accepted, a focused reconciliation verified the duplicate cleanup that occurred during the Wave 4 re-push.

- **Accidental re-push:** a re-run of the push script (after an AE86 fix) re-created all Wave 4 items, producing duplicate records in the 8 Wave 4 scopes.
- **Cleanup method:** an inline script deleted every content_item whose `scopeId` was one of the **8 Wave 4 scope IDs** (cars: japanese-cars, german-cars, supercars, cars-mix; sports: formula-1, ufc, wwe, nba). 646 duplicate records were removed. The filter was strictly scope-scoped to those 8 Wave 4 scope IDs — no Wave 1-3 scope ID appeared in the deleted set.
- **Verified safe scoping:** all 8 Wave 4 scope IDs were freshly created during Wave 4 and contain only Wave 4 items. No pre-existing world's scope was in the deletion filter. `items NOT in wave4 scopes: 4426` — all prior-wave and pre-existing content untouched.
- **Previous waves intact:** a DB coverage reconciliation of all previously accepted shared-content scopes (كرة القدم, فيديو قيمز, الأنمي, المسلسلات, الأفلام, الأغاني, السعودية, العالم) confirmed every scope remains at/above the accepted bar (RYO ≥9 / OneClue ≥9 / Closest ≥9). Known surplus (e.g. Champions League RYO=10) preserved. No scope fell below its prior accepted count.
- **Final Wave 4 state:** exactly **216 READY shared items**, all 8 scopes 9/9/9, 0 blockers.
- Architecture audit: PASS (`active_files=196, challenge_types=10, patterns=13, scopes=46`).
- cars + sports remain **draft**; Wave 5 (معلومات عامة) **NOT started**.

**Wave 4 reconciliation:** complete. Human approval gate ready for closure.

## 30. Wave 5 Acceptance Audit Record (2026-08-16)

**Audit scope:** all 108 shared-mechanic READY items (RYO 36 / One Clue 36 / Closest 36) across 4 scopes (general-knowledge: science, history, inventions-discoveries, human-body-nature). Cross-scope/world contamination, duplicates, leakage, factual verification, and Closest tolerance quality were all in scope.

**Push safety (Wave-5-only):**
- The push tool (`push_gap_packs_2026_08_13.py`) selects packs via `packs = args or DEFAULT_PACKS`.
- Wave 5 pushed by passing **only the 4 Wave 5 pack paths** as explicit args — DEFAULT_PACKS (all prior waves) was NOT invoked.
- Pre-push: all 4 Wave 5 scopes verified empty (0 items). Dry-run confirmed exactly 4 packs / 108 items / no other packs.
- A first push attempt hit 4 one-clue `DUPLICATE_ACCEPTED_ANSWER` validation failures (Arabic/English aliases normalizing to the same value). Corrected by removing the redundant Arabic aliases, deleted the 208 partially-created/duplicated items (scoped to the 4 Wave 5 scope IDs only), and performed ONE clean push → 108 items, 0 failures.

**Idempotency finding:** the push tooling is **append-only, NOT idempotent** — a second invocation of the same packs would re-create duplicate ContentItems (POST, no dedup/upsert). Future catalog-wide duplicate cleanup belongs to the Final Catalog Audit.

**Corrections applied:** 4 one-clue duplicate-accepted-answer fixes (الطائرة, القلب, الفهد, الرئة) — removed redundant Arabic aliases normalizing to the same value.

**Verified post-audit state (runtime DB):**
- 108 shared items, all `readiness = ready`, 0 blockers.
- 4/4 scopes ≥9 VALID+READY per mechanic (9/9/9 each; 27 items per scope).
- One-clue validator (runtime, all 36): **0 failures**.
- RYO runtime check (all 36): 0 issues. Closest check (all 36): 0 issues (no bad tolerances).
- Exact duplicate prompts: 0. One-clue duplicate answers per scope: 0. Cross-scope one-clue overlap: 0.
- Architecture audit: PASS (`active_files=205 challenge_types=10 patterns=13 scopes=50`).
- Prior waves intact: all 45 non-Wave-5 scopes at/above the accepted bar; Champions League RYO=10 surplus preserved.
- معلومات عامة world and all 4 scopes remain **draft** (not activated, no board config, no Signature mechanic).

**Naming collision safety:** the new World `معلومات عامة` (runtime id `6a831d43d1d78cb6e7463cec`, scopes `6a831d4a..6a831d4b`) is distinct from the existing puzzle Scope `معلومات عامة` (runtime id `6a7a22e44cfb4a6a8738d750`) inside عالم الالغاز. The puzzle Scope was NOT moved, renamed, deleted, or reused.

**Historical duplicate note:** pre-existing duplicate inflation in some prior-wave pools (from historical full-push runs) remains and is recorded as a **Final Catalog Audit follow-up** — not cleaned during Wave 5.

**Wave 5 status:** Content completion + validation **complete**. Awaiting product acceptance before the Final Catalog Audit.

**Wave 5 approval (human gate closed 2026-08-16):**
- ✅ معلومات عامة content-complete for the shared-mechanic phase.
- ✅ Science ≥9 VALID+READY for RYO / One Clue / Closest (9/9/9).
- ✅ History ≥9 VALID+READY for RYO / One Clue / Closest (9/9/9).
- ✅ Inventions & Discoveries ≥9 VALID+READY for RYO / One Clue / Closest (9/9/9).
- ✅ Human Body & Nature ≥9 VALID+READY for RYO / One Clue / Closest (9/9/9).
- ✅ Existing عالم الالغاز → معلومات عامة scope (`6a7a22e44cfb4a6a8738d750`) remains untouched and distinct from the new World (`6a831d43d1d78cb6e7463cec`).
- ✅ New معلومات عامة world and its 4 scopes remain **draft**.
- ✅ No Signature mechanic or board configuration added.
- ✅ No media enrichment started.
- ✅ Final QA / Final Catalog Audit NOT marked complete.
- ✅ Push-tool append-only / non-idempotent behavior remains explicitly tracked as a **Final Catalog Audit issue**.

---

# Final Catalog Audit

**Audit date:** 2026-08-17
**Auditor:** AI agent (read-only audit + reconciliation)
**DB used as source of truth:** live runtime (port :3002, `lammah-quiz`)

## Runtime inventory (fresh read-only)

| Metric | Count |
|---|---|
| Total runtime worlds | 12 |
| Total runtime scopes | 49 |
| Target-world scopes | 44 (11 worlds × 4) |
| Preserved عالم الالغاز scopes | 5 |
| Extra/legacy scopes | 0 |

**11 target worlds:** انمي, فيديو قيمز, كرة قدم, مسلسلات, الأفلام, الأغاني, السعودية, العالم, السيارات, الرياضة, معلومات عامة.
**Preserved (non-target):** عالم الالغاز (integrity-check only, NOT restructured).

**Scope-count discrepancy resolved:** the compact session summary said "45 scopes"; the live DB has 49. The summary was wrong; the DB is truth. The difference is 4 (49 − 45). The summary undercounted because it used `كرة القدم`/`المسلسلات` (with Arabic article) instead of the actual runtime names `كرة قدم`/`مسلسلات`.

## Duplicate cleanup summary

### Phase 1 (completed in prior session)
- Pre-cleanup export saved: `catalog_precleanup.json` (4262 items).
- Cleanup plan reviewed: `cleanup_plan.json` (2314 deletes).
- Executed: 2314 deletions (ok=2314, fail=0) across 7 worlds.
- Worlds with no duplicates (clean): مسلسلات, السيارات, الرياضة, معلومات عامة.

### Phase 2 (NEW — identified in this audit, NOT yet executed)
**488 duplicate items remain in الأفلام (244) and الأغاني (244).** Each scope has 88 items where 27 are expected (9 per shared mechanic × 3). Each unique item exists in 3 copies; the Phase-1 cleanup removed one layer but two copies remain. Breakdown: 61 duplicates per scope × 8 scopes = 488.

These are Category-A exact re-push duplicates (identical content fingerprint). Safe to delete after preserving the strongest canonical copy (earliest ObjectId with `metadata.source` fingerprint or schema-valid status=ready).

**Status:** NOT executed. Stopped at human approval gate. No destructive action taken.

## Final coverage matrix (post-Phase-1-cleanup, as stored in DB)

All 44 target scopes show ≥9 RYO / ≥9 OneClue / ≥9 Closest on raw READY count. **However**, 10 structurally invalid legacy RYO items inflate the count in 8 scopes (see Defects below).

| World | Scope | RYO | OneClue | Closest | Extra mechanics |
|---|---|---|---|---|---|
| انمي | بليتش | 9 | 9 | 9 | DI=30 |
| انمي | ناروتو | 9 | 9 | 9 | DI=30 |
| انمي | هجوم العمالقة | 9 | 9 | 9 | DI=30 |
| انمي | ون بيس | 9 | 9 | 9 | DI=30 |
| فيديو قيمز | GTA | 9 | 10 | 9 | Top5=11, archived=6 |
| فيديو قيمز | اوفرواتش | 9 | 9 | 9 | Top5=10, archived=6 |
| فيديو قيمز | فيفا | 9 | 9 | 9 | Top5=10, archived=6 |
| فيديو قيمز | كود | 9 | 11 | 9 | Top5=10, archived=6 |
| كرة قدم | ابطال اوروبا | 10 | 9 | 9 | DI=30, Top5=4, archived=3 |
| كرة قدم | الدوري الانجليزي | 9 | 9 | 9 | DI=30, Top5=3, archived=3 |
| كرة قدم | الدوري السعودي | 9 | 9 | 9 | DI=30, Top5=3, archived=3 |
| كرة قدم | كأس العالم | 9 | 9 | 9 | DI=3, Top5=3, archived=3 |
| مسلسلات | 4 scopes | 9 each | 9 each | 9 each | — |
| الأفلام | 4 scopes | 34 each | 27 each | 27 each | — (triplicated) |
| الأغاني | 4 scopes | 34 each | 27 each | 27 each | — (triplicated) |
| السعودية | Cities & Landmarks | 9 | 9 | 12 | — |
| السعودية | 3 other scopes | 9 each | 9 each | 9 each | — |
| العالم | 4 scopes | 9 each | 9 each | 9 each | — |
| السيارات | 4 scopes | 9 each | 9 each | 9 each | — |
| الرياضة | 4 scopes | 9 each | 9 each | 9 each | — |
| معلومات عامة | 4 scopes | 9 each | 9 each | 9 each | — |

## Confirmed QA defects (NEW — require human-approved correction)

### Defect 1: 488 remaining duplicates (Category A)
- **Worlds:** الأفلام (244), الأغاني (244).
- **Root cause:** Phase-1 cleanup removed one layer of triplication but two copies remain per unique item.
- **Classification:** Category A (exact re-push duplicate).
- **Action needed:** Safe delete of 488 duplicates, preserving the canonical copy (earliest ObjectId). No content regeneration needed — each scope already has ≥9 unique per mechanic after dedup.
- **Status:** NOT executed. Human approval required.

### Defect 2: 10 structurally invalid legacy RYO items (Category F)
- **Items:** 10 items across 8 scopes in انمي, فيديو قيمز, كرة قدم.
- **Issue:** Items tagged `compatibleChallengeTypeIds` including RYO but `answerPayload.mode = closest` (not `multiple_choice`), or have 2-3 options instead of 4. These are legacy items from early pushes (older ObjectId patterns `6a7267e…`, `6a7100…`).
- **Impact:** These items are counted toward the RYO coverage bar but are structurally invalid. When excluded, 8 scopes fall below 9 valid RYO:
  - انمي/ناروتو: 8 valid (1 invalid)
  - انمي/هجوم العمالقة: 8 valid (1 invalid)
  - انمي/ون بيس: 7 valid (2 invalid)
  - فيديو قيمز/كود: 8 valid (1 invalid)
  - كرة قدم/ابطال اوروبا: 8 valid (2 invalid)
  - كرة قدم/الدوري الانجليزي: 8 valid (1 invalid)
  - كرة قدم/الدوري السعودي: 8 valid (1 invalid)
  - كرة قدم/كأس العالم: 8 valid (1 invalid)
- **Classification:** Category F (invalid legacy).
- **Action needed:** Remove the 10 invalid items from RYO `compatibleChallengeTypeIds` (either delete them if they are pure duplicates of Closest items, or PATCH to remove RYO from their `compatibleChallengeTypeIds` if they are valid Closest items misclassified). Then author 8 minimal gap-only RYO replacement items (one per affected scope) to restore ≥9 valid.
- **Status:** NOT executed. Human approval required.

### Defect 3: 51 answer-leakage items (Category B — manual review)
- **OneClue clue-5 leakage:** 7 unique items in Marvel, 3 in Disney & Pixar, 2 in Movies Mix (clue 5, the easiest/value=1 clue, contains the answer text). These are duplicated across 3 copies each, so 36 duplicate-inflated instances.
- **RYO prompt leakage:** 5 unique items across السعودية (2), العالم (1), الرياضة (1) where the prompt text contains the correct option label. Also duplicated in الأفلام/الأغاني.
- **Classification:** Category B (near-duplicate / content quality). Requires manual reviewer decision per item.
- **Action needed:** Manual review and rewrite of the leaking clue or prompt. Not a bulk operation.
- **Status:** NOT executed. Reported for human review.

## Mapping reconciliation (authoring ↔ runtime)

| Authoring slug | Authoring scopes | Runtime name | Runtime scopes | Match |
|---|---|---|---|---|
| anime | 4 | انمي | 4 | ✓ |
| football | 4 | كرة قدم | 4 | ✓ |
| video-games | 4 | فيديو قيمز | 4 | ✓ |
| puzzles | 6 | عالم الالغاز | 5 | ⚠ (shapes-patterns missing in runtime — pre-existing, preserved world) |
| series | 4 | مسلسلات | 4 | ✓ |
| movies | 4 | الأفلام | 4 | ✓ |
| music | 4 | الأغاني | 4 | ✓ |
| saudi-arabia | 4 | السعودية | 4 | ✓ |
| world | 4 | العالم | 4 | ✓ |
| cars | 4 | السيارات | 4 | ✓ |
| sports | 4 | الرياضة | 4 | ✓ |
| general-knowledge | 4 | معلومات عامة | 4 | ✓ |

**Naming collision safety:** the new World `معلومات عامة` (runtime id `6a831d43d1d78cb6e7463cec`) is distinct from the existing puzzle Scope `معلومات عامة` (runtime id `6a7a22e44cfb4a6a8738d750`) inside عالم الالغاز. The puzzle Scope was NOT moved, renamed, deleted, or reused. ✓

## Push-tool safety result

The push script `push_gap_packs_2026_08_13.py` was hardened with:
- `content_fingerprint` / `runtime_fingerprint` (stable source identity via canonical field normalization).
- `fetch_existing_fingerprints` (reads existing items per scope and builds a fingerprint set).
- `--skip-existing` flag (skip items whose fingerprint already exists in the DB).
- Improved `--dry-run` reporting (`would-insert` / `would-skip(existing)` counts).
- `to_backend` stores `metadata.source` = content fingerprint (valid persisted field per `content-item.schema.ts`).
- Runtime-CT-id → kind mapping bug fixed (runtime items store ObjectIds, not authoring slugs).

**Idempotency proven:**
- Wave 5 pack (4 packs): `--dry-run --skip-existing` → `would-insert=0, would-skip(existing)=108`. ✓
- Wave 4 german-cars pack: `--dry-run --skip-existing` → `would-insert=0, would-skip(existing)=27`. ✓ (cross-wave generalization)

**Constraint compliance:** no DB-wide unique constraint added; no silent overwrite of manual corrections; no fuzzy destructive matching; import architecture not rewritten. `mediaIntent` correctly rejected as unknown DTO key (only `metadata.source/notes/tags` persist).

## Architecture audit

`audit_active_architecture.py` → **PASS** (`active_files=205 challenge_types=10 patterns=13 scopes=50`).

## Active / draft inventory

| World | Status | Board slots | Configs |
|---|---|---|---|
| انمي | active | 4 (RYO, OneClue, Closest, DI) | 4 |
| عالم الالغاز | active | 4 (DI, OneClue, RYO, Closest) | 4 |
| فيديو قيمز | active | 4 (RYO, Closest, OneClue, Top5) | 4 |
| كرة قدم | active | 4 (Top5, Closest, OneClue, DI) | 4 |
| مسلسلات | draft | 4 (DI, OneClue, RYO, Closest) | 4 |
| الأفلام | draft | 0 | 0 |
| الأغاني | draft | 0 | 0 |
| السعودية | draft | 0 | 0 |
| العالم | draft | 0 | 0 |
| السيارات | draft | 0 | 0 |
| الرياضة | draft | 0 | 0 |
| معلومات عامة | draft | 0 | 0 |

**Board / Signature work (read-only — OUT of scope):** 7 of 8 draft target worlds have no board slots or challenge configurations. مسلسلات has board configs (likely from an earlier setup). Board configuration, Signature mechanic design, and world activation are all explicitly OUT of scope for this audit.

## Media backlog

- **0 of 1986** target content items have media assets.
- Music world (الأغاني): 0 items with audio assets (full backlog — Wigolo/media enrichment not started).
- Cars world (السيارات): 0 items with image assets (visual opportunities for car models).
- All other target worlds: 0 items with media assets.
- Media enrichment is explicitly OUT of scope for this audit.

## Generated-wave artifact classification

| Wave | Directory | Worlds | Status |
|---|---|---|---|
| 1 | `output/wave1-2026-08-16/` | anime, football, series, video-games | Pushed |
| 2 | `output/wave2-2026-08-16/` | movies, music | Pushed (triplicated) |
| 3 | `output/wave3-2026-08-16/` | saudi-arabia, world | Pushed |
| 4 | `output/wave4-2026-08-16/` | cars, sports | Pushed |
| 5 | `output/wave5-2026-08-16/` | general-knowledge | Pushed |

Additional artifacts: `output/gap-packs-2026-08-13/` (gap packs for anime/video-games/football), `output/attack-on-titan-v1/`, `output/attack-on-titan-v2/`, `output/naruto_*`, `output/bomb_*`, `output/alzeer_salem_*`, `output/face-fusion/` (legacy media).

## Git state

- **Last commit:** `4f33704` (perf: optimize live game runtime — pre-audit).
- **Modified (tracked):** `ai/.DS_Store`, `ai/.opencode/manifest.json`, `ai/scripts/push_gap_packs_2026_08_13.py`.
- **Untracked:** wave skill directories, wave generation scripts, wave output dirs, `docs/WORLD_CONTENT_EXPANSION_PLAN.md`.
- **Nothing staged. No commits made during audit. No Git push.**

---

# Final Catalog Remediation (2026-08-17)

## Phase 2A — Category-A duplicate cleanup

**Planned:** 488 duplicates (244 الأفلام + 244 الأغاني).
**Actual found:** 488 (344 RYO/Closest + 144 OneClue — OneClue duplicates initially missed due to a CT-ID typo in the cleanup script; corrected and cleaned in a second pass).
**Deleted:** 488 (ok=488, fail=0).
**Worlds/scopes touched:** الأفلام (4 scopes), الأغاني (4 scopes).
**Post-dedup:** all 8 scopes = 9/9/9 unique. Each scope reduced from 88 → 27 items.

## Phase 2B — Invalid legacy RYO repair

**10 candidates reviewed individually:**
- 8 items with mode=closest tagged as RYO: all were unique Closest items misclassified. **PATCH** `compatibleChallengeTypeIds` RYO→CL (ok=8, fail=0). No deletion needed — no Closest duplicates existed.
- 1 item with 3 options (انمي/ون بيس): **PATCH** added 4th distractor option "ميثيكال" (ok=1).
- 1 item with 2 options (كرة قدم/ابطال اوروبا): **PATCH** added 2 distractor options "راؤول", "بنزيمة" (ok=1).
- **False positives:** 0.

**RYO gap after fixes:** 7 (not 8 — ابطال اوروبا retained 9 valid RYO after the 2-option fix).
**Replacements authored:** 7 new RYO items (one per affected scope: ناروتو, هجوم العمالقة, ون بيس, كود, الدوري الانجليزي, الدوري السعودي, كأس العالم). All factually verified, 4 options, no leakage, no duplicates.
**Pushed via hardened tooling:** 7 ok / 0 skip / 0 fail. Idempotency confirmed post-push (would-insert=0, would-skip=7).

## Phase 2C — Answer leakage

**Pre-dedup reported count:** 51 (inflated by 488 duplicates).
**Post-dedup runtime hits:** 23 unique items.
**Unique confirmed leaks:** 22 (10 OneClue clue-5 + 12 RYO prompts).
**False positives:** 1 (Overwatch Mei: "ماي" substring-matches inside "الحمايه" — preserved, no action).
**Corrections:** 22 targeted PATCHes (10 OneClue clue-5 rewrites + 12 RYO prompt rewrites). All ok=22, fail=0.
**Final remaining leaks:** 0 confirmed player-facing answer leaks (1 false positive only).

## Final unique coverage matrix

All 44 target scopes: **≥9 UNIQUE VALID READY** per shared mechanic.

| World | Scopes | RYO | OneClue | Closest | Status |
|---|---|---|---|---|---|
| انمي | 4 | 9 each | 9 each | 9–10 | OK |
| فيديو قيمز | 4 | 9 each | 9–11 | 9–10 | OK |
| كرة قدم | 4 | 9–10 | 9 each | 9–10 | OK |
| مسلسلات | 4 | 9 each | 9 each | 9 each | OK |
| الأفلام | 4 | 9 each | 9 each | 9 each | OK |
| الأغاني | 4 | 9 each | 9 each | 9 each | OK |
| السعودية | 4 | 9 each | 9 each | 9–12 | OK |
| العالم | 4 | 9 each | 9 each | 9 each | OK |
| السيارات | 4 | 9 each | 9 each | 9 each | OK |
| الرياضة | 4 | 9 each | 9 each | 9 each | OK |
| معلومات عامة | 4 | 9 each | 9 each | 9 each | OK |

Legitimate surplus preserved: GTA OneClue=10, كود OneClue=11, ابطال اوروبا RYO=10, السعودية/Cities Closest=12, anime Closest=10, football Closest=10, كود Closest=10.

## Final validator results

| Check | Result |
|---|---|
| Coverage (≥9/9/9 unique valid ready) | **44/44 OK** |
| Exact duplicates | **0** |
| OneClue structural | **0 failures** (1 false-positive leakage hit only) |
| RYO structural (wrong mode / invalid options / invalid correctOptionId) | **0** |
| RYO prompt leakage | **0 confirmed** |
| Closest structural | **0 failures** |
| Cross-world/scope contamination | **0** |
| Architecture audit | **PASS** (`active_files=205 challenge_types=10 patterns=13 scopes=50`) |
| Push-tool idempotency | **PASS** (Wave 5 science: would-insert=0, would-skip=27; Phase 2B replacements: would-insert=0, would-skip=7) |

## Runtime integrity

- All Waves 1–5 intact: 44 target scopes ≥9/9/9.
- عالم الالغاز: **PASS** (5 scopes, 30/30/30 per scope, no contamination, no structural issues, NOT restructured).
- DI, Top-5, archived vote/split: preserved untouched.

## Push-tool idempotency status

Hardened push tooling (`push_gap_packs_2026_08_13.py`) with `content_fingerprint`/`runtime_fingerprint`/`--skip-existing`:
- No duplicate storm created during remediation.
- Phase 2B replacement pack: 7 inserted, then re-run confirms would-insert=0, would-skip=7.
- Wave 5 science regression check: would-insert=0, would-skip=27.
- `metadata.source` fingerprint persists correctly.

## Repository cleanup (2026-08-17)

- Generated Wave packs (Waves 1–5) and gap-packs cleaned — all content is in the runtime DB; no unique data lost.
- One-off generator scripts (`gen_wave*_*.py`, `push_all_*`, `push_batch6`, `push_content_gaps`, `push_top10_worldcup`, `push_zeer*`, `build_gap_packs`, `build_top5_packs`, `convert_top10_to_top5`, `validate_gap_packs`, `validate_pack`) deleted.
- Legacy temp artifacts (old batches, assets, logos, `.DS_Store`) deleted.
- Music media intents (36 total: 9 per scope × 4 scopes) migrated from `output/wave2-2026-08-16/music/` to durable `ai/.opencode/media-intents/music/` (compatible with `QuestionAudioRequestDto` / `AudioQuestionKind`).
- Push tool `DEFAULT_PACKS` cleared (historical packs deleted); explicit pack paths still supported. Fingerprint logic, `--skip-existing`, `--dry-run` all intact.
- Canonical authoring structures retained: 12 `WORLD.md`, 50 `SCOPE.md`, 50 `KNOWLEDGE.md`, `manifest.json`, validators, challenge-type skills.
- Runtime DB unchanged — 44/44 target scopes still ≥9/9/9, عالم الالغاز intact.
- Architecture audit: PASS (`active_files=210 challenge_types=10 patterns=13 scopes=50`).
- Pre-cleanup recovery export preserved at external temp location (`/var/folders/.../catalog_precleanup.json`).
- Repository now ready for Content Baseline commit.

## Remaining work before launch

1. **Board configuration** for 7 draft worlds without board slots.
2. **Signature mechanic design** (Top5 is active only in video-games/football; other worlds need their Signature).
3. **World activation** (draft → active) for 8 target draft worlds.
4. **Media enrichment** (Music audio from `ai/.opencode/media-intents/music/`, Cars images, all-world banners/logos).
5. **Final release QA.**

## Checklist

- [x] Final Catalog Audit performed (2026-08-17)
- [x] shared-mechanic catalog QA ✅
- [x] Final Catalog Audit ✅
- [x] Phase-2 duplicate cleanup executed (488 deleted)
- [x] Invalid legacy RYO items fixed + 7 gap replacements authored
- [x] Answer-leakage items reviewed and corrected (22 fixed, 1 false positive preserved)
- [x] Repository cleanup complete (Wave packs, one-off scripts, temp artifacts cleaned; Music media intents migrated)
- [ ] Board configuration complete
- [ ] Signature mechanics complete
- [ ] World activation complete
- [ ] Media enrichment complete
- [ ] Release QA complete
