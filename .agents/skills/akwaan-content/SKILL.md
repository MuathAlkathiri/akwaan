---
name: akwaan-content
description: >-
  Master workflow skill for authoring production game content for Akwaan Worlds and Scopes.
  Use when designing, writing, or expanding questions and content items.
---

# Akwaan Content Authoring Workflow Overlay

This Skill is a workflow and tool-execution overlay. It is **not** a second
global content-craft authority. Global craft rules live in
`ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md`. Mechanic Skills own
interaction and payload contracts; World and Scope/Knowledge profiles own
identity and domain boundaries; validators own authoring-pack checks; the
Content Engine owns candidate compatibility; Human Admin review is final.

## Mandatory context resolution (fail-closed)

Do not generate content until the exact authoring context is resolved:

1. Determine the canonical `mechanic`, `world`, and `scope`.
2. Execute:
   `python3 ai/scripts/resolve_authoring_context.py --mechanic <slug> --world <slug> --scope <slug>`
3. Read the output. If the command exits with an error (for example,
   `AUTHORING_BLOCKED`), halt generation and report the blocker. Never fall
   back to personal knowledge.
4. Include the resolver's `_authoringContext` metadata block exactly in the
   output artifact.

## Required authoring sequence

1. Resolve context and record its composed hash.
2. Read the selected mechanic Skill, mechanic patterns, World profile, Scope
   profile, `KNOWLEDGE.md`, manifest entry, and applicable validator contracts.
3. Apply global craft from QUESTION-CRAFT, then the selected mechanic, World,
   and Scope rules. A more specific contract may specialize a global default,
   but this workflow must not invent a competing rule.
4. Before drafting, define the experience shape, cognitive task, payoff,
   modality, evidence shown, and expected answer. Let the evidence choose the
   simplest satisfying question shape.
5. Emit `metadata.conceptKey` (`subject` plus `askedProperty`) and check
   approved/rejected/seen history. Exemplars teach taste; they are not targets
   to copy.
6. Run the existing authoring validators and preserve the resolver metadata in
   the final artifact. Human review, not this Skill or an AI score, decides
   approval.

## Canonical references

- Global craft: `ai/.opencode/knowledge/architecture/QUESTION-CRAFT.md`
- Archetype guidance: `ai/.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md`
- Batch variety: `ai/.opencode/knowledge/architecture/BATCH-VARIETY.md`
- Mechanic/runtime boundaries: `ai/.opencode/knowledge/architecture/MECHANIC-COMPATIBILITY.md`
- QA workflow overlay: `.agents/skills/akwaan-content-qa/SKILL.md`
- Authoring-pack QA: `ai/.opencode/validators/QUESTION-CRAFT-VALIDATION.md`

These references are links to the owning contracts, not additional copies of
their rules. If sources appear to conflict, stop and report the conflict using
the precedence documented in QUESTION-CRAFT; do not silently weaken a gate.
