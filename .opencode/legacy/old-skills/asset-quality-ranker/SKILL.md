---
name: asset-quality-ranker
description: Compares candidate image, video, and audio Assets using one shared 0–100 quality score and hard-rejection rules.
---

# Asset Quality Ranker

Rank candidates before selection or download. Select the highest-scoring
suitable candidate, not merely the first result. A hard rejection always
overrides the numeric score.

Applicable explicit approvals may provide a small tie-break or preference boost
for an exact Asset, source type, or repeatedly successful source at its proper
scope. Keep the base quality score separate from the user-preference boost.
Never permanently trust a source from one approval, and never let approval
override a hard rejection or current inspection.

## Score: 0–100

| Factor | Weight |
|---|---:|
| Relevance to intended question and required observation | 25 |
| Source authority and reliability | 15 |
| Media dependency | 15 |
| Clarity and technical quality | 15 |
| Answer-leakage safety | 10 |
| Non-promotional authenticity | 10 |
| Editing/manipulation safety | 5 |
| Licensing or provenance availability | 5 |

Cropping suitability, watermarks, subtitles, duration, reusability, and format
support are evaluated inside the relevant factor. Record positive and negative
reasons so equal totals remain explainable.

## Hard Rejections

Reject regardless of score:

- wrong Subject, event, scene, or required observation;
- visible answer text or unavoidable answer leakage;
- decorative Media;
- invalid, unreadable, missing, or unsupported file;
- misleading crop or materially altered canonical scene;
- fan edit used for a canonical-scene question;
- AI-generated or altered image unless the Question Pattern explicitly requires
  the existing provider-neutral `generated_image` type;
- full episode when a bounded clip is required.
- `INSUFFICIENT_ASSET_EVIDENCE`: after hiding the answer, filename,
  `mediaDescription`, rationale, query, and hidden metadata, the actual Asset
  does not visibly or audibly support one reasonable intended answer.
- for gaming, content from the wrong title/version or custom/modded content
  presented as canonical.

For Call of Duty, verify title and mode provenance before scoring relevance.
Prefer clean first-person gameplay, in-game spectator frames, official gameplay
stills, original gameplay clips, original extracted game audio, and clean
faithful captures. Reject modified skins that change recognition, custom maps
presented as official, montages/reactions/commentary, answer-text thumbnails,
collages/watermarked edits, remixes/covers, and generic audio that cannot support
one intended answer. A high technical score cannot repair wrong-title content.

Relevance to the topic is not evidence sufficiency. Run the Blind Asset Test on
the actual candidate before assigning the relevance or Media-dependency score.
The candidate must be answer-bearing without displaying or speaking the answer.
Descriptions, filenames, queries, and source-page claims never contribute to
the evidence score.

## Image Priority

Prefer: episode/film screenshot; gameplay screenshot; official scene still;
official match/event photograph; scene-like official promotional still;
official artwork; poster; wallpaper; fan art; AI-altered image.

Fan art and AI-altered images are rejected by default. Strongly penalize or
reject answer labels, large logos, obstructive watermarks, promotional text,
revealing episode titles, thumbnails, collages, fan edits, misleading crops,
heavy blur, excessive subtitles, and decorative borders.

Prefer at least 720px on the longest edge when available. A lower-resolution
Asset may pass only for older or rare Subjects when no better faithful source
exists; record the quality exception and its reason.

## Video Priority

Prefer: official scene/match clip; trusted direct episode/gameplay scene;
official highlight; official trailer; faithful high-quality community upload;
compilation; fan edit; reaction/commentary.

Reject fan edits, AMVs, tributes, reactions, heavy overlays, commentary covering
original audio, mirrored/slowed/reversed/color-altered footage, revealing
thumbnails, and unnecessarily long files. Verify the selected interval contains
the intended event.

## Audio Priority

Prefer: official isolated audio; official song or soundtrack; clean dialogue
from an official scene; clean gameplay voice line; original broadcast audio;
high-quality community extract; remix; cover; fan edit.

Reject an inappropriate remix or cover, fan dub, heavy noise, unrelated
narration, answer-spoken leakage, silence, distortion, and clips that are too
short for fairness or unnecessarily long.

## Result Contract

For every candidate record:

- candidate source and normalized source URL when available;
- Media type and source type;
- score;
- positive reasons and rejection reasons;
- leakage and promotional risks;
- technical observations;
- selected or rejected status;
- documented exception, if any.

Return the selected candidate plus all evaluated candidates for cache and
generation metrics. Do not fabricate observations that were not inspected.
Also return approval evidence matched, preference boost, and any hard-rule
override of a positive preference.
