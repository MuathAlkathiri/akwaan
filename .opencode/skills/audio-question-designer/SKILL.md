---
name: audio-question-designer
description: Acquires, clips, localizes, and validates essential audio Assets for Lammah questions.
---

# Audio Question Designer

Use audio only when the Catalog or Subject has meaningful voice, dialogue,
music, or sound-recognition opportunities.

1. Locate and verify a suitable source.
2. Select a bounded clip containing enough information for one fair answer.
3. Download locally and use existing project clipping support when available.
4. Save with a stable, answer-safe filename in the configured output directory.
5. Verify existence, non-zero size, supported format/codec, readable duration,
   and successful playback or probing.
6. Reject clipped speech, noise, tags, spoken introductions, or metadata that
   expose the answer or make attribution ambiguous.
7. Ensure text does not independently identify the speaker or source and that
   removing audio makes the question unsolvable or materially different.
8. Store a relative local path in the existing schema and retain attribution
   separately when supported.

A URL, placeholder, failed download, or unreadable clip is not completion and
blocks approval of the affected question.
