# Akwaan Agent Entry Point

Akwaan uses the canonical `World → Scope → ChallengeType → ContentItem`
architecture. New agents must read only
the active files assigned by the current manifest and Role.

## Required Reading Order

1. Product Bible: `.opencode/knowledge/AKWAN-CONTENT-BIBLE.md`.
2. Assigned Role under `.opencode/roles/`.
3. Tool instructions under `.opencode/tools/` when the assigned task needs them.
4. Requested World Skill under `.opencode/skills/worlds/`.
5. Requested ChallengeType Skill under `.opencode/skills/challenges/`.
6. Every selected Scope Knowledge file under `.opencode/skills/scopes/`.
7. Current batch manifest.
8. Required upstream handoff file or files named by that manifest.

The Product Bible always has highest authority. Report contradictions rather
than silently combining incompatible instructions.

## Responsibility Boundaries

- Roles define who may do what and which output each agent owns.
- Tools define safe external research and discovery behavior.
- World Skills define the complete audience experience.
- ChallengeType Skills define reusable mechanics and what players do.
- Scope Knowledge defines content boundaries and durable knowledge.
- Workflows define human-supervised stage order and handoffs.
- The manifest defines the exact batch assignment.

Do not duplicate shared knowledge into Role outputs. Do not edit another agent's
file. Do not publish or import directly. Human approval is the final gate before
manual import or publication.

## Legacy Exclusion

Everything under `.opencode/legacy/` is excluded from active reading and routing.
New agents must not inspect or depend on it unless a human explicitly assigns a
legacy-recovery task. Legacy files cannot be used directly to generate new
content.

## First Supported Vertical Slice

- World: Anime — `.opencode/skills/worlds/anime/SKILL.md`
- Challenge: Otaku — `.opencode/skills/challenges/anime/otaku/SKILL.md`
- Content Scope: One Piece —
  `.opencode/skills/scopes/anime/one-piece/KNOWLEDGE.md`
- Workflow: `.opencode/workflows/CONTENT-BATCH.md`
- Manifest contract: `.opencode/workflows/BATCH-MANIFEST.schema.json`
- Research Tool contract: `.opencode/tools/WIGOLO-MCP.md`

This structure is ready for a later ten-draft workflow. It does not itself
contain or generate those ContentItems.
