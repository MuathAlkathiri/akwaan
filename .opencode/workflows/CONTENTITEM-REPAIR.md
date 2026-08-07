# ContentItem Repair Workflow

1. Receive stable item ID, failed contract, evidence, and requested action.
2. Assign repair to the Role owning the failed field.
3. Preserve the ID when the interaction identity remains; otherwise supersede
   it explicitly with a new ID.
4. Re-run every downstream validation affected by the change.
5. Preserve prior decisions and asset rejections in handoff history.
6. Return to human approval only after QA is rerun.

`runtime_contract_missing` is not repairable through prompt or payload editing.
Return it to product/runtime ownership for timer, timeout, roster, tie
projection, and scoring decisions; then update schema and validators before
rerunning authoring review.
