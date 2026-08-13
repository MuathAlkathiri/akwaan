# Akwaan Active Content System

This directory contains the canonical, experience-first authoring system.

## Generation Order

```text
ChallengeType → Interaction Design → Content Pattern → World → Scope
→ Scope Knowledge → ContentItem
```

The ChallengeType owns the social goal, interaction, thinking model, input,
resolution, structure, Patterns, and validation. World and Scope supply theme,
boundaries, vocabulary, and durable knowledge. A ContentItem belongs to one
Scope and lists every compatible ChallengeType.

## Required Reading

1. `knowledge/AKWAAN-CONTENT-BIBLE.md` and
   `knowledge/architecture/PRODUCT-EXPERIENCE.md`
2. the assigned Role
3. the selected `skills/challenge-types/<id>/SKILL.md`
4. one Pattern owned by that ChallengeType
5. `skills/worlds/<world>/WORLD.md`
6. `skills/worlds/<world>/scopes/<scope>/SCOPE.md`
7. that Scope's `KNOWLEDGE.md`
8. the active manifest and required upstream handoff
9. relevant validator and Tool contracts

Start with the ChallengeType. Research never chooses the mechanic.

## Workspace Manifest

`manifest.json` is the machine-readable snapshot of the active workspace:
ChallengeTypes and owned Patterns, Worlds and Scopes, validators, canonical
content-item modes, and legacy archives. Regenerate it after structural changes.

## Active Ownership

- `knowledge/architecture/`: global contracts.
- `skills/challenge-types/`: mechanics, discovery index, and owned Patterns.
- `skills/worlds/`: presentation context and Scope knowledge only.
- `roles/`: bounded responsibilities and owned outputs.
- `workflows/`: stage order and handoffs.
- `validators/`: hard automated and editorial checks.
- `health/`, `cache/`, `learning/`: canonical empty or regenerated state.

## Legacy Boundary

Historical material is quarantined separately and is never active input. Active
files must not import, route to, or depend on historical paths. Run
`validators/audit_active_architecture.py` after every structural change.

No Role publishes or imports directly. Human approval is the final gate.
