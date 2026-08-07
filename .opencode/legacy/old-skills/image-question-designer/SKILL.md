---
name: image-question-designer
description: Acquires, localizes, and validates essential image Assets for Lammah questions.
---

# Image Question Designer

## Input

An Asset task containing Subject, Question Pattern, required visual observation,
safe destination directory, supported project formats, intended difficulty,
answer/leakage exclusions, and spoiler/subtitle policy.

## Workflow

1. Apply `../asset-search-planner/SKILL.md` and receive multiple ranked queries.
2. Check `../../cache/search-history.json` using the complete normalized intent.
   Search only when no recent reusable result fits.
3. Rank every candidate before download with
   `../asset-quality-ranker/SKILL.md`; retain scores, positive reasons,
   rejection reasons, and hard failures.
4. Inspect the highest suitable image against the intended observation. Run the
   mandatory Blind Asset Test with the answer, filename, `mediaDescription`,
   rationale, query, and hidden metadata unavailable. Reject with
   `INSUFFICIENT_ASSET_EVIDENCE` unless the pixels alone reasonably support the
   intended answer.
5. Prefer scenes, natural screenshots, gameplay, in-world appearances, objects,
   and contextual detail. Reject answer-dominated posters, promotional renders,
   named wallpapers, selection screens, and visible answer text.
6. Check `../../cache/asset-index.json` by normalized source, checksum when
   available, scene intent, and leakage safety. Reuse a validated local file
   when suitable and not overused in this batch.
7. Download or copy only when reuse is unavailable, into the configured local
   output directory with a
   stable descriptive filename that does not expose the answer to players.
8. Verify the file exists, is non-empty, decodes successfully, has a supported
   format, and is readable at the intended display size. Inspect dimensions,
   aspect ratio, compression, overlays, and watermarks. Prefer 720px or more on
   the longest edge; record a justified exception for older Subjects.
9. Apply leakage, fairness, single-channel, and Media removal tests.
10. Record real Asset metadata and cache usage only after inspection. Return
    ranking score, selected source type, cache hit/miss, reuse/download status,
    rejection counts, and any exception to the generation report.
11. Store only the valid relative local path in the existing question schema.
   Preserve source URL or attribution in an existing separate field when the
   schema supports it; do not silently add or rename fields.

A remote URL, placeholder, fabricated path, failed download, ranking hard
failure, rejected cache record, or missing metadata is incomplete. Do not
approve the affected question.

For Perk Recognition, accept only a clear close-up of the Perk icon; a readable
selection screen where the target icon is visually dominant; or a distinctive
in-game effect that uniquely indicates the Perk. Reject tiny edge icons,
screenshots with several untargeted Perks, metadata-only identity, and icons too
small to distinguish.

For Equipment Recognition, accept only equipment clearly held by the player,
clearly placed in the world, shown as a close-up model, or shown in a bounded
placement/activation/use sequence. Reject ordinary combat frames, off-screen or
hidden equipment, tiny/ambiguous equipment, and frames merely taken from a
match in which the item was equipped.

## Future Extension

`generated_image` is a provider-neutral future Asset task. No provider, API,
SDK, key, or generation implementation is defined here. Such a task cannot be
complete without a real local file that passes every image check.
