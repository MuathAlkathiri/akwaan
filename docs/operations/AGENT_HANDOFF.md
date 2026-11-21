# Agent handoff

How a task is handed from one coding agent to another on this project without a
person copying reports between windows.

## The idea

One orchestrator — a person, or an agent running in a terminal on the
development machine — owns the plan. Every other agent is called as a tool:
it receives a task file, does the work, and leaves a report file. Nothing is
relayed by hand.

| Role | Who | How it is called |
|---|---|---|
| Plan, write code, split the work | the orchestrator | — |
| Runtime checks, second opinion | Antigravity CLI (`agy`, Gemini models) | `run.sh agy <task.md>` |
| Code review, second implementation | Codex CLI | `run.sh codex <task.md>` |
| Image generation | Codex CLI (`$imagegen`, on the ChatGPT plan) | `run.sh image <name> <prompt.txt>` |

The orchestrator must run **on the development machine**, because that is where
the `agy` and `codex` CLIs and their logins live.

Gemini is reached through `agy`. Google stopped serving personal accounts on
the older `gemini` CLI on 2026-06-18; `run.sh gemini` remains only as an alias.

## Commands

```bash
ai/scripts/agents/run.sh doctor            # are the CLIs installed and logged in?
ai/scripts/agents/run.sh doctor --smoke    # also send each one a one-line prompt
ai/scripts/agents/run.sh new <slug>        # new task file from the template
ai/scripts/agents/run.sh agy    <task.md> [--read|--write|--full]
ai/scripts/agents/run.sh codex  <task.md> [--read|--write|--full]
ai/scripts/agents/run.sh image  <name> <prompt.txt> [--ref <image>]...
ai/scripts/agents/run.sh place  <image> <asset_name>
```

Modes: `--read` (default) lets the agent read and answer. `--write` lets it
edit files in the repo. `--full` removes approvals and the sandbox; it is
needed when a task must run shell commands or reach the network (a runtime
check, for example) and is chosen per task, never by default.

A headless agent cannot stop to ask. With `agy`, a tool that needs approval it
cannot get is refused, the run still exits `0`, and the refusal is only named on
stderr. `run.sh` prints a note when the log mentions a refused tool.

The command exits `0` only when the agent exited cleanly **and** its report
says `STATUS: DONE`. Anything else — `BLOCKED`, `FAILED`, no status line, no
report — exits non-zero.

## Where things live

`ai/workbench/artifacts/handoff/` (git-ignored scratch, see `AGENTS.md` §5):

- `tasks/` — task files
- `reports/` — one report per dispatch, never overwritten
- `images/` — generated images, as PNG
- `logs/` — the CLI's own stderr for each dispatch
- `log.tsv` — one line per dispatch: time, agent, mode, task, exit code, status, report path

## The report contract

Every dispatched prompt ends with the same contract (it is in `run.sh`, so a
headless agent with no memory still receives it): no commit, push, deploy or
production write; no runtime data mutation unless the task says so; and a final
message in a fixed shape — `STATUS`, `SUMMARY`, `DID`, `EVIDENCE`,
`FILES CHANGED`, `OPEN QUESTIONS`.

A report is a claim, not proof. Before building on it, the orchestrator checks
the evidence lines — re-running the command where that is cheap.

## Images and the media path

`run.sh image` only produces a PNG in `handoff/images/`. Nothing reaches the
game until a person has approved the image. After that:

```bash
# 1. convert to WebP and put it in the canonical media location
ai/scripts/agents/run.sh place <image-name> <asset_name>
#    -> backend/uploads/question-assets/images/<asset_name>.webp, prints the URL

# 2. reference the printed URL in the pack's media.assets, then validate
deployment/scripts/copy-media-to-r2.sh --manifest <pack> --dry-run --require-media

# 3. upload, and prove the game can load every file
deployment/scripts/copy-media-to-r2.sh --manifest <pack> --verify-public <api-base-url>

# 4. promote the content
python3 ai/scripts/promote_approved_content.py --milestone <key> ...
```

`place` never overwrites an existing asset name: a file already there may be
referenced by live content. `--require-media` is the Bomb rule — every item
carries an image — and should be passed for any pack that is meant to be
all-image.

To find out whether assets that are missing on this machine are already live:

```bash
deployment/scripts/copy-media-to-r2.sh --manifest <pack> --check-remote <api-base-url>
```

It is read-only and reports, per asset, local presence and what the public
media path serves.
