# World: الأغاني (Music)

- `worldId`: `music`
- Identity: audio-first recognition of songs, artists, intros, melodies,
  albums, collaborations, eras, and major music moments across Saudi, Gulf,
  Arabic, and International music.
- Tone: recognition-led, discussion-friendly, and culturally aware.
- Media anchors: short lawful audio snippets (intro, hook, recognizable
  section) and artist frames, attached through the existing media pipeline.
- Safety: no large verbatim lyric banks; no volatile streaming/views/
  followers/chart totals unless explicitly date-bound; no record-label or
  producer-credit trivia.
- Audio design: OpenCode authors the content item, answer, and structured
  media-search intent. The existing AI/Wigolo service performs YouTube search,
  source selection, and audio snippet extraction. OpenCode never searches
  YouTube or downloads audio directly.
- Signature mechanic: `first_note` (من أول نغمة)
  - **Pre-Auction Clue Rule**: The clue exists to help players decide "How many seconds do I need?". Therefore, **Artist Identity is the DEFAULT anchor** (e.g., `الفنان: [artist]`, `الفنانة: [artist]`, `الفرقة: [group]`). Generic AI-style descriptive filler is strictly forbidden. Year/Album exceptions allowed only when Product-justified.

This World supplies presentation context only.

## Question Palette

- **High-Value Archetypes**:
  - `AUDIO_RECOGNITION` (Song intro chords, melodic hooks, distinctive voice timbre)
  - `COMPLETION` (Very short iconic title/phrase completion: `"الأماكن كلها...؟" -> مشتاقة لك`)
  - `COMPLETE_THE_NAME` (Iconic duo names, album titles: `"محمد...؟" -> عبده`)
  - `REAL_NAME` (Famous stage names -> real first/full name: `"ليدي غاغا" -> ستيفاني`)
  - `CONNECTION` (Shared collaboration, famous duet, shared lyricist/composer)
  - `WORK_TO_CHARACTER` & `CHARACTER_TO_WORK` (Album <-> Song, Singer <-> Signature Track)
  - `VISUAL_RECOGNITION` (Album cover arts with text removed, artist portraits)
- **Usable Archetypes**:
  - `NICKNAME_OR_ALIAS` (e.g. `"فنان العرب" -> محمد عبده`, `"صوت الأرض" -> طلال مداح`)
  - `FAST_ATTRIBUTE` (Artist nationality, primary instrument)
  - `BEFORE_AFTER` (Classic album release sequence)
- **Archetypes to Limit**:
  - Long lyrics: Verbatim lyrics longer than 4 words are strictly forbidden.
  - Volatile streaming numbers: Views, follower counts, and monthly Spotify listeners are forbidden.
  - Studio engineer / secondary producer trivia.
- **Content Dimensions to Rotate Through**:
  - Saudi Music, Gulf Classics, Arab Pop/Classics, International Hits, Signature Albums, Legendary Melodies, Iconic Collabs.
- **World-Specific Anti-Patterns**:
  - *Parallel Audio Pipelines*: Audio must only be specified as media intents for downstream retrieval; never download YouTube clips directly during authoring.
