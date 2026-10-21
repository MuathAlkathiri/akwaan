# Scope Knowledge Profile: wordplay-letters (التلاعب بالكلمات والحروف)

> **Status:** APPROVED CANONICAL FAMILY LIBRARY V1 — HUMAN PRODUCT APPROVED (2026-10-20)  
> **Scope ID:** `puzzles.wordplay-letters`  
> **Canonical Slug:** `wordplay-letters`  
> **World ID:** `puzzles` (عالم الألغاز)  
> **Player-Facing Arabic Name:** **التلاعب بالكلمات والحروف**  
> **Primary Cognitive Identity:** **Language itself is the material to inspect, manipulate, reassemble, or decode.**  
> **Core Question:** «كيف يتلاعب اللغز بالحروف والكلمات؟»  
> **Strict Operational Boundary:** Language and orthography are the puzzle material itself, not a cosmetic wrapper for factual knowledge. Trivia questions asking for encyclopedic facts disguised as words violate `PUZZLES_WORLD_NO_TRIVIA`.

---

## 1. Identity & Scope Boundaries

### Core Cognitive Identity
`wordplay-letters` (التلاعب بالكلمات والحروف) is the linguistic puzzle territory of Akwaan. The challenge lies in mental manipulation of Arabic letters, orthographic forms, morphology, and word mechanics. The player is not being tested on factual trivia or obscure historical vocabulary; rather, familiar words and letters become physical objects to dissect, transform, reverse, count, and reassemble under time pressure.

### What Is Strictly Inside
- Structural manipulation of Arabic letters (anagrams, additions, deletions, substitutions, ladders).
- Orthographic mechanics: disambiguating undotted letter skeletons via sentence context (dotless-disambiguation), shifting dots on identical letter skeletons (dot-shift).
- Familiar morphology: fast recognition/production of common plural forms and reverse singulars.
- Word patterns: symmetry (palindromes), embedded words, visual ciphers, and cross-word linkages.

### What Is Strictly Excluded
- **No Factual Trivia Wrapped in Words:** «ما هي عاصمة الدولة التي حروفها كذا؟» violates `PUZZLES_WORLD_NO_TRIVIA`.
- **No Obscure Dictionary Archaism:** The challenge must come from time pressure, clever distractors, and lexical agility, never from rare linguistic trivia.
- **No Diacritic/Tashkeel Disputes:** All text defaults to unvoweled Modern Standard Arabic (نصوص فصيحة غير مشكولة) with canonical letter dots only.
- **No Dialectal Ambiguities:** All vocabulary must be familiar Modern Standard Arabic (فصحى معاصرة مألوفة).

---

## 2. Strong vs. Weak Territories

### Strong Content Territories
- **Familiar Arabic Roots & Stems:** Words instantly known to any native Arabic speaker (e.g., مفتاح، صندوق، شمس، طريق).
- **Orthographic Geometry:** The unique visual skeleton of Arabic writing (رسم الحروف المتصلة، الإعجام والنقاط).
- **Clever Recombinations:** Anagrams and letter math that evoke a sudden "aha!" moment when solved.

### Weak / Boring Territories
- Rare broken plurals from ancient lexicons (معاجم قديمة) that nobody uses.
- Highly obscure vocabulary where difficulty comes from ignorance rather than manipulation.
- Rigid grammar parsing (إعراب) that feels like a school syntax exam.

---

## 3. Evidence Opportunities & Assets
- High-contrast typographic presentation on the shared screen.
- Clear, unambiguous letter spacing and prominent fonts suitable for living-room viewing (3 meters distance).
- Mobile UI strictly uses clean text choices or numbers.

---

## 4. Canonical Puzzle Family Definitions (15 Approved Families)

### 1. `plural-form` (جمع الكلمات ومفرداتها المألوفة)
- **Player Solve:** التعرف السريع على صيغة الجمع الصحيحة (أو المفرد المقابل) لكلمة عربية شائعة ومألوفة.
- **Scope Identity:** Fast lexical recognition and morphological agility using familiar Modern Standard Arabic vocabulary.
- **Interaction Shapes:**
  - Shape A (Singular to Plural): A familiar singular noun is displayed on screen (e.g. «صندوق»); player selects the correct plural form («صناديق») among plausible morphological distractors.
  - Shape B (Plural to Singular): A plural form is displayed (e.g. «أرصفة»); player selects the correct singular («رصيف»).
  - Shape C (Familiar Irregular/Sound Plural): Prompting for the correct standard plural of common words with irregular or multiple familiar forms (e.g. «طريق ➔ طرق»).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (15s fast lexical retrieval, 4 distinct choices on phone).
  - RYO: `EXCELLENT` (Plausible distractors make peer betting highly strategic).
  - Bomb: `EXCELLENT` (High-speed lexical recognition under fuse pressure).
  - Closest: `DO_NOT_FORCE` (Categorical linguistic forms; proximity has no meaning).
- **Mechanic Notes:** Shared screen shows the base word in large clear typography. Phone displays 4 text buttons with plausible lexical variants.
- **Target Solve Time:** 6–10 seconds.
- **Shared Screen:** Large centered word card: «ما جمع: مفتاح؟».
- **Phone UI:** 4 text options: `[مفاتيح]`, `[مفاتح]`, `[مفاتحات]`, `[مفاتيحات]`.
- **Concrete Arabic Examples:**
  - «ما الجمع الصحيح لكلمة (صندوق)؟» ➔ صناديق.
  - «ما مفرد كلمة (أرصفة)؟» ➔ رصيف.
  - «أي من الكلمات التالية تمثل الجمع الشائع لكلمة (طريق)؟» ➔ طرق.
- **Anti-Patterns:** Intentionally rare/obscure literary plurals (e.g. جموع عندليب، كروان، سقرقع), disputed dictionary edge cases, and dialectal colloquialisms. Difficulty must come from lexical distractors, not dictionary obscurity.
- **Distinction:** Differs from trivia because words are universally familiar and test rapid morphological recognition.
- **Scalability:** `HIGH` (Abundant inventory of common Modern Standard Arabic nouns).
- **Asset Req:** Clean text layout.

---

### 2. `anagram-rearrange` (إعادة ترتيب الحروف والكلمات المبعثرة)
- **Player Solve:** فك تبعثر مجموعة حروف محددة وتركيبها ذهنياً لتكوين كلمة عربية ذات معنى محدد.
- **Scope Identity:** Core letter permutation puzzle. A scrambled set of 4–6 letters must be rearranged into a valid word matching a prompt clue.
- **Interaction Shapes:**
  - Shape A: 4–5 floating letters on screen forming a common noun.
  - Shape B: Two words that are exact anagrams of each other.
  - Shape C: Scrambled letters with a category hint (e.g., أداة، فاكهة).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (High energy, immediate team solve).
  - RYO: `EXCELLENT` (Anagrams create great confidence variance).
  - Bomb: `GOOD` (Can cause panic if letters exceed 5).
  - Closest: `DO_NOT_FORCE` (Categorical word solve).
- **Mechanic Notes:** Scrambled letters must have exactly ONE valid common solution.
- **Target Solve Time:** 9–13 seconds.
- **Shared Screen:** Large floating letter tiles: `[ر] [ح] [ب] [س]`.
- **Phone UI:** 4 multiple-choice word options or text entry.
- **Concrete Arabic Examples:**
  - «رتب الحروف التالية لتكوين اسم أداة كتابة: (ق - ل - م)» ➔ قلم.
  - «أي الكلمات التالية تتكون من نفس حروف كلمة (حساب) تماماً؟» ➔ سحاب.
- **Anti-Patterns:** Letter sets with multiple equally common valid solutions (e.g., ب - ل - ح ➔ بلح / لحب).
- **Distinction:** Differs from `add-letter` because no letters are added or removed; it is a pure permutation.
- **Scalability:** `HIGH`.
- **Asset Req:** Typographic vector tiles.

---

### 3. `add-letter` (إضافة حرف لتوليد كلمة جديدة)
- **Player Solve:** تحديد الحرف الواحد الذي إذا أُضيف للكلمة ينتج كلمة جديدة تطابق دلالة مطلوبة.
- **Scope Identity:** Additive letter transformation. A single letter insertion modifies an existing word into a new target word.
- **Interaction Shapes:**
  - Shape A: Adding a letter to the start (prefix).
  - Shape B: Adding a letter to the end (suffix).
  - Shape C: Inserting a letter into the middle.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 7–10 seconds.
- **Concrete Arabic Examples:**
  - «أضف حرفاً واحداً لكلمة (سور) لتحصل على اسم أداة حديقة» ➔ فأس / فأسور؟ «أضف حرفاً في بداية (سور) لتحصل على اسم بلد» ➔ م + سور = مسور؟ لا: «أضف حرفاً لكلمة (علم) لتحصل على ضد الجهل» ➔ ت + علم = تعلم.
  - «أضف حرفاً في أول كلمة (ريق) لتحصل على مسار للمشي» ➔ ط + ريق = طريق.
- **Anti-Patterns:** Cryptic grammar additions that require voweling tricks.
- **Distinction:** Pure single-letter addition.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean text layout.

---

### 4. `remove-letter` (حذف حرف لتوليد معنى جديد)
- **Player Solve:** تحديد الحرف الذي يؤدي حذفه من كلمة إلى تحويلها لكلمة أخرى صحيحة المعنى تلبي الوصف.
- **Scope Identity:** Subtractive letter transformation.
- **Interaction Shapes:**
  - Shape A: Removing initial letter.
  - Shape B: Removing final letter.
  - Shape C: Removing a middle letter.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 6–10 seconds.
- **Concrete Arabic Examples:**
  - «احذف حرفاً من كلمة (قطار) لتحصل على سائل حيوي» ➔ احذف القاف تحصل على (طار)؟ لا: احذف الطاء تحصل على (قار)؟ احذف القاف من (قطرة) تحصل على طرة. مثال محكم: «احذف حرفاً من كلمة (جمال) لتحصل on حيوان صحراوي» ➔ احذف الألف = جمل.
  - «احذف حرفاً من كلمة (سماء) لتحصل على عضو الشم» ➔ سماء - س = ماء؟ لا: «احذف حرفاً من كلمة (فصول) لتحصل on نقيض إجمال» ➔ فصول - و = فصل.
- **Anti-Patterns:** Words where removing different letters yields competing obscure words.
- **Distinction:** Pure single-letter deletion.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean text layout.

---

### 5. `substitute-letter` (استبدال حرف لتغيير الدلالة)
- **Player Solve:** استبدال حرف واحد فقط بحرف آخر لتوليد كلمة جديدة تفي بالمطلوب في اللغز.
- **Scope Identity:** Single letter mutation.
- **Interaction Shapes:**
  - Shape A: Mutating first letter to change meaning.
  - Shape B: Mutating middle vowel/consonant.
  - Shape C: Mutating last letter.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 7–11 seconds.
- **Concrete Arabic Examples:**
  - «استبدل حرفاً واحداً في كلمة (سيف) لتحصل on فصل من فصول السنة» ➔ صيف (استبدال السين بالصاد).
  - «استبدل حرفاً واحداً في كلمة (حبل) لتحصل on تضاريس مرتفعة» ➔ جبل (استبدال الحاء بالجيم).
- **Anti-Patterns:** Requiring diacritic shifts without letter change.
- **Distinction:** Exact one-to-one letter replacement.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean text layout.

---

### 6. `hidden-word` (الكلمة المخبأة بين ثنايا الجملة)
- **Player Solve:** استخراج كلمة ذات معنى متسق مخبأة عبر تقاطع نهاية كلمة وبداية الكلمة التالية في جملة قصيرة.
- **Scope Identity:** Boundary-spanning word search in plain text.
- **Interaction Shapes:**
  - Shape A: Embedded across two adjacent words.
  - Shape B: Embedded across three words.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «ابحث عن اسم حيوان أليف مخبأ بين الكلمتين: (وقـ[ـت قطـ]ـاف الثمار)» ➔ قط.
  - «ابحث عن اسم فاكهة مخبأ بين الكلمات: (زار [ت مر]يم صديقتها)» ➔ تمر.
- **Anti-Patterns:** Relying on obscure words or forced grammatical gymnastics.
- **Distinction:** Differs from `word-inside-word` because it spans the whitespace boundary between words.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean typography with clear spacing.

---

### 7. `shared-letter-completion` (الحرف المشترك لإكمال الكلمات)
- **Player Solve:** اكتشاف الحرف العربي الواحد الذي يصلح لأن يكون مكملاً أو رابطاً مشتركاً لـ 3 أو 4 كلمات ناقصة.
- **Scope Identity:** Hub-and-spoke missing character deduction.
- **Interaction Shapes:**
  - Shape A: Cross shape with central missing letter.
  - Shape B: 3 words with missing identical prefix.
  - Shape C: 3 words with missing identical suffix.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «ما الحرف الواحد الذي يكمل الكلمات التالية: (قـ[ـ?]ـر / شـ[ـ?]ـس / عـ[ـ?]ـل)؟» ➔ حرف الميم (قمر / شمس / عمل).
  - «ما الحرف الذي يوضع في الفراغ ليكمل كلمتي (با[?] / نا[?])؟» ➔ حرف الباء (باب / ناب).
- **Anti-Patterns:** Multiple letters completing different unintended common words.
- **Distinction:** Central hub character completing a cluster.
- **Scalability:** `HIGH`.
- **Asset Req:** Vector cross diagram or clean text.

---

### 8. `palindrome-symmetry` (الكلمات والجمل المتناظرة طردياً وعكسياً)
- **Player Solve:** التحقق من تناظر حروف الكلمة أو العبارة عند قراءتها من اليمين لليسار والعكس، وإكمال الحرف الناقص.
- **Scope Identity:** Orthographic and bilateral palindromic symmetry (ما لا يستحيل بالانعكاس).
- **Interaction Shapes:**
  - Shape A: 5-letter palindromic word with one missing symmetric letter.
  - Shape B: Identifying which of 4 words reads identical in both directions.
  - Shape C: Short palindromic phrase verification.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `GOOD`.
  - Bomb: `LIMITED`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «أي الكلمات التالية تقرأ بنفس الترتيب تماماً من اليمين لليسار ومن اليسار لليمين؟ (توت / قمر / كتاب / شمس)» ➔ توت.
  - «أكمل الكلمة المتناظرة: (خ - و - ?)» ➔ خ (خوخ).
- **Anti-Patterns:** Lengthy classical poetry verses that require 30 seconds to parse.
- **Distinction:** Bilateral reading symmetry invariant.
- **Scalability:** `MEDIUM`.
- **Asset Req:** Clean typography.

---

### 9. `letter-subtraction-math` (معادلات طرح وجمع الحروف اللفظية)
- **Player Solve:** إجراء عمليات الجمع والطرح الذهني على حروف الكلمات للوصول إلى الكلمة الناتجة.
- **Scope Identity:** Word algebra and letter arithmetic.
- **Interaction Shapes:**
  - Shape A: Direct subtraction: (Word A) - (Letters) = (Target Word).
  - Shape B: Substitution equation: (Word A) - (Letter X) + (Letter Y) = (Word B).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «(قمر) - (ر) + (اش) = ؟» ➔ قماش.
  - «(سحاب) - (ح) + (ر) = ؟» ➔ سراب.
- **Anti-Patterns:** Complex equations involving more than two operations in 15 seconds.
- **Distinction:** Mathematical formula presentation of letter operations.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean arithmetic-style text layout.

---

### 10. `dotless-disambiguation` (قراءة الكلام بدون نقاط)
- **Player Solve:** تمييز الكلمة العربية المقصودة من بين كلمات مألوفة تشترك في نفس الرسم المجرد غير المنقوط (الهيكل الحروفي) بالاعتماد على سياق الجملة المقروءة.
- **Scope Identity:** Contextual recovery of unpointed Arabic script (إعجام الرسم المجرد). Language structure, orthography, and contextual syntax combine to resolve an ambiguous skeleton into its unique correct reading:
  $$\text{Undotted Target Word Skeleton (الرسم المجرد)} + \text{Readable Sentence Context (سياق الجملة)} \implies \text{Correct Dotted Word (الإعجام الصحيح)}$$
- **Interaction Shapes:**
  - Shape A (Surrounding Readable Sentence + Single Boxed Target): A fully readable Arabic sentence is displayed on the shared screen, with exactly ONE target word rendered without dots inside a neutral frame. Phone displays 4 normally dotted candidate words sharing that identical undotted skeleton.
  - Shape B (Read Your Opponent Priming Trap): The sentence is crafted so early semantic phrasing primes a tempting wrong word that fits the undotted skeleton, but subsequent syntax/meaning strictly demands another choice.
  - Shape C (Moving XO Rapid Inference): A crisp, vivid sentence with an immediate physical/action clue that lets a team resolve the undotted target word within 6–8 seconds.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Clean, fast contextual inference that preserves board momentum and delivers satisfying living-room "Aha!" moments in 6–9 seconds).
  - RYO: `EXCELLENT` (Strong bluffing variance when an early cliché or semantic decoy tempts rushed opponents to lock in quickly, while attentive players catch the decisive grammatical/semantic constraint).
  - Bomb: `LIMITED` (Viable only for exceptionally short, high-salience 3-letter words under strict time pressure; do not force).
  - Closest: `DO_NOT_FORCE` (Linguistic categorical solve; discrete/continuous distance metrics have no meaningful semantic proximity).
- **Mechanic Notes:** Shared screen shows the normally readable sentence with the undotted target word highlighted in a neutral frame. Phone displays 4 clearly dotted candidate words.
- **Target Solve Time:**
  - Moving XO: 6–9 seconds.
  - RYO: 9–11 seconds.
  - Bomb: 7–9 seconds (if used).
- **Difficulty Levers:**
  - Clue Distance & Syntax: Placing the decisive contextual clue further from the target word or requiring grammatical agreement (e.g. preposition vs verb).
  - Decoy Strength: In RYO, using a powerful semantic priming trap (e.g. «وجد كرته المفقودة...» primes «بحث» but syntax demands «تحت»).
  - Skeleton Complexity: 3-letter vs 4-letter undotted skeletons (e.g. `حٮر` vs `ٮحٮ` vs `ٮسٮ`).
- **Media & Rendering Intent:**
  - Standard 1920×1080 shared TV display (viewing distance ~3 meters).
  - Surrounding sentence remains normally readable Arabic (clear modern Naskh font, full canonical dots/tashkeel).
  - Only ONE target word is rendered without dots.
  - The target word is highlighted using a neutral frame (e.g. dark slate border/fill, no glowing answer-like accents).
  - High-fidelity rendering: Do NOT rely solely on raw Unicode dotless glyph substitution. Must use deterministic font rendering with verified glyph joining (e.g., initial, medial, final Arabic cursive ligatures), zero accidental dots/harakat on the target word, and human visual QA before production.
- **Familiarity Rules:**
  - 100% familiar Modern Standard Arabic (MSA / pan-Arab) vocabulary.
  - All 4 options and all words in the sentence must be universally known everyday words.
  - Strictly NO obscure dictionary words (معاجم قديمة), archaic vocabulary, or regional dialect spellings.
- **Ambiguity Rules:**
  - The sentence context must yield EXACTLY ONE defensible reading among the 4 choices.
  - The 3 distractors must be indisputably rejected by sentence syntax, grammar, or physical logic.
  - Zero Tashkeel Dependency: All 4 choices must differ through unvoweled letter DOT restoration, NEVER merely through short vowels (harakat: fatha, damma, kasra).
  - Visual skeleton must be positionally and topologically valid for all 4 options.
- **RYO-Specific Trap Rules:**
  - Never confuse "4 words share the same skeleton" with a good RYO puzzle.
  - Weak RYO: The correct answer is obvious immediately from syntax and distractors are meaningless noise.
  - Strong RYO: A familiar wrong reading is genuinely tempting from early context, but a later semantic or grammatical clue resolves the intended reading:
    $$\text{Tempting first interpretation} \longrightarrow \text{Notice decisive context clue} \longrightarrow \text{Correct interpretation} \longrightarrow \text{"Aha!"}$$
- **Anti-Patterns:**
  - ❌ Full-sentence dot removal (creates excessive cognitive deciphering friction; rejected as default).
  - ❌ Using rare/uncommon words to artificially inflate difficulty.
  - ❌ Distractors that differ only by vowel marks (tashkeel).
  - ❌ Broken or disconnected Arabic glyphs from unverified font fallback.
- **QA Requirements:**
  - Verify that all 4 candidate options share the exact same unpointed letter skeleton.
  - Verify that exactly one option satisfies sentence semantics and syntax.
  - Verify 100% lexical familiarity of all 4 choices across the Arab world.
  - Perform visual inspection of the rendered target skeleton to verify ligature connectivity, correct RTL flow, and total absence of dots on the target.
- **Concrete Arabic Examples:**
  - *Example 1 (RYO — Semantic Priming Cliché vs Syntax):* «وَجَدَ الطِّفْلُ كُرَتَهُ المَفْقُودَةَ [ ... ] السَّرِيرِ بَعْدَ غِيَابٍ» — Target skeleton `ٮحٮ`. Options: (تَحْت / بَحَثَ / نَحْت / يَحُثّ). «وجد» makes «بحث» ungrammatical; spatial syntax strictly resolves to «تَحْتَ».
  - *Example 2 (Moving XO — Rapid Living-Room Deduction):* «أَخْرَجَ الخَبَّازُ الـ [ ... ] السَّاخِنَ مِنَ الفُرْنِ فِي الصَّبَاحِ» — Target skeleton `حٮر`. Options: (خُبْز / حِبْر / خَبَر / خَيْر). Baker + hot from oven resolves instantly to «خُبْز» in 6 seconds.
- **Distinction:** Differs from `dot-shift` because `dot-shift` actively adds, moves, or removes a dot to transform one word into another, whereas `dotless-disambiguation` starts from an undotted target skeleton and uses sentence context to recover the intended dotted word.
- **Scalability:** `HIGH` (Dozens of rich, everyday Arabic skeleton roots provide extensive combinatorial depth).
- **Asset Req:** High-contrast typographic vector layout (1920×1080) with neutral framing of the undotted target word.

---

### 11. `dot-shift` (تحويل الكلمات بنقل وتغيير النقاط)
- **Player Solve:** تحريك أو إضافة أو إزالة نقطة من رسم حروف الكلمة لتوليد كلمة عربية جديدة تطابق دلالة معينة.
- **Scope Identity:** Orthographic transformation on the same base letter skeleton (رسم الحروف).
- **Interaction Shapes:**
  - Shape A: Adding a single dot to change the word (e.g., علم ➔ غلم؟ لا: حبر ➔ خبر).
  - Shape B: Moving a dot from one letter to another on the skeleton (e.g., بكر ➔ يكر/نكر).
  - Shape C: Changing a dot from below to above (e.g., جبل ➔ خبل).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT` (Sudden visual insight).
  - RYO: `EXCELLENT` (High satisfaction on spotting the dot shift).
  - Bomb: `EXCELLENT` (Rapid orthographic shift under pressure).
  - Closest: `DO_NOT_FORCE` (Categorical word solve; distance has no meaning).
- **Mechanic Notes:** Shared screen shows the starting word. Phone lists 4 candidate words.
- **Target Solve Time:** 8–11 seconds.
- **Concrete Arabic Examples:**
  - «بنقل نقطة واحدة فقط من مكانها في كلمة (نمل)، ما الكلمة الجديدة التي تعني شجرة التمر؟» ➔ نخل (نقل نقطة النون لتصبح خاء).
  - «بإضافة نقطة واحدة فقط على أحد حروف كلمة (حبر)، ما الكلمة التي تعني نبأ أو معلومة؟» ➔ خبر (إضافة نقطة فوق الحاء).
- **Anti-Patterns:** Shifting dots to create archaic, non-standard words.
- **Distinction:** Differs from `dotless-disambiguation` because `dot-shift` actively adds, moves, or removes a dot to transform one word into another, whereas `dotless-disambiguation` starts from an undotted target skeleton and uses sentence context to recover the intended dotted word.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast typographic vector layout.

---

### 12. `letter-pattern-progression` (متتاليات الحروف والأبجدية)
- **Player Solve:** استنتاج القاعدة الحاكمة لمتتالية من الحروف العربية وإكمال الحرف الناقص.
- **Scope Identity:** Alphabetical skip-logic and sequence deduction.
- **Interaction Shapes:**
  - Shape A: Constant alphabetical skip (e.g. +2 letters).
  - Shape B: Alternating dotted and undotted letters (معجم / مهمل).
  - Shape C: Progressive letter anatomy (e.g. shapes with 1 loop, 2 loops).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `GOOD`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 8–12 seconds.
- **Concrete Arabic Examples:**
  - «ما الحرف التالي في المتتالية: (أ · ت · ج · خ · ...)؟» (تخطي حرف واحد في كل خطوة: ب، ث، ح) ➔ ز.
  - «متتالية تتناوب بين حرف منقوط وحرف غير منقوط: (ب · ر · ت · د · ...) ما الحرف التالي؟» ➔ ن.
- **Anti-Patterns:** Arbitrary sequences without a universally inferable logic.
- **Distinction:** Pattern progression of letters rather than numbers.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean typography.

---

### 13. `word-inside-word` (كلمة في بطن كلمة)
- **Player Solve:** استخراج كلمة ذات دلالة مستقلة موجودة ككتلة حروف متصلة كاملة داخل كلمة أخرى أطول.
- **Scope Identity:** Substring extraction within a single word.
- **Interaction Shapes:**
  - Shape A: Extracting a 3-letter noun inside a 5-letter word.
  - Shape B: Identifying the nested word based on a semantic clue.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `EXCELLENT`.
  - Bomb: `EXCELLENT`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 7–10 seconds.
- **Concrete Arabic Examples:**
  - «ما اسم الفاكهة الموجود ككلمة متصلة كاملة داخل كلمة (كرمان)؟» ➔ رمان.
  - «ما العضو البشري المخبأ داخل كلمة (معمار)؟» ➔ عمار؟ لا: داخل كلمة (منسف) ➔ أنف؟ كلمة (قوارب) ➔ قارب. مثال محكم: «ما اسم المعدن النفيس المخبأ داخل كلمة (مذهب)؟» ➔ ذهب.
- **Anti-Patterns:** Permuted letters (that is an anagram). The substring must be contiguous.
- **Distinction:** Contiguous substring inside one word, unlike `hidden-word` which spans multiple words.
- **Scalability:** `HIGH`.
- **Asset Req:** Clean typography.

---

### 14. `arabic-cipher-dhad` (شفرات الحروف والرموز البسيطة)
- **Player Solve:** فك تشفير كلمة عربية قصيرة باستعمال مفتاح تشفير رمزي أو رقمي بصري بسيط.
- **Scope Identity:** Visual cipher and 1-to-1 symbol substitution for Arabic letters.
- **Interaction Shapes:**
  - Shape A: 4 visual geometric icons mapping to 4 letters to form a word.
  - Shape B: Numbered alphabet positions forming a 3-letter word.
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `GOOD`.
  - Bomb: `LIMITED`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 10–14 seconds.
- **Concrete Arabic Examples:**
  - «مفتاح شفرة: (★ = ق)، (▲ = ل)، (● = م). ما الكلمة المشفرة بالرموز: ★ ▲ ● ؟» ➔ قلم.
- **Anti-Patterns:** Cryptic multi-step ciphers requiring pen and paper. Keep substitution 1-to-1 with max 3–4 letters.
- **Distinction:** Symbolic translation key for Arabic script.
- **Scalability:** `HIGH`.
- **Asset Req:** High-contrast vector icons and typography.

---

### 15. `word-ladder-mini` (سلالم الكلمات المصغرة)
- **Player Solve:** الانتقال من كلمة بداية إلى كلمة هدف بتغيير حرف واحد في كل خطوة، وتحديد الكلمة الوسطية.
- **Scope Identity:** 3-step word mutation pathway.
- **Interaction Shapes:**
  - Shape A: Start Word ➔ [ ? ] ➔ Target Word (mutating one letter per step).
- **Mechanic Fit:**
  - Moving XO: `EXCELLENT`.
  - RYO: `GOOD`.
  - Bomb: `LIMITED`.
  - Closest: `DO_NOT_FORCE`.
- **Target Solve Time:** 9–13 seconds.
- **Concrete Arabic Examples:**
  - «سلم كلمات يربط بين (سيف) و(صوت) بتغيير حرف واحد في كل خطوة: (سيف ➔ صيف ➔ [ ? ] ➔ صوت). ما الكلمة المفقودة؟» ➔ صيت.
- **Anti-Patterns:** Word ladders requiring more than 2 intermediate steps in 15 seconds.
- **Distinction:** Multi-step path linking two words.
- **Scalability:** `MEDIUM`.
- **Asset Req:** Clean vertical or horizontal ladder graphic.

---

## 5. Mechanic Compatibility Matrix

| # | Family Slug | Arabic Name | Moving XO | RYO | Bomb | Closest | Primary Media | Typical Phone Interaction |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| 1 | `plural-form` | جمع الكلمات ومفرداتها المألوفة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Text / Graphic Card | Multiple Choice (4 words) |
| 2 | `anagram-rearrange` | إعادة ترتيب الحروف | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | Typographic Vector | Multiple Choice (4 words) |
| 3 | `add-letter` | إضافة حرف لتوليد كلمة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 letters) |
| 4 | `remove-letter` | حذف حرف لتوليد معنى | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 letters) |
| 5 | `substitute-letter` | استبدال حرف لتغيير الدلالة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 pairs) |
| 6 | `hidden-word` | الكلمة المخبأة بين الكلمات | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 words) |
| 7 | `shared-letter-completion` | الحرف المشترك لإكمال الكلمات | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Typographic Vector | Multiple Choice (4 letters) |
| 8 | `palindrome-symmetry` | الكلمات والجمل المتناظرة | **EXCELLENT** | **GOOD** | **LIMITED** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 words) |
| 9 | `letter-subtraction-math` | معادلات طرح وجمع الحروف | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 words) |
| 10 | `dotless-disambiguation` | قراءة الكلام بدون نقاط | **EXCELLENT** | **EXCELLENT** | **LIMITED** | DO_NOT_FORCE | Typographic Vector | Multiple Choice (4 words) |
| 11 | `dot-shift` | تحويل الكلمات بنقل النقاط | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Typographic Vector | Multiple Choice (4 words) |
| 12 | `letter-pattern-progression` | متتاليات الحروف والأبجدية | **EXCELLENT** | **EXCELLENT** | **GOOD** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 letters) |
| 13 | `word-inside-word` | كلمة في بطن كلمة | **EXCELLENT** | **EXCELLENT** | **EXCELLENT** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 words) |
| 14 | `arabic-cipher-dhad` | شفرات الحروف والرموز | **EXCELLENT** | **GOOD** | **LIMITED** | DO_NOT_FORCE | Typographic Vector | Multiple Choice (4 words) |
| 15 | `word-ladder-mini` | سلالم الكلمات المصغرة | **EXCELLENT** | **GOOD** | **LIMITED** | DO_NOT_FORCE | Text Layout | Multiple Choice (4 words) |

---

## 6. Closest Dedicated Review (Wordplay & Letters)

In Puzzles World, Closest must remain **reasoning-derived estimation**, never trivia recall (§23.11).  
**Runtime Reality:** Akwaan runtime does NOT support 2D minimaps, coordinate pickers, or spatial screen tapping. All Closest interactions use 1D continuous or discrete sliders, or Between-Two-Anchors.

Because language is fundamentally categorical (a letter or word is either correct or not), forcing sliders onto linguistic answers is an authoring anti-pattern. Following the formal retirement of `dot-count` (where visible-dot counting degraded into mechanical manual tallying without puzzle discovery), Closest is rated `DO_NOT_FORCE` across all 15 Families in `wordplay-letters`.

### Wordplay Closest Guidance:
- `DO_NOT_FORCE` across Scope: Linguistic meaning and orthography are categorical; discrete or continuous proximity scoring has no natural semantic distance metric.
- Do NOT invent artificial numeric wrappers for language (e.g. letter index sliders, character count sliders).

### Explicitly Rejected Fake Closest Adaptations in Wordplay:
- ❌ Direct visible-dot counting on text (`dot-count` retired: mechanical tallying).
- ❌ Encoding alphabetical position as a slider (e.g. «أي حرف يكمل الكلمة؟ اختر رقمه من 1 إلى 28»).
- ❌ Sliders for `plural-form` or anagrams.
- ❌ Counting vowel marks (tashkeel/tanween).

---

## 7. Overlap Audit & Scope Routing Rules

| Scope | Primary Cognitive Identity | Operational Routing Invariant |
|---|---|---|
| **`wordplay-letters`**<br>(التلاعب بالكلمات والحروف) | **Language itself is the material to inspect, manipulate, reassemble, or decode.** | **RULE:** The puzzle manipulates Arabic letters, orthographic dots, familiar plurals, or anagrams. **No factual trivia dressed in words.** |
| **`spot-the-error`**<br>(اكتشف الخطأ) | **Infer an objective rule, then locate what breaks it.** | **ROUTING:** If letters form an intruder puzzle where an emergent rule must be inferred (e.g., finding the word without dotted letters), route to **`spot-the-error`** (`intruder-element`). (If the task is finding a hidden word or anagram, it belongs to `wordplay-letters`). |
| **`numbers-estimation`**<br>(أرقام وتقديرات) | **Playful numerical intuition and mental calculation.** | **ROUTING:** If calculating numerical quantities, equations, or estimates, route to **`numbers-estimation`**. |
| **`observation-illusions`**<br>(قوة الملاحظة والخداع البصري) | **The answer already exists in the static scene; player must notice it.** | **ROUTING:** If finding a disguised visual element in a graphic drawing, route to **`observation-illusions`**. |

---

## 8. Generation Scalability

| Scalability Tier | Families Included | Justification |
|---|---|---|
| **HIGH** | `plural-form`, `anagram-rearrange`, `add-letter`, `remove-letter`, `substitute-letter`, `hidden-word`, `shared-letter-completion`, `letter-subtraction-math`, `dotless-disambiguation`, `dot-shift`, `letter-pattern-progression`, `word-inside-word`, `arabic-cipher-dhad` | Enormous combinatorial depth across the vocabulary of Modern Standard Arabic and standard 28-letter permutations. |
| **MEDIUM** | `palindrome-symmetry`, `word-ladder-mini` | Palindromes and tightly constrained 3-step word mutation ladders require curated linguistic crafting. |
| **SPECIALIZED** | — | No approved family in Wordplay is restricted to specialized tier; Arabic vocabulary depth readily supports sustained play. |

---

## 9. Batch-Level Variety Rules

When generating or reviewing an authored batch for `wordplay-letters`:
1. **Max Single Family Concentration:** No single Family may exceed **25%** of a batch (e.g. max 3 items of the same Family in a 12-item batch).
2. **Consecutive Repetition Limit:** No more than **2 consecutive items** from the same Family.
3. **Cognitive Operation Rotation:** A batch of 12 items must include at least **4 distinct Families** spanning at least 3 distinct linguistic modalities:
   - *Modality A (Morphology & Lexical Recognition):* `plural-form`, `word-inside-word`, `hidden-word`.
   - *Modality B (Letter Permutation & Transformation):* `anagram-rearrange`, `add-letter`, `remove-letter`, `substitute-letter`, `letter-subtraction-math`, `word-ladder-mini`.
   - *Modality C (Orthography, Dots & Codes):* `dotless-disambiguation`, `dot-shift`, `palindrome-symmetry`, `letter-pattern-progression`, `arabic-cipher-dhad`.
4. **Zero Word Duplication:** Never reuse the same base Arabic word across multiple items in the same batch.
5. **Dynamic Shuffling:** Note that answer option presentation order is randomized dynamically at session runtime by the game engine; authors should write clear, distinct distractors without worrying about artificial manual position balancing.

---

## 10. Library Evolution Rules

1. **Discovery & Proposal:** A new interaction shape must be documented using all 14 standard contract fields.
2. **Distinctness Proof:** The author must prove that none of the 15 approved Families can naturally accommodate the cognitive operation without diluting its identity.
3. **Boundary Audit:** Must pass the overlap check against `spot-the-error` and `numbers-estimation`.
4. **Mechanic Feasibility:** Must have at least 2 mechanics rated `GOOD` or `EXCELLENT`.
5. **Human Product Sign-Off:** Canonical promotion requires formal Human Product Review approval.
6. **Generator Write Protection:** Content generation scripts must strictly read from the registered library and **NEVER** write or declare new canonical Families during batch authoring.
