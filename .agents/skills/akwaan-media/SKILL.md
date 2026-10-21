---
name: akwaan-media
description: >-
  Workflow skill for curating, inspecting, and attaching media assets for Akwaan content.
  Use when reviewing, selecting, or validating images, audio intents, and media metadata.
---

# Akwaan Media Workflow

## Responsibilities
- Follow the canonical Akwaan media architecture and pipeline (`ai/.opencode/roles/ASSET-CURATOR.md`, `ai/.opencode/media-intents/`, and backend media storage).
- Never invent a second or parallel media pipeline.
- Distinguish authoring from media enrichment: content items define media requirements/intents during authoring before assets are curated or attached.
- Do not publish, replace, or upload media assets without explicit review.

## Real-Person Media (canonical — Product decision 2026-10-04)

**This is the canonical statement of the rule. Other documents reference it; they do not restate it.**

Rights clearance is **not** an Akwaan readiness gate. A Celebrities item is not blocked from authoring,
promotion, Production or public release because a licence is unknown, permission has not been obtained, or a
likeness basis has not been established. A superseded policy briefly required a two-layer clearance before
release; the Product owner reversed it.

**What that means, exactly.** It means Akwaan does not gate on rights. It does **not** mean an asset is legally
cleared, and it does not mean permission exists. Never record or report an asset as rights-cleared on the
strength of this rule.

**Select media on gameplay merit**, in this order: recognizability · gameplay suitability · image quality ·
clean composition · no answer leakage · stable source/provenance where practical. Do **not** reject a strong
celebrity image solely because it is not Creative Commons, not Public Domain, carries no permission, or has
unknown likeness status.

**Record provenance when you have it** — source URL, provider, asset hash, original filename, author/credit,
licence or rights notes. Missing provenance does not make an item unusable. **Never invent a licence, a
rights holder or a permission that was not evidenced**, and never convert an unknown state into a cleared one.

**Rights evidence may still be recorded** in the `media_rights` registry (`backend/src/modules/media-rights/`),
which remains available as optional informational metadata with Admin APIs, impact lookup and effective-status
derivation. Its status is advisory: it does not affect ContentItem readiness, local gameplay, World activation,
Production promotion or release readiness.

**The media quality gates below remain mandatory** — leakage, clarity, framing, and the mechanic invariants.
Those are gameplay correctness, not rights.

## Visual Media Guidelines & Inspection

1. **Integral Gameplay Support**:
   - Visual media must directly support and be required for the challenge.
   - For **Bomb (`bomb`)**, the image is part of the question; generic substitute images or decorative placeholders are strictly unacceptable.

2. **Image Inspection Gates**:
   - **Leakage Check**: Verify the image contains no embedded text, watermarks, names, logos, subtitles, or filenames that prematurely reveal the answer.
   - **Clarity & Ambiguity**: Ensure the subject is unmistakable and cleanly identifiable to avoid player confusion.
   - **Framing & Crop**: Inspect aspect ratios, zoom levels, and crops so critical details are not cut off across devices.
   - **Licensing & Sourcing**: Record source and licence notes for each asset where they are known. For a
     real person, see *Real-Person Media* above: missing rights information is not a blocker, and a licence
     or permission is never to be asserted without evidence.

3. **Content Contract Compliance**:
   - Verify media attachment format adheres to the target mechanic's policy (e.g., `media.assets` containing `{ url, altText }` for Bomb).
   - Ensure media payloads do not duplicate runtime-owned fields.

4. **Bomb Semantic Alignment (Strict Invariant)**:
   - **Never** associate media to Bomb content items by array position, index, or assumed numerical ordering.
   - Always pair media using stable item identity (`id`), canonical authored `mediaIntent.subject`, and `acceptedAnswers`.
   - QA must validate the complete semantic tuple:
     $$\text{Prompt Type} \longleftrightarrow \text{Authored Subject} \longleftrightarrow \text{Accepted Answers} \longleftrightarrow \text{Actual Visual Subject}$$
     All four elements must identify the **exact same entity**.

5. **Visual Truth & Integrity Invariants (Permanent Rules)**:
   - **`AUTHENTIC_BLANK_CARD_COMPOSITION`**: For FIFA / EA FC player identity questions (`"مين هذا اللاعب؟"`), always use authentic blank-card composition. Never use portrait blur, 2D inpainting, censor bars, silhouettes, striped fills, checkerboards, or obvious patches. Sourcing must use a matching clean blank-card shell from the same card family/edition/promo. If a matching authentic blank card cannot be sourced, reject the candidate.
   - **`PLAYER_IDENTITY_MASKING_AND_DIFFICULTY`**:
     - Always hide: player portrait and player name.
     - **EASY / Base-Gold Cards**: Nationality flag STAYS VISIBLE. Overall rating, position, and all six face stats stay visible.
     - **HARD / Special-Promo-Icon-Hero Cards**: Portrait and name hidden; nationality and direct identity metadata may be hidden. Rating, position, and all six face stats stay visible.
     - **Visible Card Data Integrity**: Position (e.g. ST must not become CT), rating, and stats must remain 100% undamaged, correctly aligned, and authentic.
     - **Difficulty Calibration**: Masking quality never determines difficulty. Difficulty comes strictly from the card variant (Base/Gold $\rightarrow$ Easy; Special/Promo/Icon $\rightarrow$ Hard).
   - **`EVENT_RECOGNITION_VISUAL_TRUTH`**: For FIFA promo event recognition questions (`"وش اسم هذا الحدث؟"`), the prompt must remain neutral and the media itself must carry the challenge. Use a real visual belonging to that exact promo event. `WRONG_EVENT_ASSET_IS_FATAL` — a mismatch between event visual and target event is a fatal defect.
   - **`WRONG_ASSET_IS_FATAL`**: If the underlying media depicts a different player, event, weapon, map, or asset than the intended answer, the item is invalid and must be completely replaced.
   - **`NO_FALSE_VISUAL_VERIFICATION`**: Never claim an asset is visually verified based solely on OCR, file size, dimensions, container headers, or assumed download IDs. Final semantic visual truth requires actual visual inspection and human product review.
   - **`FUTURE_BATCH_HARD_GATE`**: A FIFA `PLAYER_FROM_CARD` item is incomplete unless it has: (1) authentic player-card factual reference, (2) matching authentic blank-card foundation, (3) final composed player-facing asset, (4) exact verified gameplay values, (5) no portrait, (6) no name, (7) difficulty calibrated by card variant, (8) final visual QA, (9) human product review.
   - **`CLEAN_CARD_CROP`**: Assets must be authentic in-game visuals cleanly cropped of all external sidebars, companion app UI, hover widgets, and synthetic overlays.

6. **Odd Piece Composition (Cars Signature — scoped addition)**:
   - **`ODD_PIECE_AUTHENTIC_PART_COMPOSITION`**: Applies to Cars `odd-piece` content only. It does **not** alter, relax, or override `AUTHENTIC_BLANK_CARD_COMPOSITION` or any other FIFA-specific rule in §5, all of which remain binding for FIFA player-card content.
     - **Authentic source required**: every one of the four pieces must originate in a photograph of a **real vehicle** and must depict a **real part of that vehicle**. The intruder piece must be truthfully attributable to a **different real vehicle**, recorded by make, model, generation and year in `vehicleIdentity`.
     - **Localized editing permitted**: AI-assisted, mask-bounded, photorealistic edits may be used to integrate the intruder convincingly and to raise presentation quality — background neutralization, exposure/white-balance/colour harmonization, crop and perspective normalization, and removal of badges, text, watermarks or UI that would leak the answer.
     - **Prohibited**: synthesizing a whole vehicle or a whole part; generating an image without an authentic source photograph; altering, adding or removing identity-bearing features (model-defining badges, distinctive light signatures, grille geometry, body lines) such that a part no longer honestly represents its real source vehicle; fabricating a part that does not exist on that vehicle; and falsely attributing a part to a vehicle it does not belong to.
     - **`ODD_PIECE_IS_NOT_SPOT_THE_DIFFERENCE`**: the intruder must be findable by recognizing automotive identity and never by detecting edit artifacts, resolution or sharpness mismatch, lighting or colour-grade discontinuity, background mismatch, or crop-style mismatch. Any edit that makes the intruder identifiable **without automotive knowledge** is a fatal defect. Editing exists to remove such shortcuts, not to introduce them.
     - **Mandatory authentic reveal**: the full target-vehicle reveal image must depict the authentic target vehicle and must not be synthesized or identity-altered. Missing reveal media is a content-readiness failure and never a reason to omit the reveal.
     - **Provenance required**: record `sourceUrl`, `licenceNote` where known, and `assetOrigin` (`authentic` | `ai-edited`); for `ai-edited`, also record `editedRegion` and `editModel`. See `ai/.opencode/knowledge/architecture/MEDIA-CONTRACT.md`. Rights remain **advisory and not a readiness gate** (Product decision 2026-10-04); this clause does not change that.
     - **Human visual inspection is mandatory**: `NO_FALSE_VISUAL_VERIFICATION` applies in full. No automated identity check, vision model, OCR result or provenance record substitutes for a human confirming that each part depicts the vehicle it claims.
