# Who Among Us Validation

## Canonical Identifiers

- ChallengeType: `who-among-us`
- Pattern: `team-consensus`
- input mode: `vote`

## Authoring Contract

The prompt is public, roster-aware, safe, and has no objectively correct
teammate. Runtime choices come only from the active eligible roster. Every actor
submits one private participant ID; duplicate selections across actors are
allowed; self-voting is forbidden; no individual vote or partial tally reaches
the shared screen.

Resolution tallies participant IDs, returns every highest-voted participant on
a tie, reveals only the final tally, and authors no Match points. Minimum roster
size is three under the no-self-vote policy. Maximum size is unresolved.

## Runtime Blocker

Timer duration, timeout behavior, maximum roster size, eligibility rules,
multiple-winner projection, and scoring implementation are not proven in the
permitted workspace. Default validation must return
`runtime_contract_missing`. Structural validation may pass only in explicit
authoring-only mode; it never establishes playability.

## Safety and Leakage

Reject appearance or body, health, religion, politics, sexuality, wealth,
income, trauma, crime, private relationships, intelligence, humiliation,
bullying, secrets, harsh incompetence, fixed teammate names, objective results,
submitter mappings, partial totals, current leader, or early winner projection.

Run:

```text
python3 .opencode/validators/validate_who_among_us.py --authoring-only <file>
python3 .opencode/validators/test_who_among_us_fixtures.py
```
