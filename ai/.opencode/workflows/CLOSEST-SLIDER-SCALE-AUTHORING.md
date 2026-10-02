# Workflow: مين أقرب Slider Scale Authoring

Reusable brief for authoring slider continua onto an existing batch of legacy
Closest ContentItems. One run handles one `*.source.json` batch.

**You are authoring interaction metadata for content that already exists.** You
are not writing questions, and you are not correcting them.

---

## Read first — canonical sources of truth

Read these before authoring anything. Do not rely on this file's summary of them,
and do not rely on your own prior knowledge of Akwaan.

1. `ai/.opencode/skills/challenge-types/closest/SKILL.md` — the Closest authoring contract
2. `.agents/skills/akwaan-content/SKILL.md` — the master content authoring workflow
3. `.agents/skills/akwaan-content-qa/SKILL.md` — the QA contract, including the مين أقرب slider gate
4. `ai/.opencode/validators/CLOSEST.md` — what is machine-checked and what is not
5. The World and Scope knowledge for the batch's World under `ai/.opencode/skills/worlds/<world>/`

---

## Inputs

- `ai/scripts/data/closest-slider-scale-batch-<NN>.source.json`

Each item carries `contentItemId`, `prompt`, `correctValue`, `acceptedTolerance`,
`scope`, a `provisionalDomain` and a `domainConfidence`.

The batch also carries `provisionalDomainGroups`: items the audit believes share
a reasoning space. **Treat these as a starting hypothesis, not an instruction.**
Merge, split or reject a group when the content says otherwise, and say why.

---

## Preserve exactly — never edit

- `contentItemId`
- `prompt`
- `correctValue`
- `acceptedTolerance`

If you believe a prompt is wrong or an answer is wrong, **do not fix it**. Flag it
(see *Content defects*) and move on. Changing a fact is a content decision and is
not yours to make in this workflow.

---

## The authoring rule

**Bounds are domain-first. The range comes from the question's natural
quantitative or historical domain — never from `correctValue`.**

### Step 1 — group before you author
Read the whole batch first. Identify which questions occupy the same reasoning
space. Prefer **one shared continuum** wherever that is honest: a range that has
to serve several questions cannot be bent around any one answer, which is the
single strongest protection against target shaping.

### Step 2 — Pass A, author the continuum with the answer hidden
For each group or item decide `min`, `max`, `step`, optional `unit`, optional
`displayFormat` — **without using `correctValue`**. Ask only: what is the
plausible span for this kind of question?

### Step 3 — Pass B, validate the target
**Only now** look at `correctValue` and check:
- it lies inside `[min, max]`
- it is exactly reachable: `(correctValue - min)` is a whole multiple of `step`

If an honestly authored range excludes the target, **do not stretch an endpoint to
admit it.** Emit the item with `"needsHumanAuthoring": true` and an explanation.

### Step 4 — midpoint signal
After the continuum exists, classify each item `exact-midpoint`, `near-midpoint`
or `clear`. This is a **signal only** — never re-author a range to avoid it, and
never drop an item for it.

---

## Forbidden

- `target ± N`, or any answer-centred range
- moving an endpoint after seeing the answer
- a bespoke range per item where a shared continuum applies
- a fake universal `0–100`
- deriving bounds from `acceptedTolerance`
- **altering `correctValue`**
- choosing bounds only to avoid midpoint proximity

---

## Modes

`numeric-range` is the default. Use `between-anchors` **only** when the question
genuinely lives on a semantic continuum whose two endpoints themselves define the
reasoning space, and never for visual variety, to disguise an ordinary numeric
question, to expose a meaningless normalized scale, or where the labels leak the
answer.

## Display

Ordinary numbers take locale formatting, grouping allowed, optional `unit`.

A calendar year takes `"displayFormat": "calendar-year"`, carries **no** `unit`
and **no** thousands separator. It is authored explicitly and **never** inferred
from magnitude — a four-digit number is not a year because it is large.

Use no other display format. If a recurring semantic cannot be expressed with
what exists, report it as a product requirement instead of inventing one.

---

## Content defects — flag, never fix

Add `holdForContentReview` with one or more of: `factual-answer-concern`,
`time-relative-wording`, `wrong-scope`, `ambiguous-prompt`, `malformed-numeric-meaning`,
`answer-leakage`, `duplicate-content`, `unclear-domain`,
`correct-value-inconsistent-with-prompt`.

A held item is passed through **unauthored** — no `closestSlider`. Items arriving
already held stay held.

---

## Boundaries

- **Never** write to any database.
- **Never** modify Git, and never commit or push.
- **Never** touch Production.
- Output **one artifact file** and nothing else.

---

## Output

`ai/scripts/data/closest-slider-scale-batch-<NN>.authored.json`

```json
{
  "artifactType": "closest-slider-scale-authored",
  "version": 1,
  "sourceArtifact": "closest-slider-scale-batch-<NN>.source.json",
  "doNotApply": true,
  "authoredDomainGroups": [
    { "domainGroup": "...", "itemIds": ["..."], "continuum": { "min": 0, "max": 0, "step": 0 }, "justification": "why this span, argued without reference to any answer" }
  ],
  "items": [
    {
      "contentItemId": "...",
      "prompt": "... unchanged ...",
      "correctValue": 0,
      "acceptedTolerance": 0,
      "closestSlider": { "mode": "numeric-range", "min": 0, "max": 0, "step": 0 },
      "domain": "...",
      "domainJustification": "...",
      "midpointSignal": "clear",
      "needsHumanAuthoring": false,
      "holdForContentReview": []
    }
  ]
}
```

Then run, and include the output in your report:

```
python3 ai/.opencode/validators/validate_closest.py \
  ai/scripts/data/closest-slider-scale-batch-<NN>.authored.json \
  ai/scripts/data/closest-slider-scale-batch-<NN>.source.json
```

---

## The question your work is judged on

For every range you author:

> **"Could these exact endpoints be justified if `correctValue` were hidden?"**

If the honest answer is no, the item fails authoring QA no matter how reasonable
the numbers look. Write each `domainJustification` so that a reviewer who cannot
see the answer can still tell whether the span is right.
