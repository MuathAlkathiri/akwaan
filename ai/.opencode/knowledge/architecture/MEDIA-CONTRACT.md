# Media Contract

Media is optional ContentItem data. It must be essential, clear, attributable,
available, and safe. Validate the player-facing asset without filename,
metadata, rationale, or hidden notes. Reject decorative media and every visible,
spoken, encoded, or private-channel leak.

For an identifiable real person, "attributable" means recording the source and any known rights information,
not holding a clearance: rights state is not an Akwaan readiness gate, and an unknown licence never blocks an
item. It equally never licenses a claim that an asset is cleared. See *Real-Person Media* in
`.agents/skills/akwaan-media/SKILL.md`.

## Asset provenance vocabulary — PROPOSED, NOT IMPLEMENTED

These five concepts describe what an authored asset record *should* carry so
that how an image came to exist is written down rather than remembered. They are
**authoring vocabulary only**.

> **Status: DESIGN APPROVED — NOT IMPLEMENTED.** No runtime schema defines these
> fields today, no DTO accepts them, and `ContentItemCompatibilityPolicy` does
> not read them. Nothing here permits a schema migration or a new READY blocker.
> Whether `assetOrigin` ever becomes blocking is an open Product decision.

| Concept | Meaning |
| --- | --- |
| `assetOrigin` | `authentic` — an unmodified source asset, beyond format conversion and lossless crop; or `ai-edited` — an authentic source asset with localized, mask-bounded edits. There is deliberately no third value: an asset with no authentic source is not publishable content. |
| `sourceUrl` | Where the authentic source came from. Recorded for every asset, `authentic` or `ai-edited`. |
| `licenceNote` | What is known about the right to use the source — a free-text note, not a clearance claim. Consistent with the 2026-10-04 decision that rights are advisory and never a readiness gate; an unknown licence never blocks an item and never licenses a claim that an asset is cleared. |
| `editedRegion` | For `ai-edited` only: the bounded region that was altered, as fractions of the source image (`x`, `y`, `width`, `height`), so a reviewer can see what was touched without comparing files by eye. |
| `editModel` | For `ai-edited` only: which model and version performed the edit, so an edit can be traced, reproduced, or re-reviewed when a model is found to misbehave. |

Recording provenance is not verification. `NO_FALSE_VISUAL_VERIFICATION` still
applies: a complete provenance record never substitutes for a human confirming
that an asset depicts what it claims to depict.
