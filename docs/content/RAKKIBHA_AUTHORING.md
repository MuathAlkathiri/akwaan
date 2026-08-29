# ركّبها authoring

Rakkibha uses private information and spoken comparison. Its implemented
candidate-selection runtime is a delivery format, not its only interaction.
Never count different visual themes as different mechanics.

Declare authoring metadata under `authoring.rakkibha`:

```json
{
  "interactionPattern": "ROUTE_NAVIGATION",
  "runtimeCompatibility": "CURRENT_RUNTIME_COMPATIBLE",
  "scopeSlug": "logic-deduction",
  "expectedConversation": "بعد البداية عندي حاجز يمين... مساري ينعطف يمين، إذن نستبعده..."
}
```

Current-runtime patterns are `ROUTE_NAVIGATION`, `SYMBOL_CODE_RECONSTRUCTION`,
`CONSTRAINT_SATISFACTION`, `DEFUSE_LOGIC`, and `MISSING_PIECE`. The final two
patterns in the library — `DISTRIBUTED_ARABIC_NAME_BANK` and
`ODD_SCENE_MATCHING_PAIR` — require a runtime extension. They must be marked
authoring-only with a blocker and are never production-ready claims.

## Guardrails

- `SYMBOL_CODE_RECONSTRUCTION` needs a real decoding, transformation, derivation, mapping, sequencing, or reconstruction. Include a `symbolReconstruction` proof with input, rule, operation, and derived candidate. Direct visual copying of a final sequence is rejected.
- `DEFUSE_LOGIC` has one shared device and one actionable state. Include a `defuseLogic` proof whose private contributions all reference the same device; independent device or panel states are rejected.
- `interactionPattern` is how the team plays; `scopeSlug` is the Puzzles content domain. Choose only an existing canonical Puzzles scope. Never invent `device-logic`, `logic-mazes`, `logic-grids`, or another pattern-shaped scope; if no scope fits, flag `SCOPE_COVERAGE_BLOCKER`.

For batches of 10+, plan patterns before items: at least five patterns, no more
than two per pattern without an explicit exception, and Missing Piece ≤20%.
Every item includes a simulated conversation demonstrating real comparison and
deduction.

Validate source drafts with:

```bash
python3 ai/.opencode/validators/validate_rakkibha.py path/to/item-or-batch.json
python3 ai/.opencode/validators/test_rakkibha_patterns.py
```
