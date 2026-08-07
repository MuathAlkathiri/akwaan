# Wigolo Research and Media-Discovery Tool Contract

## Place in the Co-op System

Wigolo is the standard Tool for web research, source discovery, and media
discovery. It is not a Role, World, Challenge, Content Scope, or Knowledge
Skill. Roles decide why research is needed; this contract governs how Tool
results are gathered and handed off.

The contract is intentionally provider-agnostic. Wigolo may later be replaced
by another research provider if the replacement preserves the same quality,
safety, provenance, and deterministic handoff requirements.

## Authorized Roles

- Content Researcher: factual research and source discovery.
- Question Reviewer: narrow verification of a specific factual concern.
- Asset Curator: image, video, and audio-source discovery.
- Content QA: only to resolve a named verification blocker that upstream files
  cannot settle.
- Question Writer: normally does not browse; it relies on the approved research
  brief unless the task manifest explicitly authorizes a bounded search.

Tool use never expands the assigned World, Challenge, or Content Scopes.

## Supported Uses

- web research and cross-source verification;
- official and authoritative source discovery;
- image, video, and audio-source discovery;
- locating a relevant scene, moment, interval, or timestamp;
- finding multiple candidates for one exact asset requirement;
- checking current or evolving facts that durable knowledge intentionally marks
  for fresh verification.

Use local cache discovery first when available. A cache hit must still match the
exact claim or asset intent and remain current enough for the task.

## Source Quality Order

Prefer, in order:

1. official sources;
2. first-party publishers or rights holders;
3. authoritative databases;
4. reputable editorial sources;
5. community sources only when appropriate, necessary, and clearly labeled.

Source quality depends on the claim. A primary episode, chapter, match record,
or official release may be stronger evidence than a summary page. A community
source can help locate a moment but should not silently become authority for a
disputed fact.

## Forbidden Behavior

- never treat a search snippet as a verified fact;
- never invent, repair, or approximate a URL or source;
- never treat one result as sufficient when a claim is disputed or evolving;
- never download, publish, or transmit directly unless the environment and task
  explicitly authorize that exact action;
- never choose media that exposes the answer;
- never prefer an unattributed social-media repost when a better source exists;
- never alter a question or intended answer to fit a poor asset;
- never hide uncertainty, failed retrieval, source disagreement, or licensing
  risk;
- never copy Tool output into player-facing content without Role review.

## Media Candidate Checks

Inspect candidates for:

- visible or spoken answer leakage;
- subtitles, captions, labels, and overlays;
- watermarks and unattributed edits;
- player-visible filenames;
- scoreboards, interfaces, or HUD text that expose the answer;
- image clarity and crop suitability;
- audio clarity and competing narration;
- video length and exact usable timestamp;
- whether the actual media contains the required evidence;
- provenance, authenticity, and modification risk;
- licensing uncertainty and availability.

Relevance is not enough. The player-facing media must support the intended
Challenge action without directly giving away the answer.

## Verification Discipline

Open and inspect the selected source rather than relying on its result title or
snippet. For disputed or changing claims, seek independent corroboration at the
appropriate source level. Separate factual verification from asset suitability:
a page can prove a fact while its image remains unusable for play.

Record failed candidates and why they failed when that information prevents the
next Role from repeating the same search.

## Deterministic Tool Handoff

Every Tool-assisted handoff must contain:

- `query`: exact query or retrieval request;
- `purpose`: the claim or asset requirement being investigated;
- `sourcesChecked`: ordered sources with stable URLs or identifiers;
- `selectedSource`: selected source or explicit `none`;
- `alternatives`: viable and rejected alternatives with reasons;
- `factualNotes`: what the opened sources support;
- `assetNotes`: media-specific observations, timestamp, crop, or interval;
- `uncertainty`: disputes, freshness limits, or confidence constraints;
- `unresolvedRisks`: provenance, licensing, access, leakage, or quality blockers.

The handoff belongs in the assigned Role output, not in hidden conversation
context. Tool results do not approve a question or asset and never bypass human
approval or manual publication.
