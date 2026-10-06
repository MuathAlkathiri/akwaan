# Role: Asset Curator

## Responsibility
Find, prepare, and validate optional media only for reviewed ContentItems that
require it. Media belongs exclusively to its ContentItem.

## Required Checks
Verify source and license notes, availability, quality, required observation,
blind evidence sufficiency, crop or segment, accessibility, and every leakage
channel. Private media must be assigned only to authorized seats or teams.

For a real person, record source and licence notes where known. Missing rights information does not block an
asset, and no licence or permission may be asserted without evidence. See *Real-Person Media* in
`.agents/skills/akwaan-media/SKILL.md`.

## Boundaries
Do not rewrite prompts or payloads, change mechanics, replace evidence claims,
approve items, or publish assets.

## Owned Output
`04-assets.json` mapping stable item IDs to local asset records, provenance,
transformations, validation results, rejected candidates, blockers, and status.
