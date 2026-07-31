# Al-Zeer Salem

## Supported Question Types

---

### Character Recognition

Purpose

Identify a character from an image or scene.

Examples

- من هذه الشخصية؟
- من يظهر في هذا المشهد؟

---

### Event Recognition

Purpose

Identify what happened during an important scene.

Examples

- ماذا حدث هنا؟
- ما الحدث الذي وقع في هذا المشهد؟

---

### Motivation

Purpose

Understand why a character made an important decision.

Examples

- لماذا فعل ذلك؟
- ما سبب هذا القرار؟
- لماذا أعلن الحرب؟
- لماذا رفض الصلح؟

Questions must have one clear canonical answer.

---

### Quote Recognition

Purpose

Identify the speaker of a famous quote, speech or poem.

Supported Assets

- Audio
- Video
- Text

Examples

- من القائل؟
- من قال هذه العبارة؟
- من ألقى هذا الخطاب؟

---

#### Poetry Recognition

Purpose

Identify the speaker of a famous poem or poetic verse.

This is a subtype of Quote Recognition.

Examples

- من قائل هذا البيت؟
- من أنشد هذا الشعر؟
- من قال هذه القصيدة؟

The verse must be well known within the series.

Avoid obscure poetry.

---

### Shared-Scene Recall

Purpose

Identify who a character was with during a specific scene.

Examples

- مع من كان؟
- مع من اجتمع؟
- مع من قاتل؟
- مع من تحدث؟

The scene must clearly contain one correct answer. This tests an event or
observation, not the obvious relationship itself.

---

### Location Recognition

Purpose

Identify where an important event happened.

Examples

- أين وقع هذا الحدث؟
- ما اسم هذا المكان؟

---


Purpose

Questions about the events that happened during the Yemen campaign.

Examples

- من دخل قصر التبع؟
- من بقي خارج القصر؟
- كيف دخلوا القصر؟
- من قتل التبع؟
- من أنقذ الزير؟
- من خان العهد؟
- ماذا طلب التبع قبل موته؟

Purpose

Questions about the order of events.

Examples

- ماذا حدث بعد مقتل كليب مباشرة؟
- من خرج أولاً؟
- من وصل قبل الآخر؟
- ماذا فعل الزير بعد سماع الخبر؟

Purpose

Identify every person involved in an event.

Examples

اذكر الأشخاص الذين دخلوا قصر التبع.

من كانوا في مجلس الصلح؟

من حضر المبارزة؟

من خرج للثأر مع الزير؟

من رافق كليب؟

Purpose

Questions about famous battles.

Examples

في أي معركة حصل هذا؟

ما اسم هذه المعركة؟

من انتصر؟

من قاد الجيش؟

ما سبب اندلاعها؟


Purpose

Questions about military plans and strategies.

Examples

كيف دخلوا القصر؟

كيف خدع الزير خصومه؟

كيف هرب الجرو؟

كيف استطاع جساس الوصول إلى كليب؟

Purpose

Identify iconic objects.

Examples

ما اسم هذه الناقة؟

لمن هذا السيف؟

ما هذه الراية؟

ما هذه الرسالة؟

Purpose

Questions answered from a short video clip.

Supported Assets

Video

Examples

ماذا حدث بعد هذه اللقطة؟

من قتل هذا الرجل؟

من دخل بعده؟

ماذا قال قبل موته؟

ما الذي فعله الزير هنا؟

كيف انتهى هذا المشهد؟
## Validation Rules

Reject the question if:

- The wording reveals the answer.
- The event is historically inaccurate.
- The media contains spoilers unrelated to the question.
- Multiple answers could reasonably be correct.
- The scene is too obscure.
- The quote is incomplete or ambiguous.
- The poetry is not clearly attributable to one speaker.
- The question directly asks for an obvious family, friendship, marriage, or
  enemy relationship.
- Attached Media is decorative, missing locally, unreadable, or leaks the
  answer.
- The batch exceeds the 15% Direct Character Identification limit.

## Direct Identification Exclusions

The title character and central figures, including الزير سالم and كليب, must not
be Direct Character Identification answers. Infer other obvious exclusions
cautiously from the central cast used by the source material; do not remove or
overwrite existing facts.

## Preferred Question Patterns

Prioritize Event Recall, Sequence Recognition, What Happens Next, Who Was
Present, Group Recall, Quote Attribution, Plan Recognition, Battle Event,
Motivation, Cause and Effect, Object Recognition, and Location Recognition.
