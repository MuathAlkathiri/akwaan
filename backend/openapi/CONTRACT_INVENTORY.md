# API contract inventory

This inventory records the runtime routes audited during Swagger/OpenAPI hardening. `Public` means no JWT guard; `User` means bearer authentication; `Admin` means bearer authentication plus the admin role.

| Feature | Operations | Access | Runtime response contract | Frontend use |
| --- | --- | --- | --- | --- |
| Auth | `authRegister`, `authLogin`, `authGetCurrentUser` | Public, Public, User | `AuthResponseDto`; `UserResponseDto` | Yes |
| Users | `usersList` | Admin | `UserResponseDto[]` | Yes |
| Subscriptions | `usersUpdateSubscription` | Admin | status/message/user object | Yes |
| Catalogs | `catalogsList`, `catalogsGetById`, `catalogsCreate`, `catalogsUpdate`, `catalogsDelete` | Public reads; Admin writes | explicit list/detail/mutation envelopes; 204 delete | Yes |
| Categories | `categoriesList`, `categoriesGetById`, `categoriesCreate`, `categoriesUpdate`, `categoriesDelete` | Public reads; Admin writes | explicit list/detail/mutation envelopes; 204 delete | Yes |
| Questions | `questionsList`, `questionsGetById`, `questionsCreate`, `questionsUpdate`, `questionsDelete` | Public reads; Admin writes | explicit list/detail/mutation envelopes; public reads hide answers | Yes |
| Admin questions | `adminQuestionsList`, `adminQuestionsGetById`, `questionsListAiGenerated`, `questionsBulkAction`, `questionsRetryPrimaryAsset`, `questionsRetryCoverImage` | Admin | question envelopes, bulk write result, asset retry question | Yes |
| AI generation | `aiGenerateQuestions`, `aiGenerateReviewed`, `aiSaveReviewedDrafts`, `aiDebugTools` | Admin | generation results, reviewed drafts, persisted drafts, safe tool diagnostics | Yes except diagnostics |
| Music | `musicTracksUpload`, `musicTracksList`, `musicTracksGetById`, `musicTracksUpdate`, `musicTracksDelete`, `musicValidateAnswer` | Admin track management; public validation | explicit track envelopes and answer validation | Partly |
| Games | `gamesCreate`, `gamesList`, `gamesGetById`, `gamesRevealAnswer`, `gamesAwardPoints`, `gamesSkipQuestion` | User/resource owner | explicit game list/detail/mutation envelopes | Yes |

All 42 registered operations have explicit, unique operation IDs. Multipart contracts retain the runtime field names: catalog/category use a JSON string in `catalog`/`category` plus optional `banner` (5 MB; JPEG/PNG/WebP), and music uses required `file` (50 MB) plus optional scalar metadata.

## Frontend and Orval readiness

Current frontend wrappers use the same routes and envelope shapes documented here. Feature UI models intentionally remain separate where they normalize media URLs, populated references, or game board display data. No wrapper was replaced in this phase.

The contract is **ready with exceptions** for Orval. Remaining contract-specific debt:

- AI reviewed-generation structures still contain genuinely variable provider/asset metadata and need further dedicated nested schemas before Zod generation can be strict end-to-end.
- Category AI/gameplay configuration and catalog/category populated-reference variants retain open metadata objects where runtime is intentionally flexible.
- The legacy AI generation endpoint remains supported and is not removed.
- Common error responses are modeled by `ErrorResponseDto`, but endpoint-specific error decorators remain uneven because the existing exception filter is not globally installed at runtime; changing that would alter runtime error responses and is outside this phase.
- Resource-owner semantics on games are described as bearer-secured; OpenAPI cannot encode per-resource ownership.

The committed `openapi.json` is deterministic. `npm run api:openapi` regenerates it, `npm run api:validate` validates it, and `npm run api:check` regenerates to a temporary file and fails on drift.
