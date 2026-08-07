# Arabic Phonetic Rules

## Core rule

The spoken Arabic names of the images, read from left to right, must naturally produce the target answer.

Example:

سم + بوسة = سمبوسة

This is valid.

Examples such as the following are invalid:

قفل + بحر ≠ قمر
نحلة + مفتاح ≠ بيت
سياج + قلب ≠ حديقة
نحلة + ساعة ≠ عسل
سرير + قمر ≠ حلم
وردة + ثوب ≠ فستان

## Arabic-only reasoning

All decomposition must be based on Arabic pronunciation.

Never:

- translate an English pun into Arabic,
- use English image names,
- use English letter sounds,
- silently remove important Arabic sounds,
- silently add sounds not represented by an image,
- rearrange the order of the parts.

## Allowed decomposition

The answer may be split into:

- two exact Arabic words,
- three exact Arabic words,
- familiar Arabic phrases,
- very close natural spoken chunks.

A close approximation is allowed only when a native Arabic speaker immediately recognizes it without explanation.

## Normalization

For comparison only:

- remove diacritics,
- normalize أ / إ / آ to ا,
- normalize ى to ي,
- ignore punctuation and spaces,
- allow ة / ه equivalence only when natural pronunciation justifies it,
- do not remove meaningful consonants,
- do not replace unrelated sounds.

## Hard rejection

Reject the candidate answer when:

- no natural Arabic decomposition exists,
- the decomposition needs explanation,
- the concatenation does not sound like the answer,
- multiple sounds are missing,
- extra sounds appear,
- the answer depends on an obscure dialect word,
- the decomposition only makes sense in English.

If rejected, choose a different answer.
Never force the same answer.