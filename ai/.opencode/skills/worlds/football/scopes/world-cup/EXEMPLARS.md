# Exemplars: football / world-cup

Worked Closest items for this Scope. Their job is to show what a
**knowledge-anchored** numerical question looks like when it is good — and what
separates it from the stat-counting this World already rejects.

## ⚠️ Every item below is a retired subject

They exist to show **which property makes an item work**. They are not
templates. Do not reuse a subject, its wording, its numbers or its slider, and
do not reproduce one with a value changed. Read each for its *property*, named
in bold beneath it, then author something new that has that property.

---

## This Scope takes knowledge-anchored Closest

The answer is a real quantity. A team that knows it wins; a team that does not
should still land close by reasoning from what it knows about football. That is
the **anchor**, and it is what separates a good factual question from a lottery
(roadmap §6.7).

This does **not** license ordinary trivia. The World profile rejects *generic
stat counting* and *volatile seasonal stats*, and this Scope excludes live
rankings and disputed unofficial records. A question still has to earn its place
on the rubric in the Closest Skill — especially **Accessibility** (would an
ordinary fan recognise the subject?) and **Stability** (will it still be right
next year?).

The safest material here is a **completed tournament**: its numbers were fixed
the day it ended and can never drift.

---

## Accepted exemplars (Closest, knowledge-anchored)

### 1. A tournament-wide total

> «كم عدد المباريات التي تُلعب في بطولة كأس العالم بنظام ٣٢ منتخبًا؟»

- `correctValue`: **64**
- Domain: match counts of a complete senior tournament, 0–100
- `min` 0 · `max` 100 · `step` 1 · unit `مباراة`
- Grid: (64 − 0) / 1 = 64 ✔

**The property:** the structure of the tournament *is* the anchor. Eight groups
of four play six matches each, which is 48, and the knockout rounds add 16. A
fan who has never looked this up can build it; a fan who knows says 64 at once.

### 2. A record that stopped moving

> «كم هدفًا سجّله أفضل هدّاف في نسخة واحدة من كأس العالم، وهو رقم قياسي لم يُكسر
> منذ عام ١٩٥٨؟»

- `correctValue`: **13**
- Domain: top-scorer tallies within a single tournament, 0–20
- `min` 0 · `max` 20 · `step` 1 · unit `هدف`
- Grid: (13 − 0) / 1 = 13 ✔

**The property:** a record explicitly pinned to a finished edition. The anchor is
ordinary football sense — a side plays six or seven matches, so even a goal a
game is remarkable, and the real figure is higher still. Note how the prompt
states the year: that is what makes the answer permanent.

### 3. A date on a familiar timeline

> «في أي عام أُقيمت أول بطولة لكأس العالم؟»

- `correctValue`: **1930**
- Domain: founding years of major international competitions, 1900–1960
- `min` 1900 · `max` 1960 · `step` 1 · `displayFormat: 'calendar-year'`, no unit
- Grid: (1930 − 1900) / 1 = 30 ✔

**The property:** a year is a continuum every player can reason on. "Before the
second war, after football turned professional" brackets it within a decade
without knowing it. The calendar-year format is **authored**, never inferred —
a four-digit number is not a year because it is large.

---

## Rejected exemplars

| Prompt (abridged) | Why it fails |
|---|---|
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"world-cup-rejected-career-total","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم هدفًا سجّل اللاعب الفلاني في مسيرته حتى الآن؟» | *Generic stat counting* (World anti-pattern) and the answer moves while he plays. Pinning it to a date fixes the drift and leaves it a lookup. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"world-cup-rejected-attendance-lookup","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم بلغ عدد الحضور في مباراة دور المجموعات بين منتخبين في نسخة ١٩٦٢؟» | No anchor whatsoever — a wiki lookup with a slider. Fails **Accessibility**. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"world-cup-rejected-future-total","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم هدفًا سيُسجَّل في البطولة القادمة؟» | Not yet a fact. An answer that does not exist cannot be graded. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"world-cup-rejected-host-count","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الدول التي استضافت البطولة؟» | Answerable, but the set is contested — co-hosts, and editions not yet played. State the exact edition range or choose another quantity. <!-- /AKWAAN_EXEMPLAR_META --> |

The thread: each either has no way in, or has an answer that will not hold
still. Neither is a complaint about the question being factual.
