# Duplicate Workspaces Rescue Snapshot (2026-08-08)

The `.opencode 2`, `.opencode 3`, and `.opencode 4` directories were three
byte-for-byte identical copies of the pre-restructuring "Lammah" authoring
workspace. Before removing them, every file was compared by content hash
against the canonical `.opencode` workspace:

- All 84 `skills/**` files are preserved verbatim in
  `legacy/old-skills/`.
- The `.gitignore`, `cache/asset-index.json`, `cache/search-history.json`,
  `health/*.json`, and `learning/approval-history.json` /
  `learning/rejection-history.json` are preserved verbatim in the canonical
  `cache/`, `health/`, and `learning/` directories.
- Only five files were unique to the duplicate workspaces and are rescued
  here so the historical record is not lost:
  - `knowledge/LAMMAH-DESIGN-BIBLE.md` — the older brand's 378-line design
    bible, superseded by `knowledge/AKWAN-CONTENT-BIBLE.md`.
  - `learning/learned-rules.md` — accumulated Lammah-era operational
    feedback (Naruto, Call of Duty, and global rejection rules).
  - `learning/README.md`, `health/README.md`, `cache/README.md` — the older
    operational documentation for those directories, superseded by the
    canonical empty/regenerated state.

Full recoverable backups of the duplicate workspaces also exist outside the
repository (see the migration report), and a git checkpoint commit preserves
them in history.
