---
name: audio-content-designer
description: Acquires, clips, localizes, and validates essential audio Assets for Akwaan ContentItems.
---

# Audio ContentItem Designer

Use audio only when the Catalog or Subject has meaningful voice, dialogue,
music, or sound-recognition opportunities.

1. Apply `../asset-search-planner/SKILL.md` and receive multiple audio queries.
2. Check `../../cache/search-history.json` by full normalized intent.
3. Rank candidates with `../asset-quality-ranker/SKILL.md`; hard-reject
   inappropriate remixes/covers, fan dubs, wrong sounds, answer leakage, noise,
   distortion, and unrelated narration.
4. Check `../../cache/asset-index.json` by source, checksum when available,
   sound/scene intent, and leakage safety. Reuse only a valid local Asset that
   is not overused in the batch.
5. Select a bounded clip containing enough information for one fair answer.
6. Download only when needed and use existing project clipping support when
   available.
7. Save with a stable, answer-safe filename in the configured output directory.
8. Verify existence, non-zero size, supported format/codec, readable duration,
   and successful playback or probing.
9. Verify the intended sound is audible and reject silence or heavy distortion.
10. Reject clipped speech, noise, tags, spoken introductions, or metadata that
    expose the answer or make attribution ambiguous. Reject any clip in which
    the answer is spoken at all — announcer calls, dialogue, voice lines, or
    narration (`AUDIO_ANSWER_LEAKAGE`); a leaking segment is an
    `INVALID_MEDIA_SEGMENT` and must be re-clipped or replaced before the
    ContentItem is complete.
11. Ensure text does not independently identify the speaker or source and that
    removing audio makes the ContentItem unsolvable or materially different.
12. Run the mandatory Blind Asset Test on the final bounded interval while the
    answer, filename, `mediaDescription`, rationale, search query, and hidden
    metadata are unavailable. Reject with `INSUFFICIENT_ASSET_EVIDENCE` when the
    audio alone cannot support the intended answer, including when the
    asked-about sound/voice is silent, inaudible, or buried (`AUDIO_UNCLEAR`).
    A clip whose sound is decorative or answerable without listening is
    rejected.
13. Record real Asset metadata and return score, ranking reasons, cache
    hit/miss, reuse/download status, rejections, and exceptions for generation
    metrics.
14. Store a relative local path in the existing schema and retain attribution
    separately when supported.

A URL, placeholder, failed download, unreadable clip, ranking hard failure,
rejected cache record, or missing metadata is not completion and blocks approval
of the affected ContentItem.
