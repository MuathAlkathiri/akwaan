---
name: video-content-designer
description: Acquires, clips, localizes, and validates essential video Assets for Akwaan ContentItems.
---

# Video ContentItem Designer

## Workflow

1. Apply `../asset-search-planner/SKILL.md` and receive multiple video queries.
2. Check `../../cache/search-history.json` using Subject, event, required
   observation, Pattern, and Media type; search only when reuse is invalid.
3. Rank candidates with `../asset-quality-ranker/SKILL.md`. Reject fan edits,
   AMVs, reactions, heavy overlays, altered footage, wrong scenes, and other
   hard failures regardless of score.
4. Check `../../cache/asset-index.json` by source, checksum when available, scene
   intent, interval, and leakage safety. Reuse only a validated local Asset that
   is not overused in the batch.
5. Select a bounded interval; never use a full episode or unnecessarily long
   file as the final Asset.
6. Download locally only when required, then use the project's existing clipping workflow when
   available. Do not fabricate success when downloading or clipping fails.
7. Save under the configured output directory with a stable filename that does
   not expose the answer.
8. Verify existence, non-zero size, supported container/codec, readable duration,
   correct start/end, and successful playback or probing.
9. Inspect frames, subtitles, thumbnails, overlays, audio, and metadata for
   answer leakage, manipulation, and preserved original context. Reject any
   interval in which the answer is spoken — announcer calls, dialogue, voice
   lines, or narration (`AUDIO_ANSWER_LEAKAGE`) — or displayed in HUD/onscreen
   text; a leaking segment is an `INVALID_MEDIA_SEGMENT` and must be re-clipped
   or replaced before the ContentItem is complete.
10. Run the mandatory Blind Asset Test on the final bounded interval while the
    answer, filename, `mediaDescription`, rationale, search query, and hidden
    metadata are unavailable. Reject with `INSUFFICIENT_ASSET_EVIDENCE` when
    the visible/audible interval alone cannot support the intended answer, and
    reject with `TARGET_NOT_VISIBLE` / `TARGET_NOT_VISUALLY_DOMINANT` when the
    asked-about object, mode, or location is absent, tiny, or not dominant.
11. Confirm the ContentItem requires observation of the clip; a clip illustrating a
   fact already answerable from text is decorative.
12. Record real Asset metadata and return score, ranking reasons, cache
   hit/miss, reuse/download status, rejections, and exceptions for generation
   metrics.
13. Store the relative local path in the existing schema and preserve source
   attribution separately when supported.

Reject remote-only URLs, full episodes, placeholders, broken clips, ambiguous
intervals, ranking hard failures, rejected cache records, missing metadata, and
clips that reveal the answer. A failed Asset blocks that ContentItem until repaired
or replaced.

For Equipment Recognition, the bounded clip must clearly show the item in hand,
in-world, in close-up, or during placement, activation, or use. A match where
the equipment is merely selected or presumed does not pass.
