# Generated Image Asset Contract

## Status

This is a provider-neutral future extension contract. No generator, provider,
API, SDK, or key is configured or implemented by this Skill. Do not claim that
an image was generated.

## Style

Default style:

- photorealistic or polished semi-realistic,
- bright studio lighting,
- clean neutral background,
- centered subject,
- strong contrast,
- no text,
- no watermark,
- no logos,
- mobile and TV readable.

## Future Process

For each approved visual concept:

1. Create a `generated_image` Asset task only after linguistic validation.
2. Describe the approved visual concept without changing its Arabic phonetics.
3. Hand the task to a future configured provider outside this Skill.
4. Treat the task as incomplete until a real local image exists.
5. Inspect and validate the local file.
6. Save it using a deterministic, answer-safe filename.

## Critical distinction

Arabic is used for puzzle reasoning.

Another language may be used only in a future provider prompt after the Arabic
puzzle has passed validation.

A future image provider must never influence the linguistic decomposition.

## Failure handling

Reject the Asset when:

- the intended subject is missing,
- the subject is too small,
- text appears,
- the action is unclear,
- extra objects introduce ambiguity,
- the output does not match the approved concept.

Do not create placeholders or fake generated images. Without an actual validated
local file, the puzzle cannot be marked complete.
