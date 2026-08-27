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

## Visual Media Guidelines & Inspection

1. **Integral Gameplay Support**:
   - Visual media must directly support and be required for the challenge.
   - For **Bomb (`bomb`)**, the image is part of the question; generic substitute images or decorative placeholders are strictly unacceptable.

2. **Image Inspection Gates**:
   - **Leakage Check**: Verify the image contains no embedded text, watermarks, names, logos, subtitles, or filenames that prematurely reveal the answer.
   - **Clarity & Ambiguity**: Ensure the subject is unmistakable and cleanly identifiable to avoid player confusion.
   - **Framing & Crop**: Inspect aspect ratios, zoom levels, and crops so critical details are not cut off across devices.
   - **Licensing & Sourcing**: Verify source and license notes for each asset.

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

