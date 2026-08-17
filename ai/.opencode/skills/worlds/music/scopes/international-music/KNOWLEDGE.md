# Scope: International Music

- `scopeId`: `music.international-music`
- `worldId`: `music`
- Boundary: Internationally recognizable music — Pop, Rock, Hip-Hop, major
  global artists, global songs, major bands, and major music eras.
- Included: globally recognizable artists and songs, band identity, eras,
  albums, collaborations, and major music moments.
- Excluded: niche local trivia unless intentionally Hard but fair; volatile
  streaming/chart totals; record-label trivia.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: lyric-fragment content items beyond fair short fragments.
- Safety: avoid volatile popularity metrics; artist names with common Arabic
  transliterations (مايكل جاكسون, أديل, كوين, البيتلز).

# International Music Knowledge

## Identity and Vocabulary

Durable sets include globally recognizable artists and bands, their signature
songs and albums, and major eras of pop/rock/hip-hop.

## Safe Entity Sets

- Pop: Michael Jackson, Madonna, Beyoncé, Taylor Swift, Adele, Whitney
  Houston, Lady Gaga, Rihanna.
- Rock: The Beatles, Queen, Led Zeppelin, Nirvana, Guns N' Roses, AC/DC,
  Coldplay, U2, Elvis Presley.
- Hip-Hop: Eminem, Tupac, The Notorious B.I.G., Drake, Kanye West, Jay-Z,
  Snoop Dogg.
- Signature songs, albums, and famous collaborations widely recognizable.

## Stable Classifications

Artist-to-song, artist-to-album, and artist-to-genre associations are
deterministic and safe for flagship material.

## Ambiguity and Sources

Volatile chart/streaming statistics, live personnel changes, and lyric
ownership are high risk. Prefer official artist material; date-bound any
time-sensitive fact. Arabic transliterations must match common usage
(e.g. "مايكل جاكسون" not a novel spelling).