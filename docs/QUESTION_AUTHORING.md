# Admin question authoring

Question creation and editing use dedicated admin pages:

- `/admin/questions/new`
- `/admin/questions/:questionId/edit`

The Questions list remains responsible for search, filtering, pagination,
review/status actions, and deletion. It no longer owns create/edit modal state.
The authoring page warns before navigation when local or form changes are
unsaved.

## Authoring types

The type selector is an authoring concern and maps onto the existing model:

- **Text** is a standard gameplay question with no required primary media.
- **Image** is a standard gameplay question using the existing image upload and
  media fields.
- **Audio** is a standard gameplay question using the existing audio request,
  candidate selection, processing, upload, and review workflow.
- **Video** uses that same media request, candidate selection, processing,
  upload, review, and storage workflow. The selected YouTube source is trimmed
  to a 5–15 second MP4 clip and persisted as a `video` asset.
- **Top 10** persists `questionType = ranked_list` and exactly ten ordered
  entries.

Media type and gameplay type remain separate. Audio and video do not introduce
new gameplay modes.

Audio/video timing is authored as `MM:SS` (`clipStartTime` and
`clipDurationTime`) and converted to integer seconds at the API boundary.
Persisted requests retain `preferredStartSeconds` and
`preferredDurationSeconds`. The preview endpoint accepts `startTimeSeconds`
and `durationSeconds`, creates a new request identity while preserving the
selected candidate, and regenerates the clip. The clip fingerprint includes
the selected source URL, start time, and duration, so a timing or source change
cannot reuse the previous preview.

## Normalization and accepted answers

Normalization is deterministic code shared by persistence validation and
gameplay. It performs Unicode normalization, whitespace and punctuation
cleanup, Arabic diacritic/tatweel removal, safe Arabic letter-form handling,
and English case folding. It does not use fuzzy similarity.

Accepted answers are explicit, reviewable aliases stored with the question.
During gameplay, input is normalized once and compared for exact equality
against normalized canonical answers and aliases. No LLM, embedding, fuzzy
threshold, or provider call occurs in the gameplay path.

The authoring-only endpoints are:

- `POST /admin/questions/accepted-answers/generate`
- `POST /admin/questions/accepted-answers/generate-ranked-list`

They use the existing configured LLM client, have a bounded timeout, return
structured aliases and warnings, and sanitize/deduplicate their output.
Provider failure returns a non-blocking diagnostic warning; admins can always
enter and save aliases manually. Generated aliases merge with manual values and
never replace them automatically.

Alias generation uses the same `AI_PROVIDER`, `LM_STUDIO_BASE_URL`,
`LM_STUDIO_MODEL`, role-model overrides, and `AI_REQUEST_TIMEOUT_MS` settings as
the canonical AI pipeline. A backend process running directly on the host can
use `http://127.0.0.1:1234/v1`. A backend running in Docker must use
`http://host.docker.internal:1234/v1` through
`BACKEND_LM_STUDIO_BASE_URL`; `localhost` inside the container points to the
container itself.

Provider failures remain non-blocking. The authoring response and safe backend
logs distinguish configuration, connection, missing-model, timeout, and
invalid-response failures with `ALIAS_PROVIDER_NOT_CONFIGURED`,
`ALIAS_PROVIDER_CONNECTION_FAILED`, `ALIAS_MODEL_NOT_FOUND`,
`ALIAS_GENERATION_TIMEOUT`, and `ALIAS_RESPONSE_INVALID`. Logs include provider,
safe base URL, selected model, HTTP status, error type, and parsing stage, but
never API keys or authoring prompts.

Ranked-list alias generation sends compact `rowIndex` values (`0..9`) to the
provider and maps them back to frontend `clientId` values server-side. The
provider contract is `{ entries: [{ rowIndex, aliases, warnings }], warnings }`;
aliases are structured `{ value, language, reason, confidence }` objects.
Reordered rows are accepted. Missing, duplicate, unknown, or malformed rows
receive `ALIAS_RESPONSE_INVALID` only on affected public response rows, while
valid rows survive. Empty alias arrays are valid. Set
`AI_ALIAS_DIAGNOSTICS=true` outside development to temporarily emit the bounded,
sanitized response-structure and reconciliation summary.

## Top 10 ownership and conflicts

Admins order entries from easiest to hardest. Rank and points are server-owned
and derived from array position:

`10, 20, 30, 40, 50, 60, 70, 90, 100, 130` (total `600`).

Client-supplied rank and point values are ignored. The backend requires exactly
ten non-empty entries and rejects normalized canonical duplicates, blank
aliases, aliases equal to their canonical answer, duplicate aliases within one
entry, and accepted forms shared by different entries. Conflict responses
include both row indices/client IDs, the original value, and its normalized
form so the authoring page can highlight the affected rows.

Existing standard questions without `acceptedAnswers`, and ranked-list entries
without aliases, continue to work without a migration.

## Media lifecycle repair

Audio and video share one canonical lifecycle. Processing attaches the same
generated asset to `audioAsset` and `primaryAsset`, persists
`audioStatus=ready`, `assetStatus=READY`, and verifies those values with a fresh
database read. Media review then persists `audioReviewStatus=approved` on that
same question record. Question approval requires the canonical asset to be
current, ready, and reviewed.

To inspect existing pending records whose stored output may already be valid,
run:

```bash
npm run repair:media-assets
```

This is a dry run. Apply only file-verified and request-identity-verified
repairs with:

```bash
npm run repair:media-assets -- --apply
```

Use `--question-id=<Mongo ObjectId>` to scope either command. The repair checks
the canonical asset reference, local file size, FFprobe duration, timing
metadata, and request hash/media fingerprint. Ambiguous legacy assets are
reported as skipped and must be regenerated; the command never marks all
pending assets ready.

## Manual QA

1. Open Admin Questions and confirm Add and Edit navigate to the dedicated
   routes with no create/edit dialog.
2. Switch between Text, Image, Audio, Video, and Top 10; confirm only relevant
   sections appear.
3. Create an Image question and confirm preview/upload works.
4. Edit an Audio question and exercise request save, candidate selection,
   retry, manual upload, approve, and reject.
5. Edit a Video question and exercise the same workflow with an MP4 preview;
   confirm gameplay autoplays the muted clip without controls and stops at the
   configured duration.
6. Confirm Top 10 always displays ten rows, fixed read-only points, and total
   `600`.
7. Generate aliases for `المملكة العربية السعودية`, review/edit/remove them,
   add a manual alias, save, and reopen.
8. Generate aliases for all Top 10 rows and confirm manual aliases remain and
   normalized duplicates do not appear.
9. Add `المملكة` to two rows and confirm save is blocked and both rows are
   highlighted.
10. In gameplay, confirm stored canonical/aliases match after normalization
   (including `السعوديه` and `KSA`) and a close unrelated value is rejected.
11. Navigate away with an unsaved change and confirm the warning appears.

This authoring-time alias service is reusable for future speech input, while
speech gameplay should continue feeding recognized text into the same
deterministic exact matcher.
