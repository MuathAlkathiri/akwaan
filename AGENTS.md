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
