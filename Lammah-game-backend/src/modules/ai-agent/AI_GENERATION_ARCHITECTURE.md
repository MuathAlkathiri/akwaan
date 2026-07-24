# Retired AI generation architecture

## Runtime status

AI question generation is not part of the active product workflow. The legacy
generation routes remain only as authenticated compatibility surfaces and return
`AI_QUESTION_GENERATION_DISABLED` with HTTP 503. `AiAgentModule` does not register
the planner, research, source-curation, writer, reviewer, repair, language, LLM,
or generated-draft services.

`AI_QUESTION_GENERATION_ENABLED` defaults to `false`. It is retained as an
operational compatibility setting; enabling it does not restore the retired
runtime graph. Recovery of the old implementation must be deliberate and use Git
history rather than silently activating dormant services.

## Dependency map

The former generation path was:

```text
generation controllers
  -> generation/source-curated pipeline
     -> planner and category profiles
     -> research router/providers and source adapters
     -> writer/curator/reviewer/repair and LLM client
     -> deterministic/language/source-fidelity validators
     -> generation duplicate detector
     -> asset service/providers
     -> reviewed draft persistence
```

The active manual path is:

```text
admin question CRUD
  -> category-policy and deterministic DTO validation
  -> QuestionDuplicateDetectionService
  -> save draft
  -> QuestionAudioJobService (when required)
     -> QuestionAudioProcessingService
        -> Wigolo bounded source discovery
        -> shared AssetService/provider selection
        -> yt-dlp + FFprobe/FFmpeg + LocalAudioStorageService
  -> QuestionAudioReviewService
  -> admin question approval
```

## Retained reusable boundaries

- `WigoloClient` remains available for bounded audio discovery and readiness.
- `AssetService`, asset provider contracts, YouTube/yt-dlp integration, media
  inspection/processing, and local audio storage remain shared infrastructure.
- `QuestionDuplicateDetectionService` is standalone and has no generation-agent
  dependency.
- `AudioQuestionCatalogService` converts generic JSON entries and legacy song
  entries to the same `QuestionAudioRequest` used by manual CRUD.
- Existing generation implementation files remain unregistered for Git-history
  continuity and isolated historical tests; they are not runtime dependencies.

No generation code was destructively removed as part of this transition, so no
cleanup tag was required. If physical deletion is done later, create a recovery
tag first and re-run dependency, integration, OpenAPI, and media checks.
