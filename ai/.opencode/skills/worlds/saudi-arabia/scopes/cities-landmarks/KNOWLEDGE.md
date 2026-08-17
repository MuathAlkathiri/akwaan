# Scope: Cities & Landmarks

- `scopeId`: `saudi-arabia.cities-landmarks`
- `worldId`: `saudi-arabia`
- Boundary: Saudi cities, regions, landmarks, architecture, and recognizable
  locations.
- Included: الرياض, جدة, مكة, المدينة, العلا, أبها, الخبر, الدمام, الطائف,
  major regions, famous landmarks, historic districts, major natural landmarks,
  recognizable architecture, notable local geography.
- Excluded: obscure municipal administration facts, arbitrary statistics,
  volatile tourism numbers.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: prefer recognizable places; avoid obscure municipal trivia. Natural
  Arabic terminology.

# Cities & Landmarks Knowledge

## Identity and Vocabulary

Durable sets include major Saudi cities, regions, iconic landmarks, historic
districts, natural landmarks, and architecture.

## Safe Entity Sets

- Cities: الرياض, جدة, مكة, المدينة المنورة, الدمام, الخبر, الطائف, أبها,
  تبوك, بريدة, جازان.
- Regions: منطقة الرياض, مكة المكرمة, المدينة المنورة, الشرقية, عسير, تبوك,
  الجوف, الحدود الشمالية, جازان, نجران, الباحة, حائل, القصيم.
- Landmarks: برج المملكة, برج الفيصلية, مسجد قبة الصخرة (المسجد الحرام,
  الكعبة), المسجد النبوي, جبل أحد, العلا والمدائن الصخرية/الحجر, جدة
  التاريخية (البلد), نافورة الملك فهد, جبل فيفا, جبل السودة, كهف وشيقع.
- Historic districts: جدة البلد, الدرعية التاريخية, الطائف القديمة.

## Stable Classifications

City-to-landmark, city-to-region, and landmark-to-type associations are
deterministic and safe.

## Ambiguity and Sources

Volatile tourism statistics, population counts, and construction-completion
details are high risk. Prefer stable geographic/cultural facts. Natural Arabic
terminology must match established usage.