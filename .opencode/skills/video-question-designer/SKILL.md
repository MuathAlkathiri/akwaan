---
name: video-question-designer
description: Acquires, clips, localizes, and validates essential video Assets for Lammah questions.
---

# Video Question Designer

## Workflow

1. Locate and verify a suitable source for the intended observable moment.
2. Select a bounded interval; never use a full episode or unnecessarily long
   file as the final Asset.
3. Download locally, then use the project's existing clipping workflow when
   available. Do not fabricate success when downloading or clipping fails.
4. Save under the configured output directory with a stable filename that does
   not expose the answer.
5. Verify existence, non-zero size, supported container/codec, readable duration,
   correct start/end, and successful playback or probing.
6. Inspect frames, subtitles, overlays, audio, and metadata for answer leakage.
7. Confirm the question requires observation of the clip; a clip illustrating a
   fact already answerable from text is decorative.
8. Store the relative local path in the existing schema and preserve source
   attribution separately when supported.

Reject remote-only URLs, full episodes, placeholders, broken clips, ambiguous
intervals, and clips that reveal the answer. A failed Asset blocks that question
until repaired or replaced.
