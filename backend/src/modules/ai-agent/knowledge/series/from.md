# Context

FROM is a science-fiction horror mystery series about a nightmarish town that traps people who enter it. The residents try to survive, understand the town, and find a way home while dangerous human-looking creatures come out at night.

Use this file for the `from` / `FROM` category only. The player base is expected to know the show, not just generic horror vocabulary.

---

# Canon Anchors

## Main people and roles

Player-facing answers must be Arabic-first. For character names, use the Arabic display answer below, and keep the canonical English name in `assetRequest.entity`, `assetRequest.originalName`, or verification metadata when needed.

- Boyd Stevens — sheriff / de facto leader trying to protect the town. Display answer: `بويد ستيفنز (Boyd Stevens)`.
- Tabitha Matthews — mother from the Matthews family; tied to house, tunnel, tower/lighthouse, and escape mysteries. Display answer: `تابيثا ماثيوز (Tabitha Matthews)`.
- Jim Matthews — Tabitha's husband; often connected to radio/tower attempts and family survival. Display answer: `جيم ماثيوز (Jim Matthews)`.
- Julie Matthews — Matthews daughter. Display answer: `جولي ماثيوز (Julie Matthews)`.
- Ethan Matthews — Matthews son. Display answer: `إيثان ماثيوز (Ethan Matthews)`.
- Jade Herrera — wealthy software developer; sees symbols/visions and investigates the town's patterns. Display answer: `جايد هيريرا (Jade Herrera)`. Do not write "جيدرا".
- Victor — long-time resident who survived in the town from childhood; knows many strange rules and memories. Display answer: `فيكتور (Victor)`.
- Donna Raines — Colony House leader. Display answer: `دونا رينز (Donna Raines)`.
- Kenny Liu — deputy connected to the town's law/safety structure. Display answer: `كيني ليو (Kenny Liu)`.
- Kristi Miller — medic/doctor figure. Display answer: `كريستي ميلر (Kristi Miller)`.
- Sara Myers — receives voices/messages and is linked to dangerous early-season choices. Display answer: `سارا مايرز (Sara Myers)`.
- Fatima Hassan — Colony House resident; relationship with Ellis. Display answer: `فاطمة حسن (Fatima Hassan)`.
- Ellis Stevens — Boyd's son. Display answer: `إليس ستيفنز (Ellis Stevens)`.
- Father Khatri — priest and early moral guide. Display answer: `الأب ختري (Father Khatri)`.
- Tian-Chen Liu — Kenny's mother. Display answer: `تيان تشين ليو (Tian-Chen Liu)`.

## Places and objects

- The town — traps anyone who enters; roads loop back.
- Colony House — communal house led by Donna.
- Diner — community hub.
- Sheriff station / post office — linked to Boyd and town order.
- Forest — source of danger, symbols, visions, and unexplained travel.
- Talisman stones — protect people indoors from the night creatures when properly placed.
- Faraway trees — mysterious trees connected to strange transportation.
- Bottle tree — recurring mystery object/tree imagery.
- Lighthouse / tower — connected to Tabitha and escape/vision mysteries.
- Underground tunnels/caves — linked to the creatures and hidden town spaces.
- Radio tower — linked to attempts to communicate outside.

## Threats and mysteries

- Night creatures / monsters — human-looking beings that come at night, smile, manipulate, and kill people who let them in.
- The talismans are a practical survival rule, not a weapon.
- The town's road loop prevents normal escape.
- Visions, voices, symbols, cicadas/music box, children, trees, and tunnels are mystery motifs.
- Avoid claiming final explanations for unsolved mysteries unless the knowledge is explicitly verified.

---

# Prefer

- Questions about survival rules, places, objects, and character roles.
- Clear answerable prompts: "من هو..." / "ما اسم..." / "أي مكان..." / "ما الشيء..."
- Video/image clues for memorable scene/action recognition when an asset is realistic.
- Trivia questions for unresolved mysteries, so the question tests known facts without pretending the mystery is solved.
- Arabic wording with Arabic-first answers. Use the canonical English answer in parentheses for character names when useful.
- For character answers, do not output English-only answers. Use the provided display answer. Keep exact canonical English names in asset metadata/search metadata, not as the only visible answer.

---

# Avoid

- Do not ask "ما اسم المسلسل؟"
- Do not invent final answers to unresolved mysteries.
- Do not create generic horror questions that could fit any show.
- Do not use `identifyVoice` unless a real reliable voice/speech source is explicitly available.
- Do not ask for a monster's exact origin as settled fact.
- Do not make the answer a vague concept like "الخوف" or "الغموض".
- Do not use episode numbers unless they are confidently known.

---

# Asset Guidance

## Good video asset requests

Use video for scene/action clues when supported:

```json
{
  "type": "video",
  "assetType": "video",
  "entity": "Boyd Stevens",
  "franchise": "FROM",
  "entityType": "character",
  "categoryType": "series",
  "searchContext": "sheriff town scene",
  "duration": 6
}
```

```json
{
  "type": "video",
  "assetType": "video",
  "entity": "Tabitha Matthews",
  "franchise": "FROM",
  "entityType": "character",
  "categoryType": "series",
  "searchContext": "lighthouse tower scene",
  "duration": 6
}
```

## Good image asset requests

Use image for character/place recognition:

```json
{
  "type": "image",
  "assetType": "image",
  "entity": "Colony House",
  "franchise": "FROM",
  "entityType": "place",
  "categoryType": "series",
  "visualHint": "communal house exterior",
  "purpose": "gameplay"
}
```

## Bad asset requests

- `{"type":"audio","entity":"Varys","franchise":"Game of Thrones"}` — wrong franchise and unreliable voice.
- `{"type":"audio","entity":"Boyd Stevens","context":"mysterious speech"}` — avoid voice unless a specific reliable source is known.
- `{"type":"image","query":"الشخص الذي..."}` — query is too generic; use entity/franchise metadata.

---

# Difficulty Guide

## Easy

- Talismans protect residents indoors at night.
- Night creatures come out after dark.
- Boyd is the sheriff/leader figure.
- Donna leads Colony House.
- The town traps people and roads loop.

## Medium

- Jade's connection to symbols/visions.
- Victor as the long-time survivor.
- Tabitha's connection to tunnels/tower/lighthouse mysteries.
- Sara's voices/messages and dangerous choices.
- Colony House vs town roles.

## Hard

- Faraway trees, bottle tree, cicadas/music box, tunnels, and recurring symbols.
- Consequences of specific survival mistakes.
- Character relationships and motivations without overclaiming mystery solutions.

---

# Good Question Examples

- ما اسم الأحجار التي تساعد السكان على الحماية من المخلوقات ليلًا؟
- من هو الشريف الذي يحاول تنظيم بقاء سكان البلدة؟
- أي مكان في المسلسل تقوده دونا ويعيش فيه عدد من السكان بشكل جماعي؟
- مين أكثر شخص متعلق بالرموز والرؤى ومحاولة فهم لغز البلدة؟
- ما الخطر الذي يظهر غالبًا بعد حلول الليل ويستدرج الناس لفتح الأبواب؟

---

# Bad Question Examples

- ما سبب وجود البلدة؟  ← لغز غير محسوم.
- من هو أقوى شخص في المسلسل؟  ← رأي.
- ما اسم مسلسل الرعب الذي تدور أحداثه في بلدة؟  ← يكشف الفئة ولا يختبر معرفة.
