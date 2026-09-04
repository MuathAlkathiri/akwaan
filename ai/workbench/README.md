# Workbench

Agents must not create ad-hoc Python/JS helper scripts in the repository root.

New one-off task scripts must go under `ai/workbench/scripts/`.

Generated task artifacts must go under `ai/workbench/artifacts/`.

Reusable production/authoring tooling belongs in the existing canonical `ai/scripts` architecture and must not be duplicated in workbench.

## This directory is temporary

`scripts/` and `artifacts/` are git-ignored. Nothing here is source, and nothing
here is a record: once a task's result has landed in the runtime, in canonical
source, or in the roadmap, delete the files that produced it.

Do not keep numbered variants (`fix_x.py`, `fix_x2.py`, `fix_x3.py`) for history.
Git already provides history for anything that was tracked, and a pile of
near-identical scripts makes the useful one impossible to find.

If a retained artifact still has real value, file it under a dated task folder —
`artifacts/music-2026-09/` — rather than leaving it loose.

The placement rules themselves live in `AGENTS.md` §5; this file is the reminder
at the point of use.
