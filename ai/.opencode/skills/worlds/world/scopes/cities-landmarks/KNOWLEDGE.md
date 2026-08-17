# Scope: Cities & Landmarks

- `scopeId`: `world.cities-landmarks`
- `worldId`: `world`
- Boundary: globally recognizable cities, landmarks, monuments, architecture,
  famous locations, major tourist sites, and iconic structures.
- Included: Eiffel Tower (باريس), Big Ben/Palace of Westminster (لندن),
  Colosseum (روما), Taj Mahal (أغرا), Burj Khalifa (دبي), Statue of Liberty
  (نيويورك), Pyramids of Giza, Machu Picchu, Great Wall, Sydney Opera House,
  Christ the Redeemer, Golden Gate Bridge, Times Square, Petra, Tokyo Skytree,
  London Eye, Sagrada Família, and major world cities.
- Excluded: letting European landmarks dominate; obscure engineering
  specifications.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: maintain geographic diversity across continents; use stable facts.

# Cities & Landmarks Knowledge

## Identity and Vocabulary

Durable sets include iconic landmarks, their cities, construction context, and
recognizable architectural identity.

## Safe Entity Sets

- Landmarks: برج إيفل (باريس), برج بيغ بن/قصر وستمنستر (لندن), الكولوسيوم
  (روما), تاج محل (أغرا), برج خليفة (دبي), تمثال الحرية (نيويورك), أهرامات
  الجيزة (القاهرة), ماتشو بيتشو (بيرو), سور الصين العظيم, دار أوبرا سيدني,
  تمثال المسيح الفادي (ريو), جسر البوابة الذهبية (سان فرانسيسكو), البتراء
  (الأردن), برج طوكيو سكاي تري, عين لندن, كنيسة ساغرادا فاميليا (برشلونة).
- Cities: باريس, لندن, روما, نيويورك, طوكيو, دبي, القاهرة, سيدني, ريو,
  برشلونة, اسطنبول, بكين.

## Stable Classifications

Landmark-to-city, landmark-to-country, and landmark-to-type associations are
deterministic and safe.

## Ambiguity and Sources

Obscure engineering specifications, contested heights, and volatile visitor
numbers are high risk. Prefer stable facts. Maintain geographic diversity.