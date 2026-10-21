# Scope: Wordplay & Letters (التلاعب بالكلمات والحروف)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> Canonical reference template: `observation-illusions` (Approved Canonical Library V1).

- `scopeId`: `puzzles.wordplay-letters`
- `worldId`: `puzzles`
- Player-facing Arabic name: **التلاعب بالكلمات والحروف**
- Primary solve: **Language itself is the material to inspect, manipulate, reassemble, or decode.**
- The question it asks the player: «كيف يتلاعب اللغز بالحروف والكلمات؟»
- Boundary: Language and orthography are the puzzle material itself, not a cosmetic wrapper for factual knowledge.
- Included: anagrams, common plural/singular recognition, letter addition/subtraction/substitution, disambiguating undotted letter skeletons via sentence context (dotless-disambiguation), shifting dots on letter skeletons (dot-shift), palindromes, word ladders, embedded words.
- Excluded: factual trivia, obscure dictionary archaisms, disputed morphology, dialectal forms, grammatical parsing (إعراب), voweling/tashkeel tricks, direct visible-dot counting (retired).
- `excludedChallengeTypeIds`: []

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is invalid here.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what the player is shown.

## Puzzle families (Moving XO authoring)

Families are authoring guidance for the Puzzles Signature mechanic, **Moving XO**, which is the World's active authoring target (WORLD.md, product direction 2026-10-21). They are **not** a database field and carry no runtime behaviour — see `ai/.opencode/knowledge/architecture/MOVING-XO.md`.

ركّبها is retired from current product usage and this library is not authored against it. Its runtime, schemas and validators are preserved — retirement from product direction is not runtime removal.

Every family answers on a **text-only** phone within the **15-second** window, while the prompt sits on the shared screen.

### Approved Canonical Families (15 Families — V1)

| # | Family | Arabic | Media | Answer Modes |
|---|---|---|---|---|
| 1 | `plural-form` | جمع الكلمات ومفرداتها المألوفة | Text Layout | `multiple_choice` |
| 2 | `anagram-rearrange` | إعادة ترتيب الحروف | Typographic Vector | `multiple_choice` |
| 3 | `add-letter` | إضافة حرف لتوليد كلمة | Text Layout | `multiple_choice` |
| 4 | `remove-letter` | حذف حرف لتوليد معنى | Text Layout | `multiple_choice` |
| 5 | `substitute-letter` | استبدال حرف لتغيير الدلالة | Text Layout | `multiple_choice` |
| 6 | `hidden-word` | الكلمة المخبأة بين الكلمات | Text Layout | `multiple_choice` |
| 7 | `shared-letter-completion` | الحرف المشترك لإكمال الكلمات | Typographic Vector | `multiple_choice` |
| 8 | `palindrome-symmetry` | الكلمات والجمل المتناظرة | Text Layout | `multiple_choice` |
| 9 | `letter-subtraction-math` | معادلات طرح وجمع الحروف | Text Layout | `multiple_choice` |
| 10 | `dotless-disambiguation` | قراءة الكلام بدون نقاط | Typographic Vector | `multiple_choice` |
| 11 | `dot-shift` | تحويل الكلمات بنقل النقاط | Typographic Vector | `multiple_choice` |
| 12 | `letter-pattern-progression` | متتاليات الحروف والأبجدية | Text Layout | `multiple_choice` |
| 13 | `word-inside-word` | كلمة في بطن كلمة | Text Layout | `multiple_choice` |
| 14 | `arabic-cipher-dhad` | شفرات الحروف والرموز | Typographic Vector | `multiple_choice` |
| 15 | `word-ladder-mini` | سلالم الكلمات المصغرة | Text Layout | `multiple_choice` |

---

## Brief Family Summaries

- **`plural-form`** — التعرف السريع على صيغة الجمع المألوفة أو المفرد المقابل لكلمات شائعة (صندوق ➔ صناديق، رصيف ➔ أرصفة). (Reject: الجموع النادرة أو الغريبة أو الخلافية).
- **`anagram-rearrange`** — فك تبعثر حروف كلمة شائعة وإعادة تجميعها. (Reject: مجموعات حروف تحتمل أكثر من حل شائع متكافئ).
- **`add-letter`** — إضافة حرف واحد لكلمة لتوليد كلمة جديدة تلبي الوصف.
- **`remove-letter`** — حذف حرف من كلمة لتوليد معنى جديد.
- **`substitute-letter`** — استبدال حرف واحد فقط بحرف آخر لتغيير المعنى.
- **`hidden-word`** — استخراج كلمة مخبأة عبر تقاطع كلمتين متتاليتين في جملة.
- **`shared-letter-completion`** — اكتشاف الحرف الواحد المكمل لعدة كلمات ناقصة.
- **`palindrome-symmetry`** — فحص التناظر الثنائي للكلمات التي تقرأ طردياً وعكسياً.
- **`letter-subtraction-math`** — معادلات لفظية بسيطة لطرح وجمع الحروف.
- **`dotless-disambiguation`** — قراءة الكلام بدون نقاط: تمييز الكلمة المقصودة من بين كلمات تشترك في نفس الرسم المجرد غير المنقوط بالاعتماد على سياق الجملة المقروءة. (Reject: إزالة النقاط عن كامل الجملة، أو الاعتماد على كلمات غير مألوفة).
- **`dot-shift`** — نقل أو تحريك أو إضافة نقطة على نفس رسم الحروف لتوليد كلمة جديدة.
- **`letter-pattern-progression`** — متتالية حروف عربية وفق نمط أبجدي أو إعجامي منتظم.
- **`word-inside-word`** — استخراج كلمة ذات معنى مستقل موجودة ككتلة متصلة كاملة داخل كلمة أخرى.
- **`arabic-cipher-dhad`** — فك شفرة كلمة عربية قصيرة باستعمال مفتاح رموز بصري مباشر.
- **`word-ladder-mini`** — سلم كلمات مصغر من 3 خطوات بتغيير حرف واحد في كل خطوة.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight, religion, romantic relationships, intelligence judgements, or awkward family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See roadmap §23.11.
