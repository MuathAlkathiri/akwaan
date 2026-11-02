# World Experience Profile: celebrities

## World Identity
Famous people as the public knows them, through their work. Recognition is the pleasure, and the shared moment is "I know that face" or "that's their song".

## Player Experience
How players feel when answering in this World: quick recognition, friendly arguments over who is who, and pride in knowing a star's work.

## Strong Content Territories
Best formats for this World.
- Strong: Famous works, signature moments, public nicknames, career milestones with a clear date.

## Weak / Meta Territories
Avoid trivia that feels like a wiki lookup.
- Weak: Follower counts, earnings, exact ages, and anything that only a gossip page would know.

## Natural Evidence Forms
Real photographs of real people, and real recordings. Image rules are in `.agents/skills/akwaan-media/SKILL.md`, including `AUTHENTIC_REAL_PERSON_ONLY`.

## World vs Scope Responsibility
World defines the tone and the safety boundary. Scopes define which celebrities belong where.

## World-Specific Anti-Patterns
- Private life. Content covers public careers only. Never use marriage, relationships, children and family, health, religion, politics, money, appearance, age, rumours and legal disputes.
- Mockery, or any question that demeans a person.
- A fact about a living person stated as current without a date.

# World: Celebrities (المشاهير)

- `worldId`: `celebrities`
- Identity: public careers in acting, music, sports, online content, and TV and media.
- Scopes: `arab-acting-stars`, `non-arab-acting-stars`, `arab-music-stars`, `non-arab-music-stars`, `arab-sports-stars`, `non-arab-sports-stars`, `arab-content-creators`, `non-arab-content-creators`, `arab-media-stars`, `non-arab-media-stars`.

## Exclusivity Rule

A celebrity belongs to **one Scope**, set by two axes.

- **Arab or non-Arab identity.** Saudi, Gulf, Egyptian, Levantine, Maghrebi and other Arab celebrities belong in the Arab Scope. There are no Scopes by country.
- **Primary source of fame.** An actor who also sings goes by their primary or initial source of fame. An athlete with a big following stays in sports. A presenter with a social presence stays in media. A creator who later appears on TV stays a creator unless their primary fame clearly shifted.
