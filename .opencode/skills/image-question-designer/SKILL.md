---
name: image-question-designer
description: Acquires, localizes, and validates essential image Assets for Lammah questions.
---

# Image Question Designer

## Input

An Asset task containing Subject, Question Pattern, required visual observation,
safe destination directory, supported project formats, and intended difficulty.

## Workflow

1. Locate a lawful, suitable source and retain source attribution separately.
2. Inspect the image against the intended observation before using it.
3. Prefer scenes, natural screenshots, gameplay, in-world appearances, objects,
   and contextual detail. Reject answer-dominated posters, promotional renders,
   named wallpapers, selection screens, and visible answer text.
4. Download or copy the image into the configured local output directory with a
   stable descriptive filename that does not expose the answer to players.
5. Verify the file exists, is non-empty, decodes successfully, has a supported
   format, and is readable at the intended display size.
6. Apply leakage, fairness, single-channel, and Media removal tests.
7. Store only the valid relative local path in the existing question schema.
   Preserve source URL or attribution in an existing separate field when the
   schema supports it; do not silently add or rename fields.

A remote URL, placeholder, fabricated path, or failed download is incomplete.
Do not approve the affected question.

## Future Extension

`generated_image` is a provider-neutral future Asset task. No provider, API,
SDK, key, or generation implementation is defined here. Such a task cannot be
complete without a real local file that passes every image check.
