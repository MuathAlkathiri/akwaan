# Rakkibha Validator

Run `python3 .opencode/validators/validate_rakkibha.py <paths>`.
A well-formed item passes and may be `ready` — the runtime is implemented.

The validator enforces the canonical challenge type, the native object payload,
the visual-assembly structure, exactly one globally-correct candidate, exact team
sizes, the safety confirmation, correct-identity leakage, and rejects any truth,
runtime, or retired three-segment field smuggled into the mechanic payload.

## Visual-Assembly Contract

- **Routing:** `compatibleChallengeTypeIds` includes `rakkibha`;
  `mechanicPayload.variant` is `visual-assembly`.
- **Reference:** one private reference view — `reference.media` is a valid
  image/audio/video asset with a non-empty URL. Only the reference holder ever
  receives it.
- **Candidate views:** at least two views, each with a unique `id`. Every view has
  two or three candidates with unique `localId`s. Each candidate has a non-empty
  server-side `canonicalIdentity` and valid media.
- **Correct piece:** `correctCanonicalIdentity` matches **exactly one** candidate
  across all views. The other candidates are plausible distractors; a whole view
  may be distractor-only.
- **Team sizes:** exactly `[2, 3]`. Safety confirmation required before `ready`.

## Privacy & Truth

- `canonicalIdentity` and `correctCanonicalIdentity` are **server-side tokens**.
  They must never appear in any client-visible text (`instruction`, `prompt`, a
  view's `content`, or a candidate's `content`) — `correct_identity_leaked`.
- The mechanic payload must carry no answer/truth field (`truth_duplicated_in_mechanic`)
  and no runtime field (`runtime_field_in_mechanic`).
- Retired three-segment fields (`segments`, `fragments`, `twoPlayerMergeOptions`,
  `publicPrompt`) are rejected (`retired_mechanic_field`).

## Error Codes

`challenge_type_invalid`, `native_payload_object_required`, `variant_invalid`,
`instruction_missing`, `reference_media_invalid`, `candidate_views_required`,
`candidate_view_ids_invalid`, `candidate_count_invalid`, `local_ids_invalid`,
`canonical_identity_required`, `candidate_media_invalid`, `true_candidate_invalid`,
`team_sizes_invalid`, `safety_confirmation_missing`, `correct_identity_leaked`,
`truth_duplicated_in_mechanic`, `runtime_field_in_mechanic`, `retired_mechanic_field`.
