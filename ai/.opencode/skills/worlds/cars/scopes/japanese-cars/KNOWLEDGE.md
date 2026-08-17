# Scope: Japanese Cars

- `scopeId`: `cars.japanese-cars`
- `worldId`: `cars`
- Boundary: Japanese car brands, models, generations, iconic designs, engines,
  drivetrains, performance, and automotive culture — including JDM sports cars
  and recognizable mainstream/4x4 identity.
- Included: Toyota, Nissan, Honda, Mazda, Subaru, Mitsubishi, Lexus (where
  appropriate); iconic models (Supra, Skyline GT-R/GT-R, RX-7, NSX, Lancer
  Evolution, Impreza WRX/STI, AE86, Silvia, Civic Type R, Land Cruiser).
- Excluded: obscure JDM-only deep cuts, chassis-code memorization, meaningless
  trim/option trivia, volatile market prices.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: define exact model/generation/variant for specifications; do not mix
  specs across generations; normalize hp/PS/kW carefully.

# Japanese Cars Knowledge

## Identity and Vocabulary

Durable sets include Japanese manufacturers, their iconic models and
generations, engine families, drivetrains, and cultural significance.

## Safe Entity Sets

- Manufacturers: Toyota, Nissan, Honda, Mazda, Subaru, Mitsubishi, Lexus.
- Iconic JDM/performance models: Supra, Skyline GT-R/GT-R, RX-7, NSX, Lancer
  Evolution, Impreza WRX/STI, AE86, Silvia, Civic Type R, Celica, 350Z/370Z,
  R34 GT-R, FD RX-7, S2000.
- Mainstream/4x4: Land Cruiser, Hilux, RAV4, CR-V, WRX, Forester, Pajero.
- Engine families: 2JZ, RB26DETT, 13B, B16, EJ20/25, 4G63.
- Drivetrains: AWD (Evo/STI), RWD (Supra/RX-7/Silvia), FWD (Civic Type R).

## Stable Classifications

Model-to-manufacturer, model-to-generation, and model-to-drivetrain
associations are deterministic and safe.

## Ambiguity and Sources

Cross-generation power figures, PS vs hp, and market-variant differences are
high risk — always define exact model/year/variant. Prefer stable identity
facts over volatile specs. Arabic terms must match established usage.