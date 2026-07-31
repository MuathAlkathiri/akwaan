---
name: question-generation-orchestrator
description: Entry point for simple requests such as "Generate 20 questions for Naruto"; resolves and runs the complete Lammah generation architecture.
---

# Question Generation Orchestrator

Simple prompts are sufficient. Do not ask the user to repeat global diversity,
Media, download, validation, obvious-character, or duplicate rules.

## Parse and Resolve

1. Parse requested count, Subject, and explicit overrides.
2. Resolve the Subject by normalized filename/name match under
   `.opencode/skills/`. Resolve its parent Catalog-family `SKILL.md`.
3. If a Subject file is absent, choose the best existing Catalog by documented
   scope. Research only when available knowledge cannot support the requested
   batch; never invent facts.
4. Read, in order:
   - `.opencode/knowledge/LAMMAH-DESIGN-BIBLE.md`;
   - this orchestrator;
   - resolved Catalog-family Skill;
   - resolved Subject file and its direct references;
   - `../question-designer/SKILL.md` and its supporting files;
   - relevant Media Skills;
   - `../answer-validator/SKILL.md`;
   - `../duplicate-checker/SKILL.md`;
   - `../lammah-style-guide/SKILL.md`.

When multiple rules apply: explicit user constraints override Subject, Subject
overrides Catalog, Catalog overrides generic execution, and the Design Bible's
hard global boundaries always remain unless it explicitly permits a Catalog
exception.

## Run

1. Discover the current output schema, difficulty/points model, and established
   paths from existing project outputs or consumers.
2. Build the required batch plan.
3. Generate a surplus of factual candidates.
4. Acquire every required Media Asset and save it locally through the matching
   Media Skill.
5. Validate candidates, answers, local Assets, and the complete batch.
6. Check semantic duplicates against the batch and available in-scope history.
7. Repair or replace every failure, then revalidate.
8. Save the final questions only when the requested count passes and every
   referenced Media file exists locally.

## Output

Preserve the established question schema and paths. If the project has no
established location, a compatible fallback is
`output/<subject-slug>/questions.json` with Assets under that Subject directory.

Write a separate generation report without altering question fields. Include:

- requested and produced counts;
- difficulty, Question Pattern, and Media distributions;
- rejected and repaired candidate counts;
- duplicate replacements and missing-Asset failures;
- final output location.

Never claim completion for a remote URL, placeholder, missing file, or
unimplemented `generated_image` task.
