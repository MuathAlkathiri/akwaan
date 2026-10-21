---
name: challenge-type-moving-xo
description: Puzzles Signature authoring contract for إكس أو المتحرك — a 3×3 board played through puzzles.
---

# ChallengeType: Moving XO / إكس أو المتحرك

Load this skill before authoring, reviewing, or validating Moving XO content.
Read `ai/.opencode/knowledge/architecture/MOVING-XO.md` first — it is the
canonical definition and this file does not restate it. Then read the Scope
profile you are authoring into: the Puzzle Family tables live there, and they
decide media and answer mode per family.

Moving XO belongs to Puzzles World. The puzzle **is** the challenge. It is not
ركّبها renamed: ركّبها is an independent preserved mechanic with its own runtime,
validators and content, and neither replaces the other.

## Experience Goal

Make solving a puzzle *worth something immediately*. A correct answer earns one
mark on a shared 3×3 board; three in a row wins. The puzzle supplies the
thinking and the board supplies the stakes, so a single good insight visibly
changes who is winning.

## Social Dynamic

Both teams watch one shared screen. One team answers on its phones while the
other watches the board fill and reads the threat. The tension is positional,
not conversational: nobody is hiding information from anyone.

## Player Emotion

"I see it!" followed immediately by "...and that blocks them." Recognition, then
consequence. A puzzle that produces only the first half belongs in another
mechanic.

## Interaction Pattern

The shared screen shows the prompt and the media. The answering phone shows
**answer controls only** — text choice buttons, or one text input. The player is
reading a screen across the room and tapping an answer in their hand. After a
correct answer the same phone places the mark on a cell.

## Thinking Pattern

One insight, not a chain. See the trick, name it, move on. Multi-step derivation,
careful counting of many elements, and anything needing a pen are out of scope
by construction.

## Success Pattern

The player recognises the puzzle's shape within a few seconds, answers, and can
explain why afterwards in one sentence.

## Failure Pattern

A wrong answer and a timeout are identical to the runtime: no mark, turn passes,
no extra penalty. Difficulty is a pacing decision, never a punishment.

## Input Contract

Canonical ID and runtime key are `moving-xo`; the mechanic is a Puzzles
**Signature** with a continuous item structure. There is **no `mechanicPayload`
and no bespoke schema** — do not invent one. A Moving XO ContentItem is an
ordinary item: `prompt`, optional `media`, a `scopeId` on one of the six forward
Puzzles Scopes, and a generic `answerPayload` in one of exactly two modes:

| Mode | Carries | Use when |
| --- | --- | --- |
| `multiple_choice` | `options` + `correctOptionId` | the default — always prefer it |
| `match` | `acceptedAnswers` | a short single Arabic word, unambiguous |

Nothing else. `closest` is an estimate, not a binary verdict, and the board needs
a verdict. Answer truth never leaves the server.

Each turn allows **15 seconds** to answer (`MOVING_XO_QUESTION_SECONDS`), plus 10
to place the mark. Fifteen seconds includes looking up at the shared screen and
reading it. A puzzle that is fair in thirty seconds is wrong here.

## Resolution Contract

`multiple_choice` resolves against `correctOptionId`. `match` resolves through
the shared Arabic normalization utility — the same one every mechanic uses. A
correct answer earns one board move; anything else earns none. Board state, FIFO
mark replacement, turn order and win detection are runtime-owned.

## Content Structure

One ContentItem is one puzzle: a public prompt shown on the shared screen,
optional media shown there too, and truth only in `answerPayload`. Authoring
metadata (sources, notes, tags) stays in `metadata`.

Every item belongs to one of the six forward Puzzles Scopes and, within it, to
one **Puzzle Family** named in that Scope's `SCOPE.md`. Those six Scope tables
are the sole authority for the approved 78-family library; this Skill
intentionally does not duplicate the family list. Resolve the assigned Scope
through the canonical authoring manifest and use only the family IDs and
supported answer modes declared by that Scope profile.

The forward Scope profiles are:

- `observation-illusions`
- `wordplay-letters`
- `numbers-estimation`
- `assembly-rotation`
- `paths-motion`
- `spot-the-error`

The family is **authoring guidance, not a database field**. It is carried in the
authored pack and checked by the validator; it is deliberately not persisted, so
do not add a field for it.

The nine legacy Puzzles Scopes (`general-knowledge`, `letters-words`,
`numbers-arithmetic`, `logic-deduction`, `shapes-patterns`, `symbols-codes`,
`patterns-sequences`, `lateral-thinking`, `visual-puzzles`) are retired. An item
on one of them cannot be Moving XO content.

## Allowed Content Patterns

Author to the family, from its Scope profile. In every family the question must
be answerable from what is on the shared screen alone — the puzzle carries its
own information and never assumes outside knowledge.

## Content Safety Rules

No money, body shape or weight, religion, romantic relationships, intelligence
judgements, or awkward family-group topics. No real private individuals. Media
must be rights-clean before it is promoted.

## Media Compatibility

Media belongs to the ContentItem and is shown on the shared screen only.

- `observation-illusions`, `assembly-rotation`, `paths-motion` — the image **is**
  the puzzle. A **resolved asset** is required before READY. A declared
  `media.type: image` with an empty `assets` array is an intention, and a host
  cannot play an intention.
- `wordplay-letters` — text-native.
- `numbers-estimation`, `spot-the-error` — mixed; the family decides. This one is
  review-enforced, because no family identifier is persisted for a machine to
  check.

The runtime applies the same media rule while counting launch inventory and
hydrating reserved items, so an image-less visual puzzle is never presented.
READY remains the proper place to catch it before a host starts a Match.

Authoring and media enrichment stay separate. Draft text-first and let the item
sit in `draft` until its asset lands.

## Scope Compatibility

Puzzles World only, across all six forward Scopes. Moving XO is bound to Puzzles
and is not intended to run in Anime, Football, or Video Games.

## Validation Rules

Authoring-side, before promotion:

```
python3 ai/.opencode/validators/validate_moving_xo.py <pack.json> [--mechanic moving-xo]
```

It checks the Scope, the family, the family's allowed answer modes, its media
policy, option and answer integrity, and the Arabic normalization limits. A
Puzzles pack is not automatically a Moving XO pack — authored packs mix mechanics
in one file — so rows must declare `compatibleChallengeTypeIds`, or the caller
passes `--mechanic moving-xo`. Rows the validator does not check are always
reported as unchecked.

Backend-side, at READY, `ContentItemCompatibilityPolicy` is the gate that
actually holds:

| Blocker | Meaning |
| --- | --- |
| `MOVING_XO_ANSWER_MODE_UNSUPPORTED` | mode is not `multiple_choice` or `match` |
| `MOVING_XO_MATCH_ANSWER_NUMERIC` | a `match` item whose accepted answers contain digits |
| `MOVING_XO_SCOPE_NOT_FORWARD` | the item sits on a retired Puzzles Scope |
| `PUZZLE_SCOPE_REQUIRES_MEDIA` | a definitionally visual Scope with no resolved asset |

A validator can check structure. It cannot prove a puzzle is fair, unambiguous,
or solvable in fifteen seconds. Those stay human review.

## Anti-patterns

- **Trivia in a puzzle costume.** "Which planet is largest?" is recall with a
  board attached. If the answer is known or not known rather than *worked out*,
  it is not a Moving XO puzzle. This is the single most common failure.
- **Numeric `match`.** The shared normalizer folds letters — the alef family,
  ة/ه, ى/ي, diacritics, a leading ال — but **not digits**. `٧` and `7` stay
  different strings, so a player typing the numeral their keyboard offers loses
  the turn on a correct answer. **Numeric answers must use `multiple_choice`.**
  This is an authoring rule, not a normalizer change: the normalizer is shared by
  every mechanic and is not Moving XO's to widen.
- **Redundant aliases.** `['مثلث', 'المثلث']` is one answer written twice; the
  normalizer already folds it and the policy rejects the duplicate.
- **Image answer options.** The phone renders text only. A puzzle whose answers
  are pictures cannot be authored.
- **Fine detail.** Anything needing close inspection is unfair on a shared
  display several metres away.
- **Gestures.** No drag-drop, rotation or drawing surface exists. A puzzle that
  needs one is future design requiring approval, not content.
- **Long `match` answers.** More than one defensible phrasing belongs in
  `multiple_choice`.

## Contract Status

Authoring contract: implemented and enforced — Knowledge, validator, Scope family
tables, and READY blockers.

Runtime and provisioning source are integrated with this authoring contract in
the current integration workspace. That source state alone does not provision
a ChallengeType, bind a board, mutate runtime content, or deploy gameplay.

**The 21 Moving XO items in the local/dev runtime are temporary smoke fixtures.**
They were created by one-off scripts that bypassed this pipeline, sit on retired
Scopes, and read as ordinary trivia. They remain local-only, **must never be
promoted**, and are not examples of this contract.
