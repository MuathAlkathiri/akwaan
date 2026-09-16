# Celebrities World Authoring Rules

## Non-Negotiable Real-Person Media Rule
Celebrity content strictly requires AUTHENTIC REAL-PERSON MEDIA. 
AI-generated people, fictional lookalikes, stock models, and synthetic faces are FORBIDDEN.

### Workflow:
1. **Person Selection**: Choose real celebrities based on the Scope (Saudi, Arab, TV/Cinema, Singers, Athletes). Focus on recognizability, cultural relevance, and fairness. Do not invent names.
2. **Media Discovery (Wigolo)**: Use Wigolo to retrieve authentic photos. Shutterstock is the preferred source.
3. **Identity Verification**: Before accepting an image, prove it is the intended celebrity using available metadata (caption, editorial description, event context). 
   - Record: `TARGET_PERSON`, `SOURCE`, `SOURCE_PAGE`, `IDENTITY_EVIDENCE`, `AUTHENTIC_PHOTO = TRUE/FALSE`.
   - Reject if identity is uncertain.
4. **Avoid Wrong-Person Media**: Ensure the intended person is visually clear and prominent. Watch for similar names, co-stars, teammates, etc.
5. **Licensing**: Record source and rights. Do not silently use watermarked preview images as production-owned assets.
6. **Attach/Store**: Use Akwaan's canonical media workflow. Never invent a second media pipeline.


## Subject-Prominence & Reveal-Friendly Image Selection

When Wigolo returns multiple authentic real-person images for a celebrity, **do NOT choose merely the first valid identity match**. Prefer the candidate that best supports gameplay, especially for the `ekshifni` mechanic.

### 1. Primary Subject
- The intended celebrity MUST be the clear PRIMARY SUBJECT.

### 2. Preference Criteria (The "Good" Image)
Prefer images where:
- The face/upper body is large enough to matter visually.
- The celebrity occupies a meaningful portion of the frame.
- The subject is reasonably centered or compositionally dominant.
- The background is secondary.
- There are few or no distracting secondary people.
- The image quality is sufficient for masking, blur, or progressive reveal.

### 3. Rejection Criteria (The "Bad" Image)
Avoid images where:
- The celebrity is very small in the frame.
- Multiple people compete equally for attention.
- The person is mostly hidden already.
- Strong text, logo, or names leak the answer instantly.
- A jersey, nameplate, or caption makes identity trivial.
- The required crop would destroy recognizability.
- The background dominates the frame.

### 4. Gameplay Goal: Progressive Reveal
The media should support a **FUN PROGRESSIVE REVEAL**. The player should gradually gain useful identity information.
- It should NOT reveal the answer instantly through text.
- It should NOT remain impossible even after a meaningful reveal.
- It should NOT depend on tiny background details.

**Rule of Thumb:**
RECOGNIZABLE SUBJECT + CONTROLLED VISUAL INFORMATION + GOOD REVEAL POTENTIAL
*over*
PRETTIEST PHOTO or FIRST VALID SEARCH RESULT.

### 5. Authoring Metadata Logging
Where the existing authoring or review format supports it, record these metrics as guidance:
- `SUBJECT_PROMINENCE`: HIGH / MEDIUM / LOW
- `REVEAL_FRIENDLINESS`: HIGH / MEDIUM / LOW
- `ANSWER_LEAKAGE_RISK`: LOW / MEDIUM / HIGH

*For `ekshifni` candidates, prefer: SUBJECT_PROMINENCE = HIGH, REVEAL_FRIENDLINESS = HIGH, ANSWER_LEAKAGE_RISK = LOW.*

### Hard Failure Conditions
Reject the asset if ANY of these is true:
- `REAL_PERSON_PHOTO = FALSE`
- `IS_LOGO = YES`
- `IS_CHANNEL_ICON = YES`
- `IS_BRAND_MARK = YES`
- `IS_MASCOT = YES`
- `IS_ILLUSTRATION = YES`
- `IS_DIGITAL_ART = YES`
- `IS_CARTOON = YES`
- `IS_STYLIZED_AVATAR = YES`
- `IS_SYMBOL = YES`
- `TARGET_PERSON_VISIBLE = NO`
- `TARGET_IS_PRIMARY_SUBJECT = NO`
- `ANSWER_LEAKAGE_RISK = HIGH`
- The celebrity appears only as one person in a group where they are not clearly dominant.
- `IDENTITY_VERIFIED = FALSE`
- `AI_GENERATED = TRUE`
- `FICTIONAL_LOOKALIKE = TRUE`
- `WRONG_PERSON = TRUE`

**IMPORTANT — PROFILE AVATARS:**
An official YouTube, X, or Instagram profile image may be a logo, channel branding, illustration, mascot art, or stylized identity artwork.
Therefore, `OFFICIAL_PROFILE = YES` does **NOT** imply `REAL_PERSON_PHOTO = YES`.
The image itself must be visually inspected and must be an actual photograph of the target human being.
There is NO generated-image or logo fallback for Celebrity identity media.


## INITIAL LAUNCH CONTENT BASELINE

*(Note: Target only, content does NOT exist yet)*

**Per Scope:**
- `ekshifni`: 9
- `read-your-opponent`: 3
- `closest`: 3
- `bomb`: 3
**Total per Scope:** 18

**World Total:**
- `ekshifni`: 45
- `read-your-opponent`: 15
- `closest`: 15
- `bomb`: 15
**Total for Celebrities:** 90

## Canonical Unique Person-Image Mapping
UNIQUE_PERSON_IMAGE_MAPPING

Hard rule:
- One active celebrity card must map to the verified target person.
- Two different celebrities may not share the same source image.
- Identical binary across different identities = HARD FAIL.
- Same perceptual image / near-identical crop across different identities = HARD FAIL.
- Source label and local rendered image must agree.
- Verified real-person photo of the WRONG person = HARD FAIL.

## Canonical Source Image Integrity
SOURCE_IMAGE_INTEGRITY

Hard rule:
- Prefer a naturally suitable original source image.
- Do not create a pre-cropped derivative merely to improve reveal framing.
- Do not AI-upscale, reconstruct, or alter identity-bearing facial content.
- Clear-window geometry is responsible for partial revelation in the Ekshifni mechanic.
- If the original framing is poor, source a better image rather than forcing it through an authoring crop.
