# Mechanic Profile: Bomb (سؤال القنبلة)

## Identity & Player Experience
Rapid-fire, high-pressure recognition. The clock is continuous; hesitation is punished. Players must recognize the subject instantly from clean, distinctive evidence.

## Gameplay / Authoring Contract
No extra reading. No complex inference. The prompt must be $<70$ chars. The image MUST be instantly clear.

## Item Structure
1 Prompt (Text). Exactly 1 image.

**Every Bomb item carries an image** (Product decision 2026-11-22, roadmap §23.4).
A text-only item is not a Bomb item. This holds for every World and every
archetype, name completion included: the item still asks for the name, and it
shows the person, club or thing the prompt is about.

## Payload Contract
`mode: 'match'`
Run cardinality: 10–15 items per pack.

## Answer Semantics
1-10 accepted aliases. Max 120 chars each.
Brevity must preserve uniqueness.

## Modality Constraints
- Required: `image` — exactly one, on every item.
- FORBIDDEN: `none` (text-only). Forward authoring only: text-only items that
  already exist keep running, and the runtime contract still accepts them.
- FORBIDDEN: `audio` (Clock continuous mechanics do not support audio-driven items).

## Mechanic-Native Quality Bar
- Fast-Answer Naming: Prefer the SHORTEST widely recognized unique designation.
- Prompt & Answer Granularity Alignment (e.g. "وش هذا السلاح؟" -> "Ray Gun").

### Cars World specialization

When Bomb is used with the Cars World, apply the mechanic-specific fast-answer
contract here: use the shortest unambiguous model or trim designation; reject
generic labels such as `Turbo`, `Sport`, `RS`, or `GT` when they are ambiguous;
align prompt granularity with the requested model/trim; normalize only
punctuation, spacing, and equivalent Arabic/English transliterations; and do
not accept a manufacturer-only fallback for a model question. Manufacturer
branding may remain, but readable model/trim badges or plate text that answer
the prompt must be cropped or obscured. This specializes Bomb and does not
replace the global contextual leakage rule in QUESTION-CRAFT.

### Football World specialization

When Bomb is used with the Football World, each 3-item set carries exactly one
name-completion item (`NAME_FRAGMENT`) and at least two media-recognition items
(roadmap §23.4: ≈ 1/3 name fragment, ≈ 2/3 media recognition).

- Name completion: the famous surname is in the prompt and the less familiar
  first name is the answer (`"وش الاسم الأول لمودريتش؟"` → `"لوكا"`). Avoid
  obvious missing names, obscure players, and ambiguous surnames. The item
  carries a picture of the person named — Modrić's photo for the Modrić
  question. The picture is context, not the clue, so it must not show the
  answer as readable text (a caption, a name card, a shirt printed with it).
- Media recognition: player, stadium, or crest images (`"من هذا اللاعب؟"`,
  `"وش اسم هذا الملعب؟"`).
- Football's name-fragment ratio does not generalise to any other World.

### Anime World specialization

When Bomb is used with the Anime World, items are 100% media recognition
(`"من هذه الشخصية؟"`, `"وش اسم هذه المنظمة؟"`, `"وش اسم هذا الشيء؟"`). No
name-completion templates.

### Video Games World specialization

When Bomb is used with the Video Games World, items are 100% game-native media
(`"وش اسم هذا السلاح؟"`, `"وش اسم هذا المكان؟"`, `"من هذه الشخصية؟"`). No
name-completion templates. Forward Bomb authoring is text/image only: roadmap
§25.2 bans audio for forward Bomb and is the current policy, superseding the
earlier audio mention for Video Games Bomb in §23.4 (and the former global
example `"وش هذا الصوت؟"`). The backend and frontend Bomb audio capability is
preserved but does not authorize authoring audio Bomb items.

### Puzzles World specialization

When Bomb is used with the Puzzles World, items are 100% rapid visual
micro-puzzles (shape recognition, pattern step, visual count, spatial
transformation), not trivia. No name-completion templates.

## Anti-Patterns
- Complex multi-step reasoning.
- Long prompts.
- Audio media.
- A text-only item, in any World.

## QA Gates
- `BOMB_FAST_ANSWER_UNIQUENESS`
- `NO_AUDIO`
- `BOMB_ITEM_IMAGE_REQUIRED`
