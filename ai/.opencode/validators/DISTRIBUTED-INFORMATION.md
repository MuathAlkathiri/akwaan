# Distributed Information Validator

Run `python3 .opencode/validators/validate_distributed_information.py <paths>`.
A valid draft passes; ready status is blocked while the product runtime contract
is `authoring_only`.

The validator enforces canonical routing, native object payloads, supported inner
modes, the shared-puzzle structure, exact team sizes, the safety confirmation,
deterministic truth, privacy leakage checks, no truth in mechanic data, and no
notes-based payload workaround. The optional `mechanicPayload.puzzleFamily` tag
must be a nonempty string when present.

## Shared-Puzzle Contract

- Canonical routing: `distributed-information` type, `shared-fragments` pattern,
  `distributed` wrapper mode.
- Structure: a nonempty Arabic instruction; exactly two fragments with IDs `A`
  and `B`, distinct nonempty content, and optional fragment media; team sizes
  exactly `[2,3]`.
- Distribution is runtime-owned: two participants hold one fragment each with the
  instruction randomly attached to one holder; three participants hold the two
  fragments plus an instruction-only third. Authors never encode participant
  identities, schedules, or a third content fragment.
- Answer: `match`, `closest`, or `multiple_choice` machine truth in
  `answerPayload`; multiple accepted solutions require every accepted value to be
  recorded explicitly.
- Optional family tag: `mechanicPayload.puzzleFamily` names the solving
  operation with a canonical family name (for example, `letter-set`); it must be
  a nonempty string when present and never changes the shared-puzzle structure.
- Safety confirmation (required for any future ready status):
  `راجعت اللغز، ولا يستطيع أي لاعب حله بمفرده من المعلومة التي لديه، والجمع اللفظي ضروري للوصول إلى الحل.`
- Runtime blocker: the product backend still expects the retired
  `three-segment-race` payload (`candidateSets`, A/B/C segments,
  `twoPlayerMergeOptions`). Until migration, `metadata.runtimeContractStatus`
  must be `authoring_only` with a nonempty `runtimeBlocker`, and any item whose
  `status` is `ready` fails with `runtime_blocked`.

## Anti-patterns (auto-rejected)

- A fragment contains the full answer, the full puzzle is duplicated on one
  participant's device, a fake third fragment is authored for a three-player
  team, trivia is presented as a distributed puzzle, answer choices replace the
  puzzle, the item needs the host screen, the instruction is missing or unclear,
  the answer is ambiguous without an explicit accepted-solution policy, solving
  needs information absent from the instruction and fragments, truth or
  runtime-owned fields appear in mechanic data, or visibility leaks.
