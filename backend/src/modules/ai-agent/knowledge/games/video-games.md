# Context

Use this file for broad video-games categories such as `ألعاب`, `العاب`, `Video Games`, `Games`, and `Gaming`.

The audience plays a fast social quiz. Questions should feel made by someone who actually plays games, not a generic AI summary.

---

# Core Rule

Make video-game questions stronger by asking about playable knowledge:

- mechanics
- abilities
- weapons/items
- maps/locations
- bosses/enemies
- objectives
- factions/classes
- iconic missions/scenes
- game modes
- recognizable UI/gameplay terms
- character roles only when the clue is specific to the game

Avoid weak generic prompts where the answer could be guessed from the category alone.

---

# Answer Language

- Player-facing answers must be Arabic-first.
- For proper nouns, use Arabic followed by canonical English in parentheses when useful.
- Keep English canonical titles/names in asset metadata for search and verification.
- Do not output English-only answers unless the term is normally used in English by Arab players.

Examples:

- `كريتوس (Kratos)`
- `سلاح الماستر سورد (Master Sword)`
- `جراند ثفت أوتو V (Grand Theft Auto V)`
- `كريبر (Creeper)`

---

# Strong Question Patterns

Prefer questions like:

- وش السلاح الأيقوني اللي يحمله لينك في أغلب ألعاب Zelda؟
- في Minecraft، وش الكائن اللي ينفجر إذا قرب منك؟
- أي لعبة اشتهرت ببناء الحصون وقت القتال؟
- في God of War، مين الإله اللي يحمل فأس ليفايثان؟
- وش اسم المدينة المفتوحة في GTA V؟
- في Elden Ring، وش العملة/المورد اللي تجمعه بدل الخبرة؟
- في Among Us، وش دور اللاعب اللي يحاول يخرب السفينة بدون ما ينكشف؟

The question should test one concrete game fact. One clue is enough.

---

# Weak Question Patterns to Avoid

Do not generate questions like:

- من هو بطل اللعبة؟
- ما اسم هذه اللعبة المشهورة؟
- من الشخصية التي تمتلك قوة كبيرة؟
- ما اللعبة التي يحبها اللاعبون؟
- ما العنصر المهم في هذه اللعبة؟
- أي لعبة تعتبر من أشهر الألعاب؟

These are too generic unless the question includes a specific mechanic, scene, item, map, or objective.

---

# Gameplay Mix

For broad video-games categories:

- Use mostly `trivia`, `identifyImage`, `identifyCharacter`, and `timeline`.
- Use `video` only for recognizable gameplay/action clips when metadata is specific.
- Do not use `identifyVoice` unless the clue is a famous voice line with reliable source metadata.
- Avoid music modes unless the category is explicitly game music.

---

# Good Asset Metadata

Use concise metadata that helps the provider search correctly.

## Character/image clue

```json
{
  "type": "image",
  "assetType": "image",
  "entity": "Kratos",
  "localizedName": "كريتوس",
  "franchise": "God of War",
  "entityType": "character",
  "categoryType": "games",
  "visualHint": "Kratos with Leviathan Axe",
  "purpose": "gameplay"
}
```

## Gameplay video clue

```json
{
  "type": "video",
  "assetType": "video",
  "entity": "Minecraft Creeper",
  "localizedName": "كريبر",
  "franchise": "Minecraft",
  "entityType": "enemy",
  "categoryType": "games",
  "searchContext": "creeper exploding gameplay",
  "duration": 6
}
```

---

# Difficulty Guide

## Easy

- Very famous games, characters, mechanics, items, or enemies.
- Examples: Mario jumps on enemies, Minecraft creeper explodes, Kratos in God of War, Fortnite building, GTA open world.

## Medium

- Specific but recognizable facts for regular players.
- Examples: Zelda Master Sword, Elden Ring runes, Assassin's Creed hidden blade, Portal portal gun, The Last of Us clickers.

## Hard

- Deeper gameplay knowledge, boss names, faction/class mechanics, mission names, map details, or item effects.
- Must still be fair and recognizable to fans; do not ask random release dates unless iconic.

---

# Curated Fact Bank

The following are immutable source facts that may be used to create questions. Copy the relevant sentence verbatim into `excerpt` when selecting a fact.

- في لعبة Portal، تستخدم Chell جهاز Aperture Science Handheld Portal Device لإنشاء بوابتين مترابطتين.
- تدور أحداث لعبة BioShock الأولى في مدينة Rapture الغارقة تحت البحر.
- في لعبة The Last of Us، يُسمّى المصابون الذين يعتمدون على تحديد الموقع بالصدى Clickers.
- في Elden Ring، تُستخدم Runes عملةً ونقاط خبرة لتطوير الشخصية وشراء الأدوات.
- السلاح المميز لجماعة الأساسنز في Assassin's Creed هو Hidden Blade المثبت في المعصم.
- في Mario Kart، تستهدف Blue Shell عادةً المتسابق الموجود في المركز الأول.
- في Halo، يحمل Master Chief الرقم العسكري Spartan-117.
- في Overwatch، تستطيع شخصية Mercy إحياء زميل سقط باستخدام قدرة Resurrect.
- في League of Legends، يمنح قتل Baron Nashor الفريق تعزيز Hand of Baron.
- في Dark Souls، يعيد اللاعب تعبئة قوارير Estus عند الاستراحة قرب Bonfire.
- في Resident Evil، تعمل أعشاب Green Herb على استعادة صحة الشخصية.
- في Pokémon، تكون هجمات النوع المائي فعالة ضد Pokémon من النوع الناري.
- في DOOM، يُعرف بطل السلسلة باسم Doom Slayer.
- في Half-Life، يعمل Gordon Freeman عالماً في منشأة Black Mesa للأبحاث.
- في Metal Gear Solid، يكون التخفي وتجنب اكتشاف الحراس محور أسلوب اللعب.
- في Counter-Strike، يحتاج فريق مكافحة الإرهاب إلى Defuse Kit لتقليل زمن تفكيك القنبلة.
- في Rocket League، يقود اللاعبون سيارات تعمل بالدفع الصاروخي لضرب كرة عملاقة نحو المرمى.
- في Hades، يحاول Zagreus الهروب من العالم السفلي الذي يحكمه والده Hades.
- في Hollow Knight، تدور المغامرة في مملكة Hallownest المهجورة.
- في Sekiro: Shadows Die Twice، تسمح أداة Grappling Hook للبطل بالتنقل إلى نقاط مرتفعة.
- في Red Dead Redemption 2، ينتمي Arthur Morgan إلى عصابة Van der Linde.
- في Mass Effect، يقود Commander Shepard السفينة Normandy في مهماته عبر المجرة.
- في Skyrim، تُسمّى قدرة البطل على استخدام الصيحات السحرية Thu'um.
- في Fallout، يعرض جهاز Pip-Boy حالة الشخصية وخريطتها ومخزونها.
- في Ghost of Tsushima، بطل القصة هو الساموراي Jin Sakai.

---

# Good Question Examples

- وش الأداة اللي تستخدمها Chell للتنقل بين الجدران في Portal؟
- في The Last of Us، وش اسم المصابين اللي يعتمدون على الصوت بدل النظر؟
- أي لعبة تستخدم الـ Runes كمورد للتطوير بعد هزيمة الأعداء؟
- وش السلاح الخفي المعروف عند جماعة الأساسنز؟
- في Mario Kart، وش العنصر اللي يطارد صاحب المركز الأول؟

# Bad Question Examples

- من هو بطل لعبة مشهورة؟ ← عام جدًا.
- ما اللعبة التي تحتوي على قتال؟ ← ينطبق على آلاف الألعاب.
- من الشخصية القوية في اللعبة؟ ← رأي وغامض.
- ما اسم اللعبة التي يحبها اللاعبون؟ ← غير قابل للتحقق.
