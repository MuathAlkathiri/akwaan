---
name: challenge-type-ekshifni
description: Signature Celebrities World mechanic featuring progressive clear-window reveal of an initially obscured real-person photograph.
---

# ChallengeType: اكشفني (ekshifni)

## Identity & Player Experience
A progressive clear-window visual deduction game. Teams compete to identify a famous celebrity whose photograph is initially obscured across the entire frame. Teams take turns buying visual information by selecting one of six numbered clear windows. Each chosen window reveals a crisp rectangular section of the photograph while the surrounding area remains obscured. As windows accumulate, visual certainty increases, but the points available decrease.

## Clear-Window Reveal Dynamics
- **Initial State:** The entire celebrity photograph is presented from the opening second, obscured by default (scaled blur via `EKSHIFNI_OBSCURATION`).
- **Accumulating Windows:** Opening a region turns that specific authored rectangle clear and sharp. Revealed windows stay clear throughout the round and accumulate with subsequent reveals.
- **Player-Controlled Choice:** Players actively choose which region to reveal. There is **NO mandatory or fixed reveal sequence**. Teams decide which visual clue they wish to purchase based on current hypotheses and risk tolerance.
- **Player-Facing Numbers:** Players see neutral numbered buttons 1..6 on their devices. Semantic region roles are authoring metadata and are **never** projected to players, as naming the feature would leak the clue.
- **Value Ladder:** `[5, 4, 3, 2, 1]`. The question starts at 5 points before any reveal. Each window opened costs 1 point. The reward floors at 1 point, so the sixth window remains revealable at 1 point.
- **Initiative and Answering:**
  - Opening initiative rotates across the three items: **A → B → A** (where Team A is the team that selected the challenge).
  - Initiative determines **only** who selects the next clear window.
  - Answering is an open race between eligible teams through standard server-graded text matching (`mode: match`).
  - A wrong answer transfers initiative to the opponent and temporarily parks that team's answer eligibility. One authoritative opponent action (a reveal or an answer submission) restores eligibility.
  - A wrong answer never reveals the celebrity identity.
- **Safety Deadline:** A technical safety deadline of 180 seconds per image bounds stalled rounds without reward.
- **Terminal Resolution:** When an answer is correct or all windows expire, Universal Reveal V1 displays the full unmasked photograph and canonical identity.

## Item Structure
`itemStructure: discrete_triple`
Three items per challenge launch (`EKSHIFNI_ITEM_COUNT = 3`). Each item contains exactly ONE authentic real-person image asset and EXACTLY SIX author-defined reveal windows.

## Payload Contract

An اكشفني item is an ordinary ContentItem with `mode: match`. There is **no** `mode: ekshifni` and **no** `targetAnswer` field.

**`answerPayload`** — `mode: match`, with the celebrity's canonical name and verified aliases in `acceptedAnswers`. The ChallengeType resolves MATCH items (`ANSWER_MODE_COMPATIBLE_ITEM_MODES[EKSHIFNI] === [MATCH]`, and the launcher's `isPlayableItem` asserts the same).

**`media`** — `type: image` with **exactly one** asset carrying a non-empty `url`. Anything else is `EKSHIFNI_IMAGE_INVALID`.

**`mechanicPayload.ekshifni`** — the six reveal regions:
- `variant`: literal string `'ekshifni'` (`EKSHIFNI_PAYLOAD_REQUIRED`).
- `regions`: **exactly 6** (`EKSHIFNI_REGION_COUNT`), or `EKSHIFNI_REGION_COUNT_INVALID`. Each region:
  - `localId` — unique and stable across edits, so recorded reveals never drift onto a different window (`EKSHIFNI_REGION_IDS_INVALID`).
  - `role` — exactly one of `eyes`, `hair-head`, `mouth-facial-hair`, `outfit`, `background`, `distinctive-detail`; each role appears **once** (`EKSHIFNI_REGION_ROLE_INVALID`, `EKSHIFNI_REGION_ROLES_DUPLICATED`).
  - `shape` — `{x, y, width, height}` as fractions of the natural source image, each in `0..1`, width and height strictly positive, with `x + width <= 1.0001` and `y + height <= 1.0001` (`EKSHIFNI_REGION_GEOMETRY_INVALID`).

## Content Semantics & Window Geometry
- **Authentic Real Person:** ONLY authentic real-person photography (`AUTHENTIC_REAL_PERSON_ONLY`). No AI-generated images, synthetic models, CGI renders, or lookalikes.
- **Subject Prominence:** The celebrity must dominate the frame with a clear, well-lit face and upper body.
- **Meaningful Suspense per Window:**
  - Each window must provide a genuine clue (e.g., haircut/forehead, jawline/smile, clothing texture, environmental context) without making the identity trivially obvious on its own.
  - Avoid oversized windows that reveal the entire facial structure in a single window.
  - The `background` window must capture meaningful environmental context (e.g. news set, stadium pitch, studio lights, stage backdrop) rather than generic blank space.
  - The `distinctive-detail` window should highlight an iconic personal attribute (e.g. signature glasses, scarf, microphone, distinctive accessory, hair parting) without encompassing the entire face.
- **Geometry Authoring:** Geometry is defined by fractions of the natural image so windows scale consistently across living-room TVs and mobile phones. Windows are authored by dragging and sizing boxes over the actual image in the Admin editor with a live preview (§29.4). Automatic mask/window placement is not implemented.

## Accepted Answers & Identity Accuracy
- **Full Canonical Name:** Always include the full canonical Arabic name as recognized by the public (e.g. «مصطفى الآغا», «جورج قرداحي»). Avoid solitary common first or last names that could describe many individuals (e.g. «إبراهيم» or «عيسى»).
- **Verified Aliases:** Include verified, widely recognized professional monikers, stage names, or established public aliases.
- **Runtime Normalization:** Rely on the shared runtime answer normalizer (`normalizeAnswer`), which automatically standardizes Arabic orthography (hamzas, taa marbuta/haa, alif maqsura/yaa, tatweel, punctuation, and definite articles). Do not invent artificial spelling permutations in `acceptedAnswers`.

## Leakage Prevention & Gameplay Review Guidance
- **Visual Answer Leakage:** No clear window may frame a name caption, lower-third graphic, news ticker, channel bug, microphone flag bearing the host's name, or visible copyright watermark. Examine set backgrounds and clothing carefully before finalizing geometry.
- **Cross-Mechanic Leakage Risk (Review Guidance):** Reviewers should evaluate the risk of visual answer leakage when a celebrity photograph is also used in other challenge types (such as Bomb or Read Your Opponent) within the same World pool. Prefer distinct photography where feasible so players do not recognize an identical asset across different challenges in the same Match.

## Modality Constraints
- Allowed: `image`
- FORBIDDEN: `audio`, `video`, `none`

## Anti-Patterns
- Using the legacy opaque-mask mental model where unmasked areas were clear; under clear-window reveal, the entire photo is obscured and only authored windows provide clarity.
- Placing windows that solve the celebrity immediately in one reveal.
- Background windows that frame blank walls or monochrome voids.
- Visible branding, logos, or captions in any reveal window.
- Obscure celebrities who lack broad public recognition.
- Fixed-ratio image cropping that shifts fractional window coordinates off target features.

## QA Gates
- `AUTHENTIC_REAL_PERSON_ONLY` (Product rule enforced by human review).
- Runtime policy codes (`backend/src/modules/world-content/domain/ekshifni-content.policy.ts`):
  - `EKSHIFNI_PAYLOAD_REQUIRED`
  - `EKSHIFNI_IMAGE_INVALID`
  - `EKSHIFNI_REGION_COUNT_INVALID`
  - `EKSHIFNI_REGION_IDS_INVALID`
  - `EKSHIFNI_REGION_ROLE_INVALID`
  - `EKSHIFNI_REGION_ROLES_DUPLICATED`
  - `EKSHIFNI_REGION_GEOMETRY_INVALID`
