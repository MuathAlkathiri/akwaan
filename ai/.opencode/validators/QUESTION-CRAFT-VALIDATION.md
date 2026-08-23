# Question Craft & Batch Variety Validation Contract

## 1. Scope & Purpose

This validator audits authored ContentItem sets against:
- Canonical question archetypes from `.opencode/knowledge/architecture/QUESTION-ARCHETYPES.md`
- Batch variety and diversity thresholds from `.opencode/knowledge/architecture/BATCH-VARIETY.md`
- Anti-pattern detection and Zero Answer Leakage from `.opencode/knowledge/architecture/QUESTION-CRAFT.md`

## 2. Hard QA Gates (Errors)

1. **Unknown Archetype**: If specified, `questionArchetype` must be in the 20 recognized canonical archetypes.
2. **Prompt Length Overflow**: Prompts exceeding 250 characters fail automatically (`ANTI_WALL_TEXT`).
3. **Zero Answer Leakage**: Prompt text must never contain the canonical answer or accepted answers $\ge 4$ characters (`ANTI_LEAKAGE`).

## 3. Advisory Gates (Warnings)

1. **Max Archetype Share**: Any archetype $>35\%$ in a batch $\ge 9$ items triggers a diversity warning.
2. **Archetype Spread**: Batches $\ge 9$ items should feature $\ge 4$ distinct archetypes.
3. **Generic Opening Ratio**: Prompts starting with `"من / ما"` should not exceed $40\%$.
4. **Consecutive Clustering**: 3+ consecutive items sharing the exact same archetype trigger a clustering warning.

## 4. Usage

```bash
python3 ai/.opencode/validators/validate_question_craft.py <path_to_batch.json>
```
