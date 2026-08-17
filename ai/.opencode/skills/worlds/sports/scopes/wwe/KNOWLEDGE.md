# Scope: WWE

- `scopeId`: `sports.wwe`
- `worldId`: `sports`
- Boundary: WWE sports entertainment — wrestlers, championships, finishing
  moves, factions, tag teams, WrestleMania, Royal Rumble, iconic matches,
  entrances, rivalries, famous moments.
- Included: multiple eras and wrestlers (Attitude Era, Ruthless Aggression,
  Golden Era, modern), championships, factions.
- Excluded: implying scripted outcomes are legitimate competitive sporting
  records in the same sense as UFC/F1/NBA; volatile current reign lengths.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: treat WWE facts per WWE's own canonical presentation; avoid leaking
  ring names via nicknames when the alias is the accepted answer.

# WWE Knowledge

## Identity and Vocabulary

Durable sets include wrestlers, factions, championships, and major events.

## Safe Entity Sets

- Wrestlers (across eras): Hulk Hogan, The Rock, Stone Cold Steve Austin, The
  Undertaker, John Cena, Randy Orton, Triple H, Shawn Michaels, Bret Hart,
  The Ultimate Warrior, Brock Lesnar.
- Factions: The Shield, DX, The nWo, The Four Horsemen, Evolution.
- Championships: WWE Championship, Universal Championship, Intercontinental,
  Tag Team.
- Events: WrestleMania, Royal Rumble, SummerSlam, Survivor Series.
- Finishing moves: Stone Cold Stunner, Rock Bottom/People's Elbow, Tombstone,
  F5, Attitude Adjustment, Pedigree, Sweet Chin Music.

## Stable Classifications

Wrestler-to-finisher, wrestler-to-faction, and wrestler-to-era associations
are deterministic and safe.

## Ambiguity and Sources

Current title reigns and live roster are high risk — date-bind or avoid. Treat
WWE as entertainment canon. Avoid leaking answers via nicknames. Arabic terms
must match established usage.