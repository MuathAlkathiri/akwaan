# Akwaan Top-5 Migration & Workspace Cleanup — Final Report

- Date: 2026-08-08
- Repo: `/Users/muath/Desktop/Lammah-AI`
- Commits: `d77730b` (safety checkpoint) → `6cc093d` (migration + cleanup)

## 1. Duplicate workspaces (`.opencode 2/3/4`)

- All three were byte-for-byte identical (89 files each; `.opencode 4` differed
  only by a gitignored `.DS_Store`).
- All 77 unique skill files are preserved verbatim in
  `.opencode/legacy/old-skills/`.
- The 6 unique authored docs (incl. `LAMMAH-DESIGN-BIBLE.md`,
  `learned-rules.md`) were rescued to
  `.opencode/legacy/duplicate-workspaces-2026-08-08/` with an explanatory
  README.
- External backups:
  `/var/folders/fy/yqk90dy919v9d4sth0s64v8r0000gp/T/opencode/lammah-backup-2026-08-08/`
  (`duplicate-workspaces.tar.gz` 271KB, `source-tree.tar.gz` 1.14GB).
- The three duplicate directories were removed (264 tracked files deleted, all
  within those directories). Nothing else was lost or deleted.

## 2. Top 10 → Top 5 migration (source of truth: live backend at :3000)

- Retired top-10 authoring archived to
  `.opencode/legacy/retired-top10-2026-08-08/` (SKILL, schema, validator,
  classic pattern, repair report).
- Canonical `top-5` / `keep-or-give` authoring rewritten:
  - `skills/challenge-types/top-5/SKILL.md`
  - `skills/challenge-types/top-5/patterns/keep-or-give/PATTERN.md`
  - `skills/challenge-types/top-5/top-5.patterns.schema.json` (10 entries:
    5 ranked ranks 1–5 + 5 traps with rank null)
  - `validators/validate_top_5.py`, `validators/TOP-5.md`,
    `validators/examples/top-5-keep-or-give.valid.json`
- All active references updated (0 remaining `top-10`/`poison` hits):
  discovery README, `BATCH-MANIFEST.schema.json` enum, generation workflow,
  `CONTENT-QA.md`, `CONTENTITEM-REVIEWER.md`, `AKWAN-CONTENT-BIBLE.md`,
  `audit_active_architecture.py`, `validate_schema_examples.py`.
- Scripts migrated to the Top 5 contract:
  - `scripts/push_content_gaps.py`, `scripts/push_all_football.py`,
    `push_top10_worldcup.py` — removed from the repository in `eac8144` as a
    root-level one-off; recover with `git show deecb44:push_top10_worldcup.py`
    (canonical payloads; legacy poison-deck
    shape auto-converted with production semantics: ranks 1–5 stay ranked,
    6–10 become traps, decoys dropped).
  - `scripts/validate_pack.py` (top-5 schema + validator).
  - `scripts/build_top10_packs.py` → `scripts/build_top5_packs.py` (emits
    canonical Top 5 packs).
  - New `scripts/convert_top10_to_top5.py`.

## 3. Contract drift fixes

- Distributed Information: `answerPayload.closest` `tolerance` →
  `acceptedTolerance`; `multiple_choice` option labels now localized `{ar}`
  (matches `start-distributed-information.use-case.ts`). Schema, fixture, and
  pattern updated.
- RYO: verified aligned (3 items, multiple_choice/closest, `acceptedTolerance`).

## 4. Validators / structure

- Fixed an audit bug that scanned gitignored `node_modules`.
- Moved the stale Top 10 repair report to legacy.
- Added `.opencode/manifest.json` (machine-readable workspace snapshot), README
  manifest section, and legacy README archive index.

## 5. Validation results

- Architecture audit: PASS — 114 active files, 9 challenge types, 12 patterns,
  12 scopes.
- Schema examples: 6/6 PASS.
- Top 5 validator, Who-Among-Us fixtures, Distributed-Information fixtures:
  all PASS.
- New Top 5 packs: 9/9 items PASS `validate_pack.py`.
- Live push `--dry-run` against the backend: login OK (146 existing items),
  correct `top-5` routing and payload shape.

## 6. Distributable

- `akwan-opencode-config.zip` rebuilt: 508 files / 752KB; `node_modules` and
  gitignored files excluded.
- Independently extracted and diffed against source: byte-identical (only a
  gitignored `.DS_Store` excluded). All validators pass inside the extracted
  copy.

## 7. Smoke test

- Authoring → validation → backend payload chain verified:
  - `build_top5_packs.py` produced 9 items, all schema+validator PASS.
  - `convert_top10_to_top5.py` converted legacy packs; outputs PASS.
  - `push_content_gaps.top5_payload` emits the canonical backend payload
    (mode `top_5`, variant `keep-or-give`, 10 entries: 5 ranked + 5 traps).

## Open items

- None. Follow-up opportunities: push the new Top 5 packs live (all 9 items are
  `status: draft` awaiting human review), and consider a future Signature
  challenge-type assignment.
