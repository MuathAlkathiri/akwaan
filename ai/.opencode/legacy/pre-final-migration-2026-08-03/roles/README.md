# Akwaan Co-op Roles

## Shared Knowledge, Separate Responsibility

All agents work from the same Product Bible, World knowledge, Challenge
knowledge, and Content Scope or Subject knowledge. Knowledge and Skills are
shared references. They must not be copied into separate agent-specific packs.

A Role is not a duplicate Skill. A Skill describes reusable domain or task
knowledge; a Role defines one agent's responsibility, authority, boundaries,
output ownership, completion criteria, and handoff contract.

Every parallel agent must receive:

- exactly one explicit Role;
- one task manifest identifying the World, Challenge, selected Content Scopes,
  required inputs, batch ID, and output destination;
- a unique output file or folder that no other active agent may edit.

The Product Bible has highest authority. When any lower-level instruction
conflicts with it, follow `.opencode/knowledge/AKWAN-CONTENT-BIBLE.md` and report
the conflict in the handoff.

## Shared Operating Rules

Every Role must:

- follow `World → Scope → ChallengeType → ContentItem`;
- work only within the supplied World, ChallengeType, and Scopes;
- read shared knowledge rather than duplicating it;
- preserve clear, natural Arabic output where Arabic is required;
- report uncertainty, ambiguity, disputes, and missing evidence instead of
  guessing;
- preserve source references whenever research is used;
- leave source knowledge, the Product Bible, and other agents' outputs
  unchanged;
- write only to the destination assigned in the task manifest;
- produce deterministic, reviewable output with stable IDs and explicit status;
- hand off through files rather than silently overwriting prior work;
- never publish directly to a database, production site, or live product.

The human operator remains the final approver and publisher.

## Standard Workflow

> Research → Writing → Review → Asset Curation → QA → Human Approval → Manual
> Import/Publication

Each stage consumes the preceding stage's output and creates a new file. A later
Role may identify required changes but must return them to the owning Role rather
than silently rewriting that Role's work.

For text-only ContentItems:

> Research → Writing → Review → QA → Human Approval

Asset Curation is skipped only when the Challenge and every included ContentItem
are genuinely text-only.

## Concurrency Safety

Concurrent agents must never share an output destination. Two agents must never
edit the same batch file at the same time, even when they hold the same Role.
Split work into separately owned files first, then combine it through an
explicit later review or integration task.

Recommended batch layout:

```text
.output/content-batches/anime/one-piece/otaku/batch-001/
├── 01-research.json
├── 02-drafts.json
├── 03-review.json
├── 04-assets.json
└── 05-qa.json
```

Ownership is exclusive:

| Role | Owned output |
|---|---|
| Content Researcher | `01-research.json` |
| ContentItem Writer | `02-drafts.json` |
| ContentItem Reviewer | `03-review.json` |
| Asset Curator | `04-assets.json` |
| Content QA | `05-qa.json` |

No Role may overwrite another Role's file. Inputs are read-only. Corrections are
expressed as explicit decisions, blockers, or requested actions in the owning
Role's output. A rerun must receive a new destination or explicit permission to
replace its own previous output.

## Task Manifest Minimum

Before work begins, the manifest must identify:

- batch ID;
- assigned Role;
- World and World Skill;
- Challenge and Challenge Skill;
- selected Scopes and their knowledge files;
- required upstream input files;
- exact owned output destination;
- requested quantity or coverage target, when applicable;
- language and any explicit operator constraints.

If any required identity, input, or destination is missing or contradictory,
the agent must stop before producing content and report the blocker.

## Handoff Standard

Every output must identify its batch, Role, World, Challenge, selected Scopes,
input versions or paths, creation status, unresolved warnings, and next expected
Role. IDs and source references must remain stable across stages. Empty fields
must be explicit; agents must not fabricate values to make a handoff appear
complete.

The handoff is complete only when the owned file exists, contains every required
section, reports blockers and uncertainty, and can be reviewed without relying
on hidden conversation context.
