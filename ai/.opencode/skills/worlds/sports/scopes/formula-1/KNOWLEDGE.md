# Scope: Formula 1

- `scopeId`: `sports.formula-1`
- `worldId`: `sports`
- Boundary: Formula 1 — drivers, teams, circuits, championships, constructors,
  famous races, iconic cars, records, rivalries, driver numbers, terminology.
- Included: Ferrari, McLaren, Mercedes, Red Bull, Williams, iconic champions,
  classic/current circuits, major records.
- Excluded: niche statistical splits, current standings without date-binds,
  changing career totals without date context.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: current driver/team assignments and current records must be
  web-verified if used; prefer stable historical facts. Date-bind race-win and
  pole totals.

# Formula 1 Knowledge

## Identity and Vocabulary

Durable sets include teams, drivers, circuits, championships, and records.

## Safe Entity Sets

- Teams: Ferrari, McLaren, Mercedes, Red Bull, Williams, Renault/Alpine,
  Aston Martin, Haas.
- Champions: Schumacher, Hamilton, Senna, Prost, Vettel, Verstappen, Lauda,
  Piquet, Mansell.
- Circuits: Monaco, Silverstone, Monza, Spa, Suzuka, Interlagos, Bahrain, Jeddah.
- Records: most championships (Hamilton/Schumacher 7), most wins (Hamilton),
  most poles (Hamilton), youngest champion (Vettel).

## Stable Classifications

Driver-to-team, driver-to-championship-year, and circuit-to-country
associations are deterministic and safe for historical facts.

## Ambiguity and Sources

Current standings, active rosters, and live career totals are high risk —
date-bind or avoid. Prefer stable historical records. Arabic terms must match
established usage (فورمولا 1).