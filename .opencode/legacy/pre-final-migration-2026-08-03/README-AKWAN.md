# Akwaan OpenCode Configuration

Install the `.opencode` directory at the project root.

Primary entry point for every task:

```text
.opencode/README.md
```

The content-generation orchestrator is used only inside the assigned
ContentItem Writer stage; it does not bypass Roles, manifests, handoffs, QA, or
human approval.

Canonical content philosophy:

```text
.opencode/knowledge/AKWAN-CONTENT-BIBLE.md
```

This version targets the new Akwaan architecture:

```text
World → Scope → ChallengeType → ContentItem
```

The current cache and health JSON files are legacy derived data. Regenerate them
before relying on coverage metrics.
