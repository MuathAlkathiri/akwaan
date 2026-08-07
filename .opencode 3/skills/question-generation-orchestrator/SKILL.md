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
   - `../../learning/learned-rules.md` and relevant active records from
     `../../learning/rejection-history.json` and
     `../../learning/approval-history.json`;
   - `../../health/README.md` and the applicable current Subject/Catalog health
     records;
   - `../asset-search-planner/SKILL.md`;
   - `../asset-quality-ranker/SKILL.md`;
   - `../question-patterns/SKILL.md` and only the Pattern Skills selected by the
     resolved allowlist;
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
2. Load active rejection memory and positive Success Memory. Resolve the
   applicable Asset/query-strategy, Subject, Catalog, and global scopes.
3. Load `.opencode/cache/search-history.json` and `asset-index.json`; never treat
   a missing or rejected cached record as usable.
4. Load current Subject Health. Identify overrepresented events/answers,
   overused or missing suitable Patterns, weak Media areas, and review
   confidence without inventing absent metrics.
5. Resolve the Catalog/Subject `allowedQuestionPatterns`. Reject unknown IDs and
   load only eligible Pattern Skills.
6. Initialize the Entity Rotation and Coverage Ledger from cumulative health
   plus current-batch Primary Focus, context, answer aliases, Event Clusters,
   arcs/stages, locations, objects, weapons, organizations, abilities, Question
   Patterns, Gameplay Patterns, and Media.
7. Build the batch plan. Apply small positive preference boosts and gentle
   health recommendations, then enforce explicit user constraints, rejection
   rules, diversity, and all hard limits.
8. For each slot, choose an underrepresented allowed Question Pattern and
   Gameplay Pattern, then choose the best underrepresented eligible entity or
   event and mark Primary Focus separately from context.
9. Create Media Asset search intents for planned questions.
10. Generate multiple ranked queries with the Asset Search Planner, including
   applicable query-strategy preferences.
11. Check Search Cache by normalized scene/event, observation, Pattern, and Media
   type; search only on a cache miss or required refresh.
12. Rank all result candidates with the Asset Quality Ranker and reject hard
   failures regardless of score.
13. Check Asset Cache by normalized source URL, checksum when available, and
   matching scene intent. Reuse a validated local Asset when suitable; otherwise
   download the best candidate through the matching Media Skill.
14. Generate the factual candidate through the selected Pattern Skill.
15. Run deterministic checks, then semantic quality validation.
16. Compare every candidate and Asset with active rejection patterns.
17. Compare valid candidates with active positive preferences and record
    matches. Similarity never auto-approves a question.
18. Check question, Primary Focus, event cluster, arc/stage, answer, Asset,
    Question Pattern, Gameplay Pattern, and formula accumulation.
19. Repair or replace every failure and re-run affected checks.
20. Commit approved coverage to the ledger, then repeat from Pattern selection
    for the next slot.
21. Verify every referenced local Asset and its metadata.
22. Save final questions only when the requested count passes.
23. Save generation metrics and a human-readable batch quality summary.
24. Update cache selection and usage records only with real results and approved
    questions.
25. Update Subject Health idempotently using the batch/report output reference,
    then aggregate Catalog Health.
26. Produce the final generation and health summary.

## Output

Preserve the established question schema and paths. If the project has no
established location, a compatible fallback is
`output/<subject-slug>/questions.json` with Assets under that Subject directory.

Write a separate generation report without altering question fields. Include:

- requested and produced question counts;
- rejected, repaired, and replaced candidate counts;
- missing-Asset failures;
- Search/Asset Cache hits and misses, reused Assets, and newly downloaded Assets;
- average and lowest selected Asset quality scores;
- difficulty, Question Pattern, and Media distributions;
- Gameplay Pattern, Primary Focus, Event Cluster, and arc/stage distributions;
- applicable Subject dimensions such as game title/version, era/subseries, and
  gameplay mode distributions;
- Coverage Ledger exceptions, consecutive-focus violations, and normalized
  answer-alias collisions;
- Direct Character Identification, Knowledge Question, and scene/event
  percentages;
- repeated-answer and repeated-event counts;
- duplicate replacements;
- answer-leakage, Direct Relationship, decorative-Media, promotional-Asset,
  fan-edit, obvious-character, unsupported-evidence, and
  `INSUFFICIENT_ASSET_EVIDENCE` rejection counts;
- rejection-learning matches;
- positive preference matches and questions influenced by Success Memory;
- active Subject and Catalog preferences loaded;
- Pattern, Media, Asset-source, and search-query preference boosts;
- approved-pattern similarity count;
- preference conflicts and hard-rule overrides of positive preferences;
- new approval records created during review and confidence changes;
- batch-plan deviations and documented quality exceptions;
- final output location.

Use counts and percentages where meaningful. Also print or write a concise
human-readable summary covering production, distributions, quality, cache use,
rejections, learning matches, and warnings. A separate JSON report and Markdown
or terminal summary are sufficient; do not alter legacy question fields or
create a dashboard.

When no established report shape exists, use these non-question fields:

```json
{
  "requestedCount": 0,
  "producedCount": 0,
  "candidateCounts": {"rejected": 0, "repaired": 0, "replaced": 0},
  "missingAssetFailures": 0,
  "insufficientAssetEvidenceFailures": 0,
  "cache": {
    "searchHits": 0, "searchMisses": 0,
    "assetHits": 0, "assetMisses": 0,
    "reusedAssets": 0, "newlyDownloadedAssets": 0
  },
  "assetQuality": {"averageScore": null, "lowestSelectedScore": null},
  "distributions": {
    "difficulty": {}, "questionPattern": {}, "media": {},
    "gameplayPattern": {}, "gameTitle": {}, "gameplayMode": {}
  },
  "percentages": {
    "directCharacterIdentification": 0,
    "knowledgeQuestions": 0,
    "sceneOrEventQuestions": 0
  },
  "repetition": {"answers": 0, "events": 0},
  "coverage": {
    "gameplayPatterns": {},
    "primaryFocus": {},
    "eventClusters": {},
    "arcsOrStages": {},
    "answerAliasCollisions": 0,
    "consecutiveFocusViolations": 0,
    "exceptions": []
  },
  "duplicateReplacements": 0,
  "rejectionsByReason": {},
  "rejectionLearningMatches": 0,
  "successMemory": {
    "positivePreferenceMatches": 0,
    "activeSubjectPreferences": [],
    "activeCatalogPreferences": [],
    "patternBoosts": {},
    "mediaBoosts": {},
    "assetSourceBoosts": {},
    "searchQueryBoosts": {},
    "approvedPatternSimilarityCount": 0,
    "questionsInfluenced": 0,
    "conflicts": [],
    "hardRuleOverrides": 0,
    "newApprovalRecords": 0,
    "confidenceChanges": []
  },
  "batchPlanDeviations": [],
  "qualityExceptions": [],
  "warnings": [],
  "finalOutputLocation": ""
}
```

Count automatic validator failures in metrics, but never write them to
`rejection-history.json` unless a user or reviewer explicitly rejects the item.

Never claim completion for a remote URL, placeholder, missing file, or
unimplemented `generated_image` task.

## User and Reviewer Feedback

When the user or reviewer approves or rejects a question or Asset:

1. Read `.opencode/learning/README.md`.
2. Preserve the original comment.
3. Resolve the referenced question from the reviewed batch/output. No feedback
   is not approval.
4. For an approval, append one record per question to
   `.opencode/learning/approval-history.json`, using positive reason codes and
   the narrowest reasonable scope.
5. For a rejection, append a structured record to
   `.opencode/learning/rejection-history.json`.
6. For mixed feedback, create separate positive question and negative
   Asset/question records; never approve a criticized Asset.
7. Write records only when feedback is clear enough; otherwise ask for
   clarification.
8. Never turn one Subject example into a global rule or preference.
9. Mark conflicting older records `superseded` rather than deleting them.
10. Promote repeated active patterns to `learned-rules.md` only as a summary;
   preserve their source records.
11. Update Subject Health from the review action, then aggregate Catalog Health,
    using an idempotent review-action key.

Natural feedback such as “This question is too obvious. Do not generate
questions like this again for Naruto” should normally become a Subject-scoped
`QUESTION_TOO_OBVIOUS` record containing the rejected question, answer, Pattern,
original comment, failure signature, and an action of `reject` or an explicit
repair. It must not ban Naruto from event, scene, action, ability, or dialogue
questions.

Automatic validator failures and temporary network/download failures are metrics,
not learned user preferences.

For `Approve questions 1, 3, 5, and 8`, create four approval records. Preserve
each question's Pattern, Media, Asset, query, scene, observation, and shared
review comment independently.

Approval never bypasses current validation, creates factual truth, permits
leakage or decorative Media, relaxes Direct Character Identification limits, or
automatically edits the Design Bible or Subject knowledge.

## Health Report Requests

For `Show the Naruto health report`, read `../../health/README.md` and the
existing Naruto record from `subject-health.json`. Display only recorded or
derivable metrics, score components, status, evidence confidence, warnings, and
recommendations. State that evidence is insufficient where records are absent.
For a Catalog request, aggregate from `catalog-health.json`; do not combine
Subject and Catalog records or double-count processed updates.
