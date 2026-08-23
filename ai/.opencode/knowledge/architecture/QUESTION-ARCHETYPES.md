# Canonical Question Archetype Library

## 0. Golden Invariant: Archetype != Template Spam

> **An archetype is an INTERACTION PLAY SHAPE, not a text template.**
>
> ❌ **BAD:** Authoring 15 items in a batch that all say `"وش الاسم الأول لـ ___؟"`.
>
> ✅ **GOOD:** Using `NAME_FRAGMENT` as one snappy interaction among 5–7 diverse archetypes across the batch.
>
> No single archetype should ever exceed 35% of a batch.

---

## 1. Complete Archetype Registry

| ID | Archetype Name | Arabic Name | Cognitive Operation | Typical Pace | Compatible Mechanics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NAME_FRAGMENT` | Name Fragment | مقطع الاسم | Recall missing component of compound name | Rapid (5–15s) | Bomb, Combo, Marhala, RYO |
| `COMPLETE_THE_NAME` | Complete The Name | أكمل الاسم / اللقب | Complete unfinished proper title/name | Rapid (5–15s) | Bomb, Combo, Marhala, RYO |
| `COMPLETION` | Phrase / Quote Completion | إكمال العبارة / الشعار | Complete iconic slogan or catchphrase | Rapid (5–15s) | Bomb, Combo, Marhala, RYO |
| `REVERSE_QUESTION` | Reverse Question | السؤال العكسي | Invert entity-to-attribute trivia vector | Normal (15–25s) | RYO, Marhala, Combo, One Clue |
| `NICKNAME_OR_ALIAS` | Nickname or Alias | اللقب أو الاسم المستعار | Identify official entity from moniker | Rapid (5–15s) | Bomb, Combo, Marhala, RYO |
| `REAL_NAME` | Real / Legal Name | الاسم الحقيقي | Stage/superhero persona -> legal name | Fast (10–20s) | Marhala, Combo, RYO |
| `CAREER_PATH` | Career Path | مسار الانتقالات / المسيرة | Decode entity from chronological path | Normal (15–25s) | RYO, Marhala, Combo |
| `CONNECTION` | Common Connection | رابط مشترك | Synthesize single shared bond between 3 items | Normal (20–30s) | RYO, Marhala, Split |
| `SEQUENCE` | Chronological Sequence | تتابع وتسلسل | Identify next / previous chronological item | Normal (15–25s) | RYO, Marhala, Split |
| `DETAIL_RECOGNITION` | Detail Recognition | تمييز التفاصيل | Recognize signature gear, weapon, or map part | Fast (10–20s) | Bomb, Marhala, Combo, One Clue |
| `VISUAL_RECOGNITION` | Direct Visual | التعرف البصري المباشر | Identify subject from full authentic image | Rapid (5–10s) | Bomb |
| `PARTIAL_VISUAL` | Partial Visual Crop / Silhouette | التعرف البصري الجزئي | Deduce identity from emblem segment or outline | Rapid (5–10s) | Bomb, RYO |
| `AUDIO_RECOGNITION` | Audio Recognition | التعرف الصوتي | Identify song, artist, quote, or SFX from clip | Normal (15–25s) | Music, Marhala, RYO |
| `WORK_TO_CHARACTER` | Work -> Character | من العمل إلى الشخصية | Identify specific role/cast member of title | Fast (10–20s) | Bomb, Combo, Marhala, RYO |
| `CHARACTER_TO_WORK` | Character -> Work | من الشخصية إلى العمل | Identify franchise/work belonging to entity | Fast (10–20s) | Bomb, Combo, Marhala, RYO |
| `WHO_SAID_OR_DID_IT` | Who Said / Did It | من القائل أو الفاعل | Attribute iconic quote or legendary milestone | Normal (15–25s) | RYO, Marhala, One Clue |
| `BEFORE_AFTER` | Before or After | قبل أو بعد | Relative temporal comparison between 2 events | Fast (10–15s) | RYO, Marhala |
| `ODD_ONE_OUT` | Odd One Out | المختلف أو المستبعد | Identify outlier not sharing common trait | Normal (20–30s) | RYO (Multiple Choice), Split |
| `CATEGORY_IDENTIFICATION` | Category Clue Triangulation | التعرف عبر المؤشرات | Synthesize 2–3 distinct cues into one identity | Normal (15–25s) | RYO, Marhala, One Clue |
| `FAST_ATTRIBUTE` | Fast Snappy Attribute | الخاصية السريعة | Instant recall of stable nationality, role, number | Very Rapid (5–10s) | Bomb, Combo (S1), Marhala (Easy) |

---

## 2. Detailed Archetype Specifications

### 1. `NAME_FRAGMENT`
- **Interaction Shape:** Given a prominent surname, moniker, or title fragment -> player provides the missing first name or counterpart.
- **What Makes It Fun:** Snappy, high-velocity recognition; turns familiar names into an instant verbal reflex test.
- **Best Use Cases:** Prominent athletes, iconic characters, historical leaders with memorable compound names.
- **Bad Use Cases:** Generic single-word names; obscure middle names that no fan cares about.
- **Expected Answer Shape:** 1–2 words (First name, surname, or suffix).
- **Suitable Pace:** Rapid / Fast (5–15s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** None (text-native) or supporting portrait.
- **Compatible Worlds:** Football, Music, Anime, Video Games, Movies, Series, Sports, Cars.
- **Common Failure Patterns:** Asking for an ambiguous name where multiple family members share the same role.
- **Examples:**
  1. *Football:* `"بيلينغهام... وش اسمه الأول؟"` -> `"جود"`
  2. *Video Games:* `"الضابط تينبيني في سان أندرياس... وش اسمه الأول؟"` -> `"فرانك"`
  3. *Anime:* `"زورو في ون بيس... وش اسم عائلته؟"` -> `"رورونوا"`

---

### 2. `COMPLETE_THE_NAME`
- **Interaction Shape:** Player is given the first word or main root of a multi-word proper title/name and fills in the concluding word.
- **What Makes It Fun:** The rhythmic satisfaction of completing a well-known title.
- **Best Use Cases:** Club names, stadium names, famous duos, boss titles, organizations.
- **Bad Use Cases:** Arbitrary non-proper phrases; single-word entity names.
- **Expected Answer Shape:** 1–2 words.
- **Suitable Pace:** Fast (5–15s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** None or supporting emblem.
- **Compatible Worlds:** All Worlds.
- **Common Failure Patterns:** Providing too much or too little of the prefix, causing ambiguity.
- **Examples:**
  1. *Football:* `"نادي وست هام... وش الكلمة الثانية في اسمه الرسمي؟"` -> `"يونايتد"`
  2. *Anime:* `"منظمة العين القمرية في ناروتو... تسوكويومي الـ...؟"` -> `"الانهائية"` / `"اللا نهائية"`
  3. *Movies:* `"سجن السحرة الشهير في هاري بوتر يُدعى آز...؟"` -> `"آزكابان"`

---

### 3. `COMPLETION`
- **Interaction Shape:** Complete a short, widely recognized catchphrase, iconic quote ending, or famous song title.
- **What Makes It Fun:** Instant verbal recall of widespread pop-culture and fandom phrases.
- **Best Use Cases:** Iconic slogans, song titles, famous spell incantations, classic move names.
- **Bad Use Cases:** Long multi-sentence lyrics (strictly forbidden); obscure monologues.
- **Expected Answer Shape:** 1–3 words.
- **Suitable Pace:** Fast (5–15s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** Text or short audio cue.
- **Compatible Worlds:** Music, Anime, Movies, Video Games, Series.
- **Common Failure Patterns:** Selecting a quote where multiple completions are syntactically plausible.
- **Examples:**
  1. *Music:* `"أغنية محمد عبده الشهيرة: الأماكن كلها...؟"` -> `"مشتاقة لك"`
  2. *Anime:* `"شعار غوكو وتقنيته الشهيرة: كايو...؟"` -> `"كين"`
  3. *Video Games:* `"في أوفرواتش، الجملة الشهيرة لألتيمت ديفا: نيرف...؟"` -> `"ذس"` / `"Nerf this"`

---

### 4. `REVERSE_QUESTION`
- **Interaction Shape:** Invert the traditional question angle (e.g. Creator/Actor -> Work/Character, or Trophy -> Winning Club).
- **What Makes It Fun:** Disrupts mental autopilot by reversing the direction of association.
- **Best Use Cases:** Notable actors who played iconic villains, clubs where a player won a specific trophy.
- **Bad Use Cases:** Prolific voice actors with 500 minor background roles.
- **Expected Answer Shape:** Entity, character, or title name.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional actor portrait or trophy frame.
- **Compatible Worlds:** Movies, Series, Football, Video Games, Anime.
- **Common Failure Patterns:** Reversing an association that has multiple valid targets without narrowing criteria.
- **Examples:**
  1. *Movies:* `"الممثل هيث ليدجر فاز بالأوسكار عن تجسيده لأي شخصية في فيلم The Dark Knight؟"` -> `"الجوكر"`
  2. *Football:* `"المدرب كارلو أنشيلوتي حقق دوري أبطال أوروبا مع ريال مدريد وأي نادي إيطالي آخر؟"` -> `"ميلان"` / `"إيه سي ميلان"`
  3. *Series:* `"الممثل براين كرانستون جسّد أي شخصية أسطورية في مسلسل Breaking Bad؟"` -> `"والتر وايت"` / `"هايزنبرغ"`

---

### 5. `NICKNAME_OR_ALIAS`
- **Interaction Shape:** Given a famous cultural moniker, superhero persona, or club nickname -> identify the official entity (or vice-versa).
- **What Makes It Fun:** Taps into authentic fan terminology and tribal sports/gaming culture.
- **Best Use Cases:** Club monikers, legendary superhero aliases, player nicknames.
- **Bad Use Cases:** Transient tabloid nicknames; generic nicknames shared across dozens of entities.
- **Expected Answer Shape:** Canonical name or official nickname.
- **Suitable Pace:** Fast (5–15s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** Optional logo or crest.
- **Compatible Worlds:** Football, Sports, Anime, Video Games, Movies, Saudi Arabia.
- **Common Failure Patterns:** Asking for an informal nickname that lacks consensus among fans.
- **Examples:**
  1. *Football:* `"نادي روما الإيطالي... وش لقبهم الشهير المرتبط بذئبة العاصمة؟"` -> `"الذئاب"` / `"الجيلاروسي"`
  2. *Anime:* `"من الشخصية الأسطورية المعروفة بلقب 'وميض كونوها الأصفر'؟"` -> `"ميناتو"` / `"ميناتو ناميكازي"`
  3. *Sports:* `"نجم كرة السلة مايكل جوردان كان يُلقب بـ Air...؟"` -> `"جوردان"` / `"Air Jordan"`

---

### 6. `REAL_NAME`
- **Interaction Shape:** Given a well-known persona, stage name, or superhero moniker -> identify the character/person real legal name.
- **What Makes It Fun:** The "insider knowledge" satisfaction of knowing the true identity behind the mask.
- **Best Use Cases:** Flagship superheroes, prominent stage musicians, deeply characterized video game heroes.
- **Bad Use Cases:** Minor characters whose real name was only revealed in an obscure databook footnote.
- **Expected Answer Shape:** 1–2 words (Real first or full name).
- **Suitable Pace:** Fast to Normal (10–20s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional persona visual.
- **Compatible Worlds:** Music, Anime, Movies, Video Games, Series.
- **Common Failure Patterns:** Ambiguous real names in franchises with multiple multiverse variants (e.g. Spider-Man).
- **Examples:**
  1. *Music:* `"المطربة الأمريكية ليدي غاغا... وش اسمها الأول الحقيقي؟"` -> `"ستيفاني"`
  2. *Movies:* `"الاسم الحقيقي للبطل الخارق باتمان في مدينة غوثام هو بروس...؟"` -> `"واين"`
  3. *Video Games:* `"في أوفرواتش، الاسم الحقيقي للبطلة سميترا هو ساتيا...؟"` -> `"فاسواني"`

---

### 7. `CAREER_PATH`
- **Interaction Shape:** Present a clean chronological chain of clubs, teams, or studios (Team A -> Team B -> Team C) -> player identifies the individual.
- **What Makes It Fun:** Pattern deduction and mental puzzle-solving connecting chronological career stops.
- **Best Use Cases:** Prominent footballers, managers, F1 drivers, legendary directors.
- **Bad Use Cases:** Journeymen who changed teams 15 times in lower leagues; identical career paths shared by teammates.
- **Expected Answer Shape:** Person or athlete name.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional sequence of club badges.
- **Compatible Worlds:** Football, Sports, Cars, Movies.
- **Common Failure Patterns:** Cluttering the path with unverified loan spells or amateur youth clubs.
- **Examples:**
  1. *Football:* `"سبورتينغ لشبونة ← مانشستر يونايتد ← ريال مدريد ← يوفنتوس... من هذا اللاعب؟"` -> `"كريستيانو رونالدو"`
  2. *Sports:* `"ويليامز ← ماكلارين ← مرسيدس... من هذا السائق في الفورمولا 1؟"` -> `"لويس هاميلتون"`

---

### 8. `CONNECTION`
- **Interaction Shape:** Present 2–3 distinct entities -> player identifies the single objective bond connecting them.
- **What Makes It Fun:** The "eureka!" moment when disparate clues suddenly snap together into a coherent link.
- **Best Use Cases:** Shared club, common voice actor, won a specific title together, shared superpower.
- **Bad Use Cases:** Vague, subjective, or coincidental connections ("they are all famous").
- **Expected Answer Shape:** 1–3 words (Club, tournament, actor, event).
- **Suitable Pace:** Normal (20–30s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional multi-image composite.
- **Compatible Worlds:** All Worlds.
- **Common Failure Patterns:** Leaving room for multiple unintended factual connections.
- **Examples:**
  1. *Football:* `"ميسي، نيمار، مبابي... ما النادي الأوروبي الوحيد الذي لعبوا له سويًا في نفس الفترة؟"` -> `"باريس سان جيرمان"`
  2. *Anime:* `"إرين ييغر، أرمين أرليرت، ميكاسا أكرمان... ما فيلق الجيش الذي انضموا إليه جميعًا؟"` -> `"فيلق الاستطلاع"`

---

### 9. `SEQUENCE`
- **Interaction Shape:** Present an established historical or narrative sequence (1st, 2nd, 3rd) -> ask for the next or preceding item.
- **What Makes It Fun:** Linear chronological recall and structural memory challenge.
- **Best Use Cases:** Film installments, game sequels, World Cup winners, historical office holders.
- **Bad Use Cases:** Disputed timelines or non-linear spin-offs.
- **Expected Answer Shape:** Title, entity, or proper noun.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional timeline graphic.
- **Compatible Worlds:** Video Games, Movies, Anime, Football, General Knowledge, History.
- **Common Failure Patterns:** Confusion between chronological story timeline vs release order without specifying.
- **Examples:**
  1. *Video Games:* `"في ثلاثية Dark Souls الأصلية... ما الجزء الذي صدر مباشرة بعد Dark Souls 1؟"` -> `"دارك سولز 2"` / `"Dark Souls 2"`
  2. *Football:* `"كأس العالم 2014 ألمانيا، 2018 فرنسا... من فاز بالنسخة التالية في 2022؟"` -> `"الأرجنتين"`

---

### 10. `DETAIL_RECOGNITION`
- **Interaction Shape:** Highlight a distinct iconic in-world item, wonder weapon, stadium landmark, special car part, or artifact -> identify owner or function.
- **What Makes It Fun:** Deep tactile immersion in the tangible assets of the fictional/sports world.
- **Best Use Cases:** Wonder weapons, stadium stands, signature cars, anime relics, game abilities.
- **Bad Use Cases:** Generic background props with zero narrative significance.
- **Expected Answer Shape:** Item name, character, or location.
- **Suitable Pace:** Fast to Normal (10–20s).
- **Difficulty Range:** Easy to Hard.
- **Media Requirements:** Text description or high-res close-up.
- **Compatible Worlds:** Video Games, Anime, Football, Cars, Movies.
- **Common Failure Patterns:** Describing a weapon with generic descriptors shared by 50 other games.
- **Examples:**
  1. *Video Games:* `"سلاح Wonder Weapon في زومبي كود يُطلق عاصفة هوائية تدفع حشود الزومبي فورًا... ما اسمه؟"` -> `"ثاندرغن"`
  2. *Football:* `"ملعب الأنفيلد معقل ليفربول... ما الاسم الشهير للمدرج التاريخي الأسطوري خلف المرمى؟"` -> `"الكوب"` / `"The Kop"`

---

### 11. `VISUAL_RECOGNITION`
- **Interaction Shape:** Display an authentic image frame (player, character, crest, vehicle, landmark) -> direct identification under time pressure.
- **What Makes It Fun:** Instant visual recognition; pure party-game energy.
- **Best Use Cases:** Bomb mechanic, character identification, club crest recognition.
- **Bad Use Cases:** Ambiguous low-res shots, generic stock photography.
- **Expected Answer Shape:** Proper entity name.
- **Suitable Pace:** Very Rapid (5–10s).
- **Difficulty Range:** Easy to Hard.
- **Media Requirements:** Exactly 1 verified image asset in `media.assets`.
- **Compatible Worlds:** All visual Worlds.
- **Common Failure Patterns:** Image contains embedded names, subtitles, or watermark leakage.
- **Examples:**
  1. *Bomb Football:* `[Image: Santiago Bernabéu stadium]` -> `"سانتياغو برنابيو"`
  2. *Bomb Anime:* `[Image: Sukuna cursed finger]` -> `"إصبع سوكونا"`

---

### 12. `PARTIAL_VISUAL`
- **Interaction Shape:** Display an authentic cropped detail, silhouette, or close-up pattern -> player identifies the subject.
- **What Makes It Fun:** Visual deduction and pattern recognition under time pressure.
- **Best Use Cases:** Club crest segments, car grills/headlights, anime hair silhouettes, superhero insignias.
- **Bad Use Cases:** Microscopically tiny crops (e.g. 5x5 pixels) that create artificial unfair difficulty.
- **Expected Answer Shape:** Entity or brand name.
- **Suitable Pace:** Rapid (5–10s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Cropped verified image asset.
- **Compatible Worlds:** Cars, Football, Anime, Video Games, Movies.
- **Common Failure Patterns:** Cropping an element that is identical across multiple sibling models/teams.
- **Examples:**
  1. *Cars:* `[Image: Closeup of BMW iconic kidney grille]` -> `"بي إم دبليو"` / `"BMW"`
  2. *Football:* `[Image: Cropped cannon from Arsenal crest]` -> `"أرسنال"`

---

### 13. `AUDIO_RECOGNITION`
- **Interaction Shape:** Play a short authentic audio snippet (intro, sound effect, character voice line, stadium chant) -> identify source/song/artist.
- **What Makes It Fun:** Auditory recognition is electric in a live room; creates instant sing-along or gasp moments.
- **Best Use Cases:** Music World songs/artists, Video Game UI/killstreak sound effects, iconic movie quotes.
- **Bad Use Cases:** Muffled indistinct noises; synthetic/fake TTS audio.
- **Expected Answer Shape:** Song title, artist name, character name, or sound effect source.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Easy to Hard.
- **Media Requirements:** Structured media intent referencing canonical audio clip.
- **Compatible Worlds:** Music, Video Games, Movies, Series, Anime, Football.
- **Common Failure Patterns:** The voice line explicitly speaks the character name (answer leakage).
- **Examples:**
  1. *Music:* `[Audio: Intro chords of "غنوا لحبيبي"]` -> `"عبدالمجيد عبدالله"`
  2. *Video Games:* `[Audio: Tactical Nuke alarm MW2]` -> `"نوك"` / `"Tactical Nuke"`

---

### 14. `WORK_TO_CHARACTER`
- **Interaction Shape:** Name the movie, game, band, anime, or series -> ask for the specific protagonist/villain/member fulfilling a unique role.
- **What Makes It Fun:** Navigating narrative hierarchy and recalling who starred in what.
- **Best Use Cases:** Flagship titles with iconic ensemble casts.
- **Bad Use Cases:** Generic background extras with 2 seconds of screen time.
- **Expected Answer Shape:** Character or person name.
- **Suitable Pace:** Fast (10–20s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** Optional title frame.
- **Compatible Worlds:** Movies, Series, Video Games, Anime.
- **Common Failure Patterns:** Prompt leaks the character unique traits inside the question stem.
- **Examples:**
  1. *Movies:* `"من هو الشرير الرئيسي في فيلم Avengers: Infinity War الساعي لجمع أحجار الأبدية؟"` -> `"ثانوس"`
  2. *Video Games:* `"من هو البطل الرئيسي في لعبة The Witcher 3 الملقب بالذئب الأبيض؟"` -> `"جيرالت"` / `"جيرالت أوف ريفيا"`

---

### 15. `CHARACTER_TO_WORK`
- **Interaction Shape:** Name a distinct character, unique weapon, or specialized faction -> ask which movie, game, franchise, or show they belong to.
- **What Makes It Fun:** Rapid categorization and franchise mapping.
- **Best Use Cases:** Distinctive secondary characters, famous organizations, unique weapons.
- **Bad Use Cases:** Common generic names that appear in dozens of works (e.g. "John", "David").
- **Expected Answer Shape:** Franchise or work title.
- **Suitable Pace:** Fast (10–20s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** Optional character visual.
- **Compatible Worlds:** Video Games, Anime, Movies, Series.
- **Common Failure Patterns:** The work title is too broad (e.g. "Marvel" vs "Spider-Man").
- **Examples:**
  1. *Video Games:* `"الوحش المرعب 'نمسيس'... ينتمي لأي سلسلة ألعاب رعب شهيرة؟"` -> `"ريزيدنت إيفل"`
  2. *Series:* `"شخصية غوس فرينغ صاحب مطعم Los Pollos Hermanos ظهرت في أي مسلسل شهير؟"` -> `"بريكينغ باد"` / `"Breaking Bad"`

---

### 16. `WHO_SAID_OR_DID_IT`
- **Interaction Shape:** Cite an iconic, unforgettable quote or cite a legendary historic act -> identify the person who said or did it.
- **What Makes It Fun:** Quotability and dramatic cultural resonance.
- **Best Use Cases:** Highly recognizable meme quotes, iconic historic acts.
- **Bad Use Cases:** Random boilerplate dialogue; quotes where the name is mentioned inside the sentence.
- **Expected Answer Shape:** Person or character name.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional scene screenshot.
- **Compatible Worlds:** Movies, Series, Anime, Football, History.
- **Common Failure Patterns:** Selecting generic dialogue (e.g. "Let us go") that 100 characters have spoken.
- **Examples:**
  1. *Series:* `"صاحب العبارة الشهيرة: 'I am the one who knocks'... من هذه الشخصية؟"` -> `"والتر وايت"` / `"هايزنبرغ"`
  2. *Football:* `"في نهائي كأس العالم 2006... من اللاعب الفرنسي الذي نطح ماتيراتزي ونال البطاقة الحمراء؟"` -> `"زين الدين زيدان"`

---

### 17. `BEFORE_AFTER`
- **Interaction Shape:** Did Event X happen before or after Event Y? Or who was the manager/champion immediately before/after?
- **What Makes It Fun:** Relational timeline thinking without demanding exact date/year memorization.
- **Best Use Cases:** Major milestones, championship sequences, hardware/console generations.
- **Bad Use Cases:** Obscure dates separated by minor intervals with no cultural significance.
- **Expected Answer Shape:** Binary (قبل / بعد) or entity name.
- **Suitable Pace:** Fast (10–15s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** None.
- **Compatible Worlds:** Football, Sports, History, Video Games, Tech.
- **Common Failure Patterns:** Ambiguous timing in regional releases (e.g. Japanese release vs Western release).
- **Examples:**
  1. *Football:* `"بيب غوارديولا... قبل تدريب مانشستر سيتي، ما النادي الألماني الذي دربه؟"` -> `"بايرن ميونخ"`
  2. *Video Games:* `"جهاز بلايستيشن 3... صدر قبل أو بعد جهاز بلايستيشن 2؟"` -> `"بعد"`

---

### 18. `ODD_ONE_OUT`
- **Interaction Shape:** Present 4 items where 3 share an objective property and 1 does not -> player identifies the outlier.
- **What Makes It Fun:** Comparative puzzle solving and spotting the hidden unifying pattern.
- **Best Use Cases:** RYO Multiple Choice, Split mechanics.
- **Bad Use Cases:** Subjective distinctions where multiple items could be argued as odd.
- **Expected Answer Shape:** The odd entity name.
- **Suitable Pace:** Normal (20–30s).
- **Difficulty Range:** Medium to Hard.
- **Media Requirements:** Optional 4-item visual grid.
- **Compatible Worlds:** Football, Cars, Geography, Anime, Video Games.
- **Common Failure Patterns:** The odd property is trivial (e.g. "has an odd number of letters in their name").
- **Examples:**
  1. *Football:* `"ريال مدريد، ميلان، بايرن ميونخ، باريس سان جيرمان... من النادي الوحيد الذي لم يحقق دوري أبطال أوروبا؟"` -> `"باريس سان جيرمان"`
  2. *Cars:* `"فيراري، لامبورغيني، مازيراتي، بورشه... أي شركة من هذه الشركات ليست إيطالية؟"` -> `"بورشه"`

---

### 19. `CATEGORY_IDENTIFICATION`
- **Interaction Shape:** Provide 2–3 distinctive traits/clues (e.g. Country + Color + Stadium, or Position + Shirt # + Country) -> identify the entity.
- **What Makes It Fun:** Synthesizing multiple clues to lock in an identity.
- **Best Use Cases:** Clubs, nations, brands, car manufacturers.
- **Bad Use Cases:** Clue sets that leak the answer or point to multiple targets.
- **Expected Answer Shape:** Single entity name.
- **Suitable Pace:** Normal (15–25s).
- **Difficulty Range:** Medium.
- **Media Requirements:** Optional clue badges.
- **Compatible Worlds:** Football, Geography, Cars, Sports.
- **Common Failure Patterns:** Clues contradict each other across historical eras.
- **Examples:**
  1. *Football:* `"نادي إنجليزي، لقبه المدفعجية، ملعبه الإمارات... ما هذا النادي؟"` -> `"أرسنال"`
  2. *Geography:* `"دولة عاصمتها كانبيرا وتشتهر بحيوان الكنغر... ما هي؟"` -> `"أستراليا"`

---

### 20. `FAST_ATTRIBUTE`
- **Interaction Shape:** Ask for a single snappy, indisputable attribute under time pressure (nationality, iconic shirt number, role, engine type, country of origin).
- **What Makes It Fun:** Instant reflex recall; zero reading overhead; ideal for rapid pressure rounds.
- **Best Use Cases:** Bomb, Marhala (Easy/Med), Combo (Stage 1).
- **Bad Use Cases:** Volatile attributes that change every transfer window without time anchoring.
- **Expected Answer Shape:** 1 word (Nationality, number, role, country).
- **Suitable Pace:** Very Fast (5–10s).
- **Difficulty Range:** Easy to Medium.
- **Media Requirements:** Optional subject image.
- **Compatible Worlds:** Football, Sports, Cars, Video Games, Anime.
- **Common Failure Patterns:** Asking for a shirt number that the player only wore for 2 pre-season friendlies.
- **Examples:**
  1. *Football:* `"النجم إرلينغ هالاند... وش جنسيته؟"` -> `"نرويجي"` / `"النرويج"`
  2. *Video Games:* `"في أوفرواتش، البطل راينهارت ينتمي لأي فئة (Role)؟"` -> `"تانك"` / `"Tank"`
  3. *Cars:* `"شركة سيارات تويوتا... تنتمي لأي دولة؟"` -> `"اليابان"`
