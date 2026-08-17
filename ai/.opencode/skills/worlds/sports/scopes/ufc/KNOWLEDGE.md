# Scope: UFC

- `scopeId`: `sports.ufc`
- `worldId`: `sports`
- Boundary: UFC — fighters, weight classes, champions, famous fights,
  rivalries, event history, finishes, major records, fighting styles, iconic
  moments.
- Included: major fighters across eras/divisions, famous fights, championship
  history, weight-class limits.
- Excluded: overly niche judging statistics, current rankings/career totals
  without date-binds.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: current champions, rankings, and active records may change — verify
  current facts; prefer historical championship facts, famous fight outcomes,
  stable fighter facts, established records.

# UFC Knowledge

## Identity and Vocabulary

Durable sets include fighters, weight classes, championships, and famous
fights.

## Safe Entity Sets

- Weight classes: heavyweight (265 lb), light heavyweight (205), middleweight
  (185), welterweight (170), lightweight (155), featherweight (145), bantamweight
  (135), flyweight (125).
- Fighters (historical/stable): Silva, GSP, Jon Jones, Khabib, Conor McGregor,
  Amanda Nunes, Ronda Rousey, Cain Velasquez, Anderson Silva, Chuck Liddell,
  Tito Ortiz.
- Famous fights: Silva vs Griffin, McGregor vs Alvarez, Khabib vs McGregor,
  Nunes vs Rousey, Jones vs Cormier.
- Records: longest title reign (Silva, Nunes), most title defenses (Silva 10).

## Stable Classifications

Fighter-to-weight-class, fighter-to-era, and fight-to-outcome associations are
deterministic and safe for historical facts.

## Ambiguity and Sources

Current champions and live career totals are high risk — date-bind or avoid.
Prefer stable historical facts. Arabic terms must match established usage.