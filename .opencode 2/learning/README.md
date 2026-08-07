# Approval and Rejection Learning

This is structured local feedback memory, not model training or canonical
knowledge. Only explicit user or reviewer feedback enters
`rejection-history.json` or `approval-history.json`. A generated, saved,
validated, repaired, or unrejected question is not implicitly approved.

## Supported Feedback

Structured example:

```text
Reject question 7.
Reason: QUESTION_TOO_OBVIOUS
Comment: Naruto is too obvious for direct image identification.
Scope: subject
```

Natural feedback is also supported:

```text
This question is too obvious. Do not use questions like this again for Naruto.
```

Infer the narrowest reasonable reason and scope, preserve the original comment,
and request clarification rather than inventing a global rule from vague
feedback.

## Rejection Record

Record available fields only: date, Subject, Catalog, question, answer, Question
Pattern, difficulty, Media type, Asset path/source, reason code, original user
explanation, normalized failure signature, entity, event, scope, suggested
correction, future action, and status.

Scopes are `global`, `catalog`, `subject`, and `asset`. Future actions are
`reject`, `repair`, or `human_review`. Status is `active`, `superseded`, or
`ignored`.

## Reason Codes

`QUESTION_TOO_OBVIOUS`, `MAIN_CHARACTER_IDENTIFICATION`,
`DIRECT_RELATIONSHIP`, `ANSWER_LEAKAGE`, `MULTIPLE_RECOGNITION_CHANNELS`,
`DECORATIVE_MEDIA`, `PROMOTIONAL_ASSET`, `FAN_EDIT`, `LOW_MEDIA_QUALITY`,
`WRONG_SCENE`, `WRONG_SUBJECT`, `FACTUALLY_INCORRECT`,
`UNSUPPORTED_ANSWER`, `AMBIGUOUS_ANSWER`, `MULTIPLE_VALID_ANSWERS`,
`DUPLICATE_QUESTION`, `DUPLICATE_EVENT`, `REPEATED_ANSWER`,
`BORING_TRIVIA`, `PRODUCTION_TRIVIA`, `UNFAIR_DIFFICULTY`, `BAD_CROP`,
`VISIBLE_ANSWER_TEXT`, `MEDIA_TOO_LONG`, `MEDIA_TOO_SHORT`,
`AUDIO_UNCLEAR`, `VIDEO_UNCLEAR`, `INVALID_LOCAL_PATH`, `MISSING_ASSET`,
`POOR_SEARCH_QUERY`, `INSUFFICIENT_ASSET_EVIDENCE`,
`TARGET_NOT_VISIBLE`, `TARGET_NOT_VISUALLY_DOMINANT`,
`AUDIO_ANSWER_LEAKAGE`, `INVALID_MEDIA_SEGMENT`,
`RECOGNITION_SATURATION`, `DIFFICULTY_MISCLASSIFIED`, `OTHER`.

Add a new code only when none of these expresses a recurring meaningful cause.

Asset-evidence codes describe the Asset in isolation, not the wording:
`INSUFFICIENT_ASSET_EVIDENCE` = the Asset alone does not carry enough evidence for
one fair, unambiguous answer; `TARGET_NOT_VISIBLE` = the asked-about target never
appears in the Asset; `TARGET_NOT_VISUALLY_DOMINANT` = the target is present but
tiny, cropped, obscured, or one of many similar elements.
Apply `INSUFFICIENT_ASSET_EVIDENCE` through the mandatory Blind Asset Test: hide
the answer, filename, `mediaDescription`, rationale, query, and hidden metadata,
then inspect/listen only to the player-facing Asset. Topic relevance and
generator intent never satisfy this code.
Media-leakage codes: `AUDIO_ANSWER_LEAKAGE` = the answer is spoken (announcer,
dialogue, voice line) inside the Asset; `INVALID_MEDIA_SEGMENT` = a Media segment
must be replaced/re-clipped because it leaks the answer or the wrong interval.
Difficulty and saturation: `RECOGNITION_SATURATION` = an answer nearly any casual
audience member recognizes instantly from the Media alone, making it trivially
obvious; `DIFFICULTY_MISCLASSIFIED` = the labeled difficulty does not match how
the question actually plays.

## Approval Record

Create one record per explicitly approved question or Asset. Bulk approval
creates separate records so different Patterns and Assets remain distinguishable.
Record available fields only:

- date, Subject, Catalog, question, answer, Question Pattern, and difficulty;
- Media type, Asset path/source, source type, Asset score, and search query;
- scene/event and required observation;
- original user comment and normalized success signature;
- positive reason codes, scope, suggested preference, confidence, and status.

Approval scopes are `global`, `catalog`, `subject`, `asset`, and
`query-strategy`. Status is `active`, `superseded`, or `ignored`.

Positive reason codes:

`MEMORABLE_SCENE`, `STRONG_MEDIA_DEPENDENCY`, `GOOD_VISUAL_DETAIL`,
`GOOD_AUDIO_RECOGNITION`, `GOOD_VIDEO_OBSERVATION`, `SATISFYING_REVEAL`,
`GOOD_DIFFICULTY`, `FAIR_HARD_QUESTION`, `GOOD_EVENT_RECALL`,
`GOOD_WHAT_HAPPENS_NEXT`, `GOOD_DIALOGUE_QUESTION`, `GOOD_GROUP_RECALL`,
`GOOD_OBJECT_QUESTION`, `GOOD_LOCATION_QUESTION`, `GOOD_SEQUENCE_QUESTION`,
`GOOD_KNOWLEDGE_QUESTION`, `GOOD_CHARACTER_SELECTION`, `GOOD_ASSET`,
`GOOD_CROP`, `GOOD_SEARCH_QUERY`, `GOOD_SOURCE`, `GOOD_PATTERN_VARIETY`,
`FUN_DISCUSSION_VALUE`, `OTHER`.

Infer only well-supported codes and always preserve the original comment.

## Success Signatures and Preference Strength

A success signature may combine Subject, Pattern, scene/event type, answer type,
Media type, observation, source type, difficulty, and question structure.
Wording overlap alone is not a success match.

Use lightweight preference confidence from 0–100:

- one explicit approval: weak signal;
- three similar approvals: meaningful preference;
- five or more consistent approvals: strong preference;
- recent evidence weighs more than old evidence;
- Subject evidence outweighs Catalog evidence, which outweighs global evidence;
- exact Asset or query-strategy evidence remains narrowly scoped.

Interpret 0–29 as no meaningful preference, 30–49 slight, 50–69 preferred,
70–84 strongly preferred, and 85–100 highly preferred but diversity-limited.
This measures user preference, not factual quality.

Positive preferences provide small ranking or planning boosts only. They never
auto-approve a candidate or override factual accuracy, leakage, ambiguity,
duplicate, Media-quality, Direct Character Identification, or other hard rules.
Preferred does not mean unlimited.

## Use and Conflict Resolution

Before generation load active rejection rules and positive preferences at
global, Catalog, Subject, Asset, and query-strategy scope. Apply negative
constraints and small positive boosts to the batch plan and candidate review.
Match structured Subject, answer, event, Question Pattern, Asset, observation,
and visible success/failure signals; generic word overlap alone is insufficient.

When rules conflict:

1. hard Design Bible and validator rules always win;
2. prefer explicit recent rejection over conflicting approval;
3. then prefer explicit recent approval;
4. prefer narrower scope: exact Asset/query strategy, Subject, Catalog, global;
5. consider larger evidence count, then recency;
6. preserve both records and mark superseded history rather than deleting it.

Repeated active records may be summarized into `learned-rules.md`, but the
source records remain. Never automatically edit the Design Bible or Subject
files.

Do not learn permanent preferences from automatic validator rejections,
unreviewed questions, temporary download/network failures, invalid input, or
unclear feedback. Those failures may appear only in generation metrics.

## Mixed Feedback

Split mixed feedback into independent records. For “Question 5 is very good, but
the image is promotional and too obvious,” record positive question-structure
feedback in approval history and negative Asset feedback in rejection history.
Do not approve the Asset. Preserve the original comment in both records or link
them through the same review action.

## Summarization

Repeated active rejection patterns and positive preferences may be summarized in
`learned-rules.md`. Keep the two sections separate and retain all underlying
history. Never automatically modify the Design Bible or factual Subject files.
