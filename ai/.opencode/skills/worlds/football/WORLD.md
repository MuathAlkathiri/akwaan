# World Experience Profile: football

## World Identity
The core aesthetic and thematic identity of football. Focus on authentic engagement.

## Player Experience
How players feel when answering questions in this World. Must be kinetic and reward true fandom.

## Strong Content Territories
Best formats for this World.
- Strong: Signature moments, historic jerseys, famous derbies.

## Weak / Meta Territories
Avoid trivia that feels like a wiki lookup.
- Weak: Exact transfer fees or minor match stats.

## Natural Evidence Forms
What media types work best (e.g., Audio, Video, Image).

## World vs Scope Responsibility
World defines the tone and media boundaries. Scopes define the factual boundaries.

## World-Specific Anti-Patterns
Avoid breaking the core experience of football.

# World: Football

- `worldId`: `football`
- Identity: matches, clubs, national teams, players, tournaments, tactics,
  transfers, stadiums, commentary, and crowd memory.
- Tone: competitive, celebratory, debate-rich, and globally recognizable.
- Media anchors: licensed match frames, formations, kits, badges, stadiums,
  commentary, and event timelines.
- Safety: distinguish men's, women's, youth, club, and national competitions;
  date all roster and record claims.
- Presentation: broadcast-inspired frame, crowd sound profile, and match-clock pacing.
- Signature mechanic: unassigned; the World is not launch-ready.

This World supplies presentation context only.

## Question Palette

- **High-Value Archetypes**:
  - `NAME_FRAGMENT` (e.g. `"بيلينغهام... وش اسمه الأول؟" -> جود`)
  - `CAREER_PATH` (e.g. `"لشبونة ← مانشستر يونايتد ← ريال مدريد ← يوفنتوس... من اللاعب؟"`)
  - `NICKNAME_OR_ALIAS` (e.g. Club monikers: `"الذئاب" -> روما`, `"المدفعجية" -> أرسنال`)
  - `DETAIL_RECOGNITION` (e.g. Stadium stands: `"الكوب" -> أنفيلد`, iconic kits/boots)
  - `VISUAL_RECOGNITION` & `PARTIAL_VISUAL` (Stadiums, crests, iconic trophy silhouettes)
  - `FAST_ATTRIBUTE` (Nationalities, stable iconic shirt numbers, playing positions)
  - `CONNECTION` (e.g. Three players who shared a historic title or club)
  - `REVERSE_QUESTION` (e.g. `"كارلو أنشيلوتي حقق الأبطال مع ريال مدريد وأي نادٍ إيطالي آخر؟" -> ميلان`)
- **Usable Archetypes**:
  - `COMPLETE_THE_NAME` (e.g. `"وست هام...؟" -> يونايتد`)
  - `SEQUENCE` (e.g. World Cup champions sequence)
  - `ODD_ONE_OUT` (e.g. Outlier club without Champions League title)
  - `WHO_SAID_OR_DID_IT` (e.g. Legendary historic World Cup moments)
  - `BEFORE_AFTER` (e.g. `"بيب غوارديولا درب أي نادٍ ألماني قبل مانشستر سيتي؟"`)
- **Archetypes to Limit**:
  - Exact year memorization (e.g. `"في أي سنة فاز نادي X بكأس Y؟"`) -> Replace with `BEFORE_AFTER` or `SEQUENCE`.
  - Generic `"من هو اللاعب؟"` without a distinct cognitive shape.
- **Content Dimensions to Rotate Through**:
  - Players, Clubs, Managers, Stadiums & Landmarks, Historical Moments, Tournaments & Trophies, Transfers & Career Paths, Kits & Badges, Nicknames, National Teams.
- **World-Specific Anti-Patterns**:
  - *Transfer rumor / volatile stats*: Avoid unconfirmed transfers or seasonal stats that become obsolete in months.
  - *Generic stat counting*: Avoid `"كم هدف سجل فلان في موسم كذا؟"`.
