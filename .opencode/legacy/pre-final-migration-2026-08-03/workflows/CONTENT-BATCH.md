# Co-op Content Batch Workflow

## Purpose

This workflow tells a human operator how to launch, supervise, and approve one
Challenge-first content batch. It coordinates Roles and files; it does not
generate, publish, or import content automatically.

Required shared reading begins at `.opencode/README.md`.

## 1. Create the Batch Manifest

Create one manifest that validates against
`.opencode/workflows/BATCH-MANIFEST.schema.json`. Define the World, ChallengeType,
selected Scopes, target ContentItem count, language, spoiler and media
policies, source requirements, Role assignments, and one unique batch output
directory.

Assign a unique owned file to every Role. Do not launch work until all referenced
World, Challenge, and Scope paths exist.

## 2. Assign the Content Researcher

Give the Researcher its Role file, manifest, shared knowledge paths, Tool
contract when research is needed, and exclusive `01-research.json` destination.
Research may run in parallel only with independent batches that have different
directories and files.

## 3. Validate the Research Handoff

Before Writing, confirm the research file exists and contains stable research
and source IDs, selected-Scope coverage, uncertainty warnings, risky areas, and
a complete status. Return it to Research if required evidence is missing. A
partial or blocked research brief cannot silently become Writing input.

## 4. Assign the ContentItem Writer

Give the Writer read-only access to the validated research brief and exclusive
ownership of `02-drafts.json`. The Writer creates only draft items and may not
browse independently unless the manifest explicitly authorizes a bounded Tool
task.

## 5. Assign the ContentItem Reviewer

Reviewer starts only after Writer completion. Give the Reviewer the manifest,
research, and draft files as read-only inputs and exclusive ownership of
`03-review.json`. Every draft must receive one specific decision and reason.

## 6. Return Blocked Items When Needed

Items marked `return_for_rewrite` return to the Writer through a new Writer
assignment. Do not let the Reviewer rewrite them silently. The operator assigns
a new draft revision destination or explicitly authorizes replacement of the
Writer's own prior file. Re-review every changed item and preserve stable IDs or
an explicit supersession map.

Rejected items remain recorded. `move_recommended` items require a future batch
under the recommended Challenge; they do not change Challenge inside this batch.

## 7. Assign the Asset Curator When Needed

Launch Asset Curation only for reviewed media-dependent items eligible under the
review ledger. Give the Curator read-only upstream files, the Tool contract, and
exclusive ownership of `04-assets.json`.

Skip this stage only when every included ContentItem is genuinely text-only. A URL
or search result is not a completed asset. Unresolved leakage, evidence,
provenance, or availability risk remains a blocker.

## 8. Assign Content QA

QA starts only when all required upstream files exist. For media batches that
means research, drafts, review, and assets. For text-only batches it means
research, drafts, and review.

QA owns only `05-qa.json`. It validates the batch as one product unit and issues
`ready`, `ready_with_warnings`, or `blocked`. QA does not silently repair
upstream work.

## 9. Human Approval

The operator reviews the QA report and all upstream artifacts. Warnings require
an explicit human decision. Blockers return to the Role that owns the affected
file, followed by the required downstream reruns.

Only a human may approve the batch for import.

## 10. Manual Import or Publication

Import or publication is a separate manual action after human approval. No Role,
Tool, workflow document, or ready QA recommendation performs that action.

## Concurrency Rules

- independent research batches may run in parallel;
- independent writing batches may run in parallel after their own research is
  validated;
- stages within one batch are sequential;
- Reviewer never starts before Writer completion;
- Asset Curator never starts before eligible review decisions exist;
- QA never starts before every required upstream file exists;
- each agent receives exactly one unique output file;
- no agent edits another agent's file;
- two agents never write to the same batch file concurrently;
- upstream inputs are read-only;
- parallel work must use separate batch IDs and output directories.

## Operator Checkpoints

At every handoff, verify:

- file path and ownership;
- batch ID, World, ChallengeType, and Scopes;
- input paths and completion status;
- stable IDs and source traceability;
- warnings, blockers, and next Role;
- absence of hidden assumptions or conversation-only decisions.

The batch is production-ready only after a `ready` or human-accepted
`ready_with_warnings` QA report and explicit human approval.
