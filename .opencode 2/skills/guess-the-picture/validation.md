# Puzzle Validation

## Purpose

Validate that every puzzle is linguistically correct, visually clear, fair to solve, and provides a genuine rebus experience.

No `generated_image` Asset task may be sent to a future provider until every
linguistic validation stage passes.

Failure at any stage immediately rejects the candidate.

The validator may never "repair" a failed puzzle.
It must reject the candidate and require the designer to choose a new answer.

---

# Stage 1: Phonetic Match

Concatenate the `intendedArabicWord` values from left to right.

Normalize both the concatenation and the target answer.

Pass only when:

- exact normalized match, or
- a documented natural spoken pronunciation.

Reject when:

- sounds are missing,
- sounds are added,
- sounds are reordered,
- pronunciation depends on English,
- pronunciation requires explanation.

The validator may never override a failed phonetic match.

---

# Stage 2: Native Speaker Solvability

A native Arabic speaker should reasonably discover the answer without external hints.

Reject when:

- hidden logic is required,
- pronunciation feels forced,
- image order is misleading,
- the relationship is only semantic,
- solving requires explaining the puzzle afterward.

---

# Stage 3: Image Naming Clarity

Each image should have one obvious Arabic name.

Reject when:

- multiple common Arabic names are equally likely,
- the intended word is not the first thing most players would say,
- the image contains distracting secondary objects,
- the subject is too small or unclear.

---

# Stage 4: Answer Uniqueness

The puzzle should strongly suggest one intended answer.

Reject when:

- multiple answers are equally valid,
- another pronunciation fits equally well,
- different image names produce different answers.

---

# Stage 5: Rebus Validation

The puzzle must produce a NEW answer through spoken sound composition.

Reject immediately when:

- the answer simply describes the displayed images,
- the answer is just the image names concatenated,
- the answer is a literal phrase represented directly by the images,
- there is little or no semantic surprise.

Examples of rejected puzzles:

❌ حقيبة + يد = حقيبة يد

❌ قلم + حبر = قلم حبر

❌ ساعة + حائط = ساعة حائط

❌ فنجان + قهوة = فنجان قهوة

Examples of accepted puzzles:

✅ سم + بوسة = سمبوسة

---

# Stage 6: Semantic Surprise

A successful puzzle should create an "Aha!" moment.

The player should feel they discovered something new.

Reject when:

- the answer is immediately obvious by describing the pictures,
- there is no transformation,
- the puzzle feels trivial,
- the puzzle resembles a vocabulary exercise rather than a rebus.

---

# Stage 7: Final Board Inspection

Confirm:

- correct dimensions,
- equal card sizes,
- consistent spacing,
- centered plus signs,
- no clipping,
- no overlap,
- no answer leakage,
- no captions,
- no visible text,
- images remain clearly recognizable.

---

# Validation Result

```json
{
  "phoneticMatch": "exact | natural | failed",
  "nativeSpeakerSolvability": "high | medium | low",
  "imageNamingClarity": "high | medium | low",
  "answerUniqueness": "high | medium | low",
  "literalDescriptionMatch": true,
  "semanticSurprise": "low | medium | high",
  "visualAmbiguityRisk": "low | medium | high",
  "passed": false
}
```

---

# Passing Requirements

A puzzle passes only when:

- phoneticMatch is `exact` or `natural`
- nativeSpeakerSolvability is `high`
- imageNamingClarity is `high`
- answerUniqueness is `high`
- literalDescriptionMatch is `false`
- semanticSurprise is `high`
- visualAmbiguityRisk is `low`

If any requirement fails:

- Reject the candidate.
- Do not repair it.
- Do not regenerate images.
- Choose a completely new answer.

## Validator Authority

The validator has final authority.

If the validator rejects a puzzle, no downstream component may continue.

The image generator, board composer, and exporter must not run for rejected puzzles.
