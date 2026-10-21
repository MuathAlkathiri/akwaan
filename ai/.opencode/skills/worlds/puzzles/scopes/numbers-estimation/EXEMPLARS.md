# Exemplars: puzzles / numbers-estimation

Worked items for this Scope. The Scope and World profiles say what is forbidden;
this file preserves historical/reference examples showing what was *wanted*,
because a prohibition without an example is advice a generator can satisfy while
missing the point entirely. The current Canonical Family Library V1 is authored
exclusively for **Moving XO**; the legacy Closest/slider framing below is
historical provenance, not an active generation contract.

## ⚠️ Reconciliation against Canonical Family Library V1 (2026-10-21)

These exemplars were authored **before** the Canonical Family Library V1, against
the earlier family vocabulary. Reconciled against the approved 12 families:

| # | Subject | Family under V1 | State |
| --- | --- | --- | --- |
| 1 | Counting under a structure | — | ⬜ **WITHHELD** |
| 2 | Repeated doubling | — | ⬜ **WITHHELD** |
| 3 | Elimination logic | — | ⬜ **WITHHELD** |
| 4 | Estimating from supplied measurements | — | ⬜ **WITHHELD** |
| 5 | A sequence with one defensible continuation | `missing-number-pattern` | ✅ **APPROVED** |

**Why four are withheld.** Each named a family V1 does not contain
(`quantity-intuition`, `numeric-pattern`), and none maps onto an approved family
without stretching it: `structured-subitizing-count` and `visual-quantity-estimate`
are **visual** reads of a rendered matrix or scatter, while 1 and 3 are
text-described arithmetic; `missing-number-pattern` wants a **missing term**,
which 2 does not ask for; `geometric-area-estimate` and `proportion-estimate` are
*ratio* estimates of a shaded region or a filled container, while 4 computes an
exact tile count — and under the revised boundary, which excludes multi-digit
school arithmetic, 4 reads as a worksheet calculation.

**No family was invented and no example was rewritten or deleted.** A withheld
exemplar is not approved generation guidance; it stays recorded so a human can
map or retire it. Mapping them is an open product decision, handled the same way
as `PILOT-01-WRD-06`.

---

## ⚠️ Every item below is a retired subject

These exist to show **which property makes an item work**. They are not
templates. Do not reuse a subject, its wording, its numbers or its slider, and do
not reproduce one with a value changed — a stack of cups becomes a stack of
boxes, a six-fold page becomes a ten-fold page. Both are rejected on
Distinctness, and both have actually happened in review.

Read each one for its *property*, named in bold beneath it, then author
something new that has that property.

---

## Why this Scope takes only one of Closest's two directions

The Closest mechanic supports two kinds of question: **knowledge-anchored**
estimation, where the answer is a real quantity a player may know and others
estimate from familiarity; and **reasoning-derived** estimation, where the prompt
supplies what is needed.

Both are legitimate Closest content — in most Worlds. **Puzzles permits only
the second.** `PUZZLES_WORLD_NO_TRIVIA` and `PUZZLE_ITSELF_IS_THE_CHALLENGE`
(roadmap §23.11) make recall-dependent solving invalid in every Puzzles Scope,
and a slider does not exempt it.

This is a World boundary, not a judgement about question quality. A question
asking how many goals were scored across a named World Cup is strong Closest
content — in `football`, not here. If a concept needs the player to *know*
something, it is good work in the wrong World.

So the test for **this Scope** is:

> Could a thoughtful player who has never encountered this item get **close**
> using only what the prompt supplies?

---

## Historical worked examples (legacy Closest format; not active generation guidance)

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-01-counting-structure","status":"WITHHELD","reusePolicy":"DO_NOT_REGENERATE"} -->
### 1. Counting under a structure — ⬜ WITHHELD (no V1 family; was `quantity-intuition`)

**The property:** a structure whose total is computable exactly *and* approximable roughly, so knowing and reasoning both pay.

> «أكواب مرتّبة على شكل هرم: الصف السفلي فيه ١٢ كوبًا، وكل صف فوقه أقل بكوب
> واحد، حتى يصل إلى كوب واحد في القمة. كم كوبًا في الهرم كله؟»

- `correctValue`: **78**
- Domain: totals of a triangular stack, up to roughly 150
- `min` 0 · `max` 150 · `step` 2 · unit `كوب`
- Grid: (78 − 0) / 2 = 39 ✔
- Player strategy: a rough rectangle — twelve rows averaging about six — lands
  near 72 in seconds. The exact solver gets 78. Both are rewarded; that gap is
  the mechanic working.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-02-repeated-doubling","status":"WITHHELD","reusePolicy":"DO_NOT_REGENERATE"} -->
### 2. Repeated doubling — ⬜ WITHHELD (no V1 family; was `numeric-pattern`)

**The property:** a growth rule most people underestimate, which makes the spread of team answers wide and the reveal satisfying.

> «ورقة رُقيقة طُويت إلى نصفين ست مرات متتالية. كم طبقة ورق تكون قد تكوّنت؟»

- `correctValue`: **64**
- Domain: layer counts produced by repeated halving, 1–128
- `min` 1 · `max` 128 · `step` 1 · unit `طبقة`
- Grid: (64 − 1) / 1 = 63 ✔
- Player strategy: recognising the doubling. A player who counts 2, 4, 8 and
  loses track still lands in the right neighbourhood; a player who thinks
  "six folds, so about twelve layers" is wrong in an instructive way.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-03-elimination-logic","status":"WITHHELD","reusePolicy":"DO_NOT_REGENERATE"} -->
### 3. Elimination logic — ⬜ WITHHELD (no V1 family; was `quantity-intuition`)

**The property:** one insight collapses the whole problem, and the long route arrives at the same place.

> «مسابقة خروج المغلوب يشارك فيها ٦٤ متسابقًا. كم مواجهة تُلعب حتى يُحسم الفائز؟»

- `correctValue`: **63**
- Domain: match counts in a single-elimination bracket, 0–100
- `min` 0 · `max` 100 · `step` 1 · unit `مواجهة`
- Grid: (63 − 0) / 1 = 63 ✔
- Player strategy: every match eliminates exactly one competitor, so 63 must go.
  The player who adds 32 + 16 + 8 + 4 + 2 + 1 arrives the long way at the same
  place. This is the «آه، شفتها» the Scope asks for.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-04-supplied-measurements","status":"WITHHELD","reusePolicy":"DO_NOT_REGENERATE"} -->
### 4. Estimating from supplied measurements — ⬜ WITHHELD (V1 `proportion-estimate` is a ratio estimate, not an exact count)

**The property:** every quantity the player needs is in the prompt, so nothing depends on what they happen to know.

> «غرفة طولها ٦ أمتار وعرضها ٤ أمتار، وبلاط أرضيتها مربّع طول ضلعه ٤٠ سنتيمترًا.
> كم بلاطة تقريبًا تغطي الأرضية؟»

- `correctValue`: **150**
- Domain: tile counts for ordinary room floors, 0–300
- `min` 0 · `max` 300 · `step` 5 · unit `بلاطة`
- Grid: (150 − 0) / 5 = 30 ✔
- Player strategy: fifteen tiles along the length, ten across the width. Every
  number the player needs is in the prompt — that is what makes it fair.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-05-missing-number-pattern","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->
### 5. A sequence with one defensible continuation — `missing-number-pattern`

**The property:** exactly one rule fits, so the answer is defensible and the near-misses are still meaningful.

> «٢، ٦، ١٢، ٢٠، ٣٠، ... ما العدد التالي؟»

- `correctValue`: **42**
- Domain: continuations of a short growing sequence, 0–100
- `min` 0 · `max` 100 · `step` 1
- Grid: (42 − 0) / 1 = 42 ✔
- Player strategy: the gaps run 4, 6, 8, 10 — so the next gap is 12. One rule,
  one continuation. A sequence admitting two readings is invalid here.
<!-- /AKWAAN_EXEMPLAR_META -->

---

## Rejected exemplars — from the first live pilot, 2026-10-16

These were really generated for this Scope. Each names the rule it broke.

| Prompt (abridged) | Value | Why it fails |
|---|---|---|
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-career-total","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الأهداف التي سجّلها لاعب مشهور في مسيرته حتى الآن؟» | 895 | Recall, and a figure that changes week to week. Violates `PUZZLES_WORLD_NO_TRIVIA`; no durable answer. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-world-cup-hosts","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الدول التي استضافت كأس العالم؟» | 8 | Recall — and factually wrong. A player cannot reason toward it from the prompt. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-club-titles","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الألقاب التي فاز بها نادٍ معيّن؟» | 15 | Pure recall. Either you know it or the slider is a lottery. No estimation gradient. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-rgb-colors","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الألوان الأساسية في نموذج RGB؟» | 3 | The acronym spells the answer, and a 2–5 range is four positions — a multiple-choice question wearing a slider. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-leap-year","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم عدد الأيام في السنة الكبيسة؟» | 366 | Definition recall. Nothing to estimate. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-moon-count","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم متوسط عدد أقمار الكواكب في المجموعة الشمسية؟» | 25 | Wrong, and the true figure moves with every new discovery. Unstable answers cannot be graded. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"numbers-estimation-rejected-city-average","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «كم متوسط عدد سكان المدن الكبرى؟» | 10,500,000 | The comparison set is never defined — city proper or metropolitan area, and which cities? Unanswerable as posed. <!-- /AKWAAN_EXEMPLAR_META --> |

The common thread: each asks *what do you know*, and this Scope asks *what does
your sense of quantity say*.

Note what this table does **not** say. It does not say these questions are bad —
several would be perfectly good Closest items in `football`, `world` or
`general-knowledge`. The World Cup hosts item fails on its facts, and the RGB and
leap-year items fail the rubric in any World. But the club-titles item is simply
**in the wrong World**: authoring it here was a World error, not a mechanic one.

---

## Slider authoring in this Scope

The domain-first rule from the Closest Skill applies unchanged: decide the span
from the kind of quantity, before looking at the answer. Two Scope-specific
notes:

- **A puzzle has a computable span.** "Cups in a stack of twelve rows" tops out
  near 150 whatever the answer is. Say so, and the range writes itself.
- **Choose the step from the domain, then check the grid.** A step of 5 on a
  0–300 tile count is natural. If the honest answer does not land on the grid,
  change the *step* to one the domain also justifies — never move an endpoint to
  catch the answer, and never round the answer to meet the grid.
