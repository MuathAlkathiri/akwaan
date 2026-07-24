# Arabic Music

The LLM selects real Arabic songs dynamically. The question is always `ما اسم هذه الأغنية؟`; the answer is the song title, never the artist.

Rules:

- Every proposed title and artist pair must be externally verified through Wigolo before an asset provider is called.
- Include the exact canonical title and artist in the asset request.
- Vary countries, artists, eras, and popularity according to difficulty.
- Do not repeat a title or title/artist pair within a generated batch.
- Wrong answers must be other real Arabic song titles.
- Do not use covers, remixes, karaoke, compilations, live performances, or slowed versions.
