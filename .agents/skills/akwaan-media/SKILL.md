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
