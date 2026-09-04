# Repository Instructions for AI Coding Agents

## 1. Source of Truth & Project Governance
- `GAME_NEW_SYSTEM_ROADMAP.md` is the authoritative source of truth for the project's architecture, current product state, priorities, engineering governance, and constraints.
- Current roadmap overrides memory, older reports, old prompts, and stale implementation assumptions.
- If a user request conflicts with the roadmap, clearly identify the conflict before proceeding.
- Do not modify `GAME_NEW_SYSTEM_ROADMAP.md` unless the user explicitly asks you to update it.

## 2. Status & Reality Distinctions
Always distinguish implementation and deployment reality:
- **Status markers**:
  - ✅ **IMPLEMENTED & VERIFIED** (exists in code/runtime and validated by tests/audit)
  - 🟡 **DESIGN APPROVED — NOT IMPLEMENTED** (product decision made; implementation not started/incomplete)
  - 🚧 **IN PROGRESS** (implementation genuinely exists and is actively incomplete)
  - ⬜ **NOT STARTED** (no meaningful implementation or no decision yet)
  - ⚠️ **KNOWN DEBT / FOLLOW-UP** (non-blocking technical or product debt)
- A design decision is not implementation.
- Runtime DB mutation is not a Git change.
- Git commit is not deployment.
- Local/dev runtime is not the public website.

## 3. Operational Guardrails
- Do not commit or Git push unless explicitly requested.
- Do not mutate runtime data during content design/review unless explicitly requested.
- Reuse the existing architecture; do not create parallel content or media systems.
- `ai/.opencode/skills/` remains the canonical Akwaan authoring knowledge source (`WORLD.md` / `SCOPE.md` / `KNOWLEDGE.md`, challenge types, and patterns). Do not duplicate these files.

## 4. Content Authoring Rules
- Before content authoring, read the relevant roadmap section plus the relevant canonical Akwaan authoring assets under `ai/.opencode/skills/`.
- Respect World / Scope boundaries strictly.
- Content must be mechanic-native, recognizable, fair, multiplayer-friendly, and non-repetitive.
- Avoid ordinary trivia with a cosmetic mechanic wrapper.

These instructions apply to the entire repository.

## 5. File Placement

Where a file goes is part of whether it is correct. The repository root is for
project-level files only — `README.md`, `AGENTS.md`, `ARCHITECTURE.md`,
`TESTING.md`, `GAME_NEW_SYSTEM_ROADMAP.md`, package manifests, compose and
deploy configuration. **Never create an ad-hoc script or a generated report in
the root.** A root full of `fix_*.py`, `audit.py` and `generate_report.py` is
how a repository stops being readable.

| What you are writing | Where it goes |
|---|---|
| Reusable authoring/release/validation tooling | `ai/scripts/` — with tests where practical |
| A script for one task | `ai/workbench/scripts/` |
| Generated output: batches, review HTML, audits, manifests | `ai/workbench/artifacts/` |
| Long-lived documentation | the existing `docs/` structure |
| Automated tests | beside the code, in the established test architecture |
| Runtime/application source | its existing module architecture |

`ai/workbench/` is git-ignored scratch space and is **temporary**. Clean it after
a milestone rather than letting it become a graveyard of numbered variants
(`fix_x.py`, `fix_x2.py`, `fix_x3.py`). Git history already preserves history for
anything that was ever tracked; keeping dead scripts around preserves nothing.

Promote a script from the workbench into `ai/scripts/` only when it is genuinely
reusable infrastructure — not merely because it worked once.

Generated content packs (`*.source.json`) are intermediate authoring artifacts.
They are not committed just because a promotion consumed them: Git holds code,
reusable tooling and taxonomy/knowledge; the runtime DB holds live content and
object storage holds live media.
