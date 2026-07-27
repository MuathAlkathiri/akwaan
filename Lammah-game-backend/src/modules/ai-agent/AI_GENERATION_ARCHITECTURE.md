# Reviewed AI generation architecture

## Runtime status

Only the authenticated reviewed-draft workflow is active:

- `POST /admin/ai-generator/generate-reviewed` generates and returns reviewed
  drafts without persistence.
- `POST /admin/ai-generator/save-drafts` remains the explicit persistence step.

Text generation uses the provider-neutral `AiProvider` boundary. With
`AI_PROVIDER=gemini`, writer, reviewer, and repair calls route through the Gemini
provider. The legacy `/ai-agent/generate-questions` auto-save route remains
disabled.

## Dependency map

The former generation path was:

```text
reviewed generation controller
  -> generation/source-curated pipeline
     -> planner and category profiles
     -> source-curation adapter
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
