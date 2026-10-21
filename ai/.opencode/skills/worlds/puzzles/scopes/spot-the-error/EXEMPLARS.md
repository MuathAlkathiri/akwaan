# Exemplars: puzzles / spot-the-error

Worked items for this Scope, retained as historical/reference examples. The
current Canonical Family Library V1 is authored exclusively for **Moving XO**;
the original **اقرأ خصمك (Read Your Opponent)** provenance below is historical
and is not an active generation target.

## ⚠️ Reconciliation against Canonical Family Library V1 (2026-10-21)

Reconciled against the approved 12 families. All four cite families V1 contains:

| # | Subject | Family under V1 | State |
| --- | --- | --- | --- |
| 1 | An intruder in a numeric set | `intruder-element` | ✅ **APPROVED** |
| 2 | An intruder by the shape of the writing | `intruder-element` | ⚠️ **APPROVED WITH ROUTING NOTE** |
| 3 | One wrong step in a sequence | `invalid-transformation-step` | ✅ **APPROVED** |
| 4 | A breach of an ordering | `order-violation` | ✅ **APPROVED** |

**The routing note on 2.** The V1 Revised swap of 2026-10-21 created
`wordplay-letters/dotless-disambiguation` (قراءة الكلام بدون نقاط), so Arabic
letter-dot material now has an owner elsewhere. The two Scopes are separated by
the **solve**, not the material:

- **اكتشف الخطأ** when the player must *infer a rule and locate the one element
  that breaks it* — as here: every word is written with undotted letters, and
  نهر is the breach. The dots are the rule's subject, not the puzzle's point.
- **wordplay-letters** when the player must *read undotted text correctly*
  (`dotless-disambiguation`) or *track a dot moving between letters*
  (`dot-shift`). There is no rule to infer and no breach to find.

Reuse this item's **property** — a rule that lives in the writing rather than the
meaning — but check the two-step solve survives. An item where the player simply
reads an undotted word belongs in `wordplay-letters`.

---

## ⚠️ Every item below is a retired subject

They exist to show **which property makes an item work**. They are not
templates, and they are not a menu to choose from — every one has already been
authored and is unavailable. Do not reuse a subject, its wording or its options,
and do not reproduce one with a value changed. Read each for its *property*,
named in bold beneath it, then author something new that has that property.

---

## The two-step solve this Scope requires

Every item here is solved in two steps, never one:

1. **Infer the rule** from the material itself. The rule is never stated.
2. **Locate the single element that breaks it.**

That second word matters: **exactly one** element may break the rule. If a
second element is arguably also a breach, the item is invalid — a table that
picks the other one is not wrong, and the round cannot be graded.

`PUZZLES_WORLD_NO_TRIVIA` and `PUZZLE_ITSELF_IS_THE_CHALLENGE` apply in full. An
"error" that is only an error if you already knew a fact belongs in a knowledge
World, not here. Everything the player needs must be on the screen.

### What RYO adds on top

The opposing team bets Steal or Trust on whether the answering team will solve
it, blind, in the same window. So the puzzle must be **hard enough to be in
doubt and easy enough to be fair** — roughly `likely` or `even` on the
confidence bands. A puzzle everyone cracks instantly, and one nobody cracks,
both collapse the bet.

---

## Worked examples — every one is a RETIRED subject

Each heading names the **property** the item demonstrates. That property is what
you reuse. The puzzle, its answer and its options are spent.

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-01-numeric-intruder","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->
### 1. An intruder in a numeric set

**RETIRED — do not reuse this subject.** Reusable property: *a shared arithmetic
property that is invisible until you look for it.*

> «ما العنصر الدخيل؟»
> ٢٧ · ٤٨ · ٥٢ · ٨١

- Correct: **٥٢**
- Inferred rule: every number divides by ٣. 52 does not.
- `estimatedConfidence`: **even** — the rule is not announced, and divisibility
  by three is a check most tables can run but many will not think to try.
- Why the others tempt: ٤٨ is the only even multiple and looks like the odd one
  out at a glance; ٨١ is the largest; ٢٧ is the smallest.
- **The property:** one property binds three members and excludes the fourth,
  and no competing rule separates them differently. Verify that before
  authoring — a set where two readings are possible is invalid.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-02-dotless-intruder","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE","routingNote":"Use here only when the solve is to infer a rule and locate one breach; read-only dotless disambiguation belongs to wordplay-letters."} -->
### 2. An intruder by the shape of the writing — `intruder-element` ⚠️ see routing note

**RETIRED — do not reuse this subject.** Reusable property: *a rule about the
script itself, visible on the screen, requiring no knowledge whatsoever.*

> «ما العنصر الدخيل؟»
> مال · سهل · راحل · نهر

- Correct: **نهر**
- Inferred rule: every word is written with undotted letters only. نهر carries
  the dot on ن.
- `estimatedConfidence`: **even** — invisible until someone thinks to look at
  the letters rather than the meanings, then obvious.
- Why the others tempt: راحل is the longest and the only four-letter word; مال
  and سهل are the most ordinary and so feel like filler.
- **The property:** the rule lives in the writing, not the meaning. This is the
  purest form of `PUZZLE_ITSELF_IS_THE_CHALLENGE` — nothing outside the screen
  helps, and no vocabulary advantage exists.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-03-invalid-transformation-step","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->
### 3. One wrong step in a sequence

**RETIRED — do not reuse this subject.** Reusable property: *a generative rule
where exactly one term can be corrected to restore it.*

> «رقم واحد في هذه المتتالية خاطئ. أيّه؟»
> ٣ · ٦ · ١٢ · ٣٦ · ٤٨ · ٩٦

- Correct: **٣٦**
- Inferred rule: each term is double the one before. The fourth should be ٢٤.
- `estimatedConfidence`: **likely** — doubling is quickly spotted; the work is
  locating which term broke it rather than discovering the rule.
- Why the others tempt: ٤٨ looks wrong because it does not double ٣٦; a table
  that checks only the pair after the breach blames the wrong term.
- **The property:** changing exactly one term restores the rule, and no other
  single change does. That last clause is the whole test — check it before
  authoring, because a sequence with two valid repairs has two correct answers.
<!-- /AKWAAN_EXEMPLAR_META -->

<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-04-order-violation","status":"APPROVED","reusePolicy":"DO_NOT_REGENERATE"} -->
### 4. A breach of an ordering

**RETIRED — do not reuse this subject.** Reusable property: *an ordering every
player already shares, with exactly one member out of place.*

> «رُتِّبت هذه الحروف حسب موضعها في الأبجدية، إلا حرفًا واحدًا. أيّه؟»
> ا · ت · ح · ب · د

- Correct: **ب**
- Inferred rule: alphabetical order. ب belongs between ا and ت, not after ح.
- `estimatedConfidence`: **likely** — the order is common property, so the
  puzzle is fair; the work is scanning rather than knowing.
- Why the others tempt: ح sits where the jump is largest; د ends the list and
  draws the eye.
- **The property:** the ordering is universally shared structure, not a fact
  some players happen to know. Removing the one misplaced member leaves a
  correctly ordered list, and removing any other does not.
<!-- /AKWAAN_EXEMPLAR_META -->

---

## Rejected exemplars

| Puzzle (abridged) | Why it fails |
|---|---|
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-rejected-geography-intruder","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «ما العنصر الدخيل؟ برشلونة · ريال مدريد · مانشستر · ميلان» — the intruder is the one not in Spain | A fact check wearing a puzzle costume. Violates `PUZZLES_WORLD_NO_TRIVIA`: you solve it by knowing geography, not by inferring a rule from the material. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-rejected-ambiguous-sequence","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «٢ · ٤ · ٦ · ٩ · ١٠ · ١٢» — "find the error" | ٩ breaks "even", but so does the reading "ascending by two", under which ١٠ is also wrong. Two defensible breaches, so two defensible answers. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-rejected-obvious-intruder","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «ما العنصر الدخيل؟ أحمر · أزرق · أخضر · دائرة» | The rule is visible at a glance and nobody misses it. Certainty near 100%: the opponent always steals and the bet is free. <!-- /AKWAAN_EXEMPLAR_META --> |
| <!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"spot-the-error-rejected-announced-arithmetic","status":"REJECTED","reusePolicy":"DO_NOT_REGENERATE"} --> «أي معادلة خاطئة؟» with four long arithmetic expressions | The rule is announced, not inferred, and the solve is computation rather than insight. The Scope excludes anything needing paper. <!-- /AKWAAN_EXEMPLAR_META --> |

The thread: each either removes the two-step solve, or leaves more than one
defensible answer, or removes the opponent's decision.
