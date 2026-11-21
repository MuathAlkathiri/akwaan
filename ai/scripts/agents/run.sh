#!/usr/bin/env bash
#
# Akwaan agent dispatcher — one entry point for handing a task to another
# coding agent from the terminal and getting a report file back.
#
# Why this exists
# ---------------
# Work was being relayed by hand: one agent finished, its report was copied to a
# second agent to get a prompt, and that prompt was pasted into a third. This
# script removes the relay. Whoever is orchestrating (a person, or an agent in a
# terminal on this machine) writes a task file, runs one command, and reads one
# report file. Every dispatched prompt carries the same report contract, so the
# result is checkable without reading a transcript.
#
#   run.sh doctor [--smoke]            check the CLIs; --smoke sends each a 1-line prompt
#   run.sh new <slug>                  create a task file from the template
#   run.sh agy    <task.md> [mode]     dispatch to Antigravity CLI (Gemini models)
#   run.sh codex  <task.md> [mode]     dispatch to Codex CLI
#   run.sh image  <name> <prompt.txt> [--ref <image>]...
#                                      generate one image through Codex ($imagegen)
#   run.sh place  <image> <asset_name> put an approved image into the media path as
#                                      backend/uploads/question-assets/images/<asset_name>.webp
#
# mode (agy/codex): --read (default) | --write | --full
#   --read   may read the repo and answer; edits and unapproved tools are refused
#   --write  may edit files inside the repo
#   --full   no approval prompts / no sandbox. Needed when the task must run shell
#            commands or reach the network (e.g. a runtime check). Choose it per
#            task, on purpose — it is never the default.
#
# State lives in ai/workbench/artifacts/handoff/ (git-ignored, per AGENTS.md §5):
#   tasks/    task files          reports/  one report per dispatch
#   images/   generated images    log.tsv   one line per dispatch
#
# Gemini is reached through `agy`, the Antigravity CLI. Google stopped serving
# personal accounts on the older `gemini` CLI on 2026-06-18, so it is not used.
# `run.sh gemini ...` is kept as an alias for `run.sh agy ...`.
#
# Written for the bash 3.2 that ships with macOS.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$REPO_ROOT/ai/scripts/agents"
HANDOFF="${AKWAAN_HANDOFF_DIR:-$REPO_ROOT/ai/workbench/artifacts/handoff}"
TEMPLATE="$HERE/task-template.md"

die() { echo "ERROR: $*" >&2; exit 2; }
stamp() { date -u +%Y%m%dT%H%M%SZ; }

ensure_dirs() {
  mkdir -p "$HANDOFF/tasks" "$HANDOFF/reports" "$HANDOFF/images" "$HANDOFF/logs" \
    || die "cannot create $HANDOFF"
}

slug_of() {
  # file name without directory or extension, reduced to [a-z0-9-]
  basename "$1" | sed -e 's/\.[^.]*$//' | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//'
}

# The contract appended to every dispatched task. It is in the prompt, not in a
# file the agent may or may not read, because a headless run starts with no
# memory of earlier sessions.
contract() {
  cat <<'CONTRACT'

---
## How to work and how to report (applies to this task)

Rules:
- Follow AGENTS.md at the repository root. GAME_NEW_SYSTEM_ROADMAP.md is the source of truth; do not edit it unless this task says so.
- Do not commit, push, deploy, or write to any production system. Do not mutate runtime data unless this task explicitly says so.
- Stay inside the task. If something outside it looks wrong, report it; do not fix it.
- Never print, log or write a credential, token or the contents of an .env file.
- If you cannot finish, stop and say exactly what blocked you. Do not guess and do not report something as done that you did not run.

Your final message must be the report, in exactly this shape:

STATUS: DONE | BLOCKED | FAILED
SUMMARY: one or two sentences.
DID:
- what you actually did, one line each
EVIDENCE:
- each command you ran and its real result (exit code, key output line). "Not run" if you did not run it.
FILES CHANGED:
- path — what changed (or "none")
OPEN QUESTIONS:
- anything a human must decide (or "none")
CONTRACT
}

log_line() {
  # ts agent mode slug exit status report
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$@" >> "$HANDOFF/log.tsv"
}

status_of() {
  # first STATUS: line of a report, or UNKNOWN
  s="$(grep -m1 -E '^[[:space:]]*STATUS:' "$1" 2>/dev/null | sed -e 's/^[[:space:]]*STATUS:[[:space:]]*//' | awk '{print $1}')"
  [ -n "$s" ] && echo "$s" || echo "UNKNOWN"
}

# --------------------------------------------------------------------------- #
cmd_new() {
  [ $# -eq 1 ] || die "usage: run.sh new <slug>"
  ensure_dirs
  slug="$(slug_of "$1")"
  [ -n "$slug" ] || die "slug is empty after cleaning"
  out="$HANDOFF/tasks/$(date -u +%Y%m%d)-$slug.md"
  [ -e "$out" ] && die "task already exists: $out"
  cp "$TEMPLATE" "$out" || die "cannot write $out"
  echo "$out"
}

# --------------------------------------------------------------------------- #
cmd_dispatch() {
  agent="$1"; shift
  [ $# -ge 1 ] || die "usage: run.sh $agent <task.md> [--read|--write|--full]"
  task="$1"; shift
  mode="read"
  while [ $# -gt 0 ]; do
    case "$1" in
      --read) mode="read" ;;
      --write) mode="write" ;;
      --full) mode="full" ;;
      *) die "unknown option: $1" ;;
    esac
    shift
  done
  [ -f "$task" ] || die "task file not found: $task"
  [ -s "$task" ] || die "task file is empty: $task"
  command -v "$agent" >/dev/null 2>&1 || die "'$agent' is not on PATH — run: run.sh doctor"
  ensure_dirs

  ts="$(stamp)"; slug="$(slug_of "$task")"
  # Never reuse a report path: a stale report from an earlier dispatch must not
  # be read as the result of this one.
  base="$ts-$agent-$slug"; n=1
  while [ -e "$HANDOFF/reports/$base.md" ]; do n=$((n + 1)); base="$ts-$agent-$slug-$n"; done
  report="$HANDOFF/reports/$base.md"
  logfile="$HANDOFF/logs/$base.log"
  prompt="$(cat "$task"; contract)"

  echo "dispatch : $agent ($mode)"
  echo "task     : $task"
  echo "report   : $report"
  cd "$REPO_ROOT" || die "cannot cd to repo root"

  rc=0
  if [ "$agent" = "agy" ]; then
    # default: tools that need approval are soft-denied (the run still exits 0
    # and names the tool on stderr). auto: workspace edits and safe commands run.
    case "$mode" in
      read)  perm="--mode default" ;;
      write) perm="--mode auto" ;;
      full)  perm="--dangerously-skip-permissions" ;;
    esac
    # shellcheck disable=SC2086  # perm is one or two fixed flags
    agy -p "$prompt" $perm --output-format text \
      --print-timeout "${AKWAAN_AGENT_TIMEOUT:-20m}" \
      > "$report" 2> "$logfile" < /dev/null || rc=$?
  else
    case "$mode" in
      read)  sandbox="read-only" ;;
      write) sandbox="workspace-write" ;;
      full)  sandbox="danger-full-access" ;;
    esac
    # codex prints progress on stderr and the final message on stdout; -o also
    # writes the final message to the report file.
    codex exec --sandbox "$sandbox" -o "$report" "$prompt" \
      > /dev/null 2> "$logfile" < /dev/null || rc=$?
  fi

  if [ ! -s "$report" ]; then
    status="NO_REPORT"
    echo "RESULT   : no report was produced (exit $rc). See $logfile" >&2
    log_line "$ts" "$agent" "$mode" "$slug" "$rc" "$status" "$report"
    exit 1
  fi
  status="$(status_of "$report")"
  log_line "$ts" "$agent" "$mode" "$slug" "$rc" "$status" "$report"
  echo "exit     : $rc"
  echo "STATUS   : $status"
  # A headless run cannot ask for approval; a refused tool is only mentioned on
  # stderr. Surface it, because the report may read as if the step simply ran.
  denied="$(grep -c -i -E 'denied|requires approval|not permitted' "$logfile" 2>/dev/null)"
  if [ "${denied:-0}" -gt 0 ]; then
    echo "note     : $denied line(s) in the log mention a refused tool — see $logfile"
    echo "           (re-run with --write or --full if the task really needs it)"
  fi
  # A report without a STATUS line, or a non-zero exit, is not a success.
  [ "$rc" -eq 0 ] && [ "$status" = "DONE" ] && exit 0
  exit 1
}

# --------------------------------------------------------------------------- #
is_image() {
  # PNG, JPEG or WEBP by magic bytes
  sig="$(head -c 12 "$1" 2>/dev/null | od -An -tx1 | tr -d ' \n')"
  case "$sig" in
    89504e470d0a1a0a*) return 0 ;;
    ffd8ff*) return 0 ;;
    52494646????????57454250) return 0 ;;
  esac
  return 1
}

cmd_image() {
  [ $# -ge 2 ] || die "usage: run.sh image <name> <prompt.txt> [--ref <image>]..."
  name="$(slug_of "$1")"; promptfile="$2"; shift 2
  [ -n "$name" ] || die "image name is empty after cleaning"
  [ -s "$promptfile" ] || die "prompt file missing or empty: $promptfile"
  command -v codex >/dev/null 2>&1 || die "'codex' is not on PATH — run: run.sh doctor"
  ensure_dirs

  refs_n=0
  ref_args=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --ref)
        [ $# -ge 2 ] || die "--ref needs a path"
        [ -f "$2" ] || die "reference image not found: $2"
        # absolute, because the CLI runs from the repo root, not from here
        ref="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
        case "$ref" in *" "*) die "reference path must not contain spaces: $ref" ;; esac
        ref_args="$ref_args --image $ref"; refs_n=$((refs_n + 1)); shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done

  ts="$(stamp)"
  out="$HANDOFF/images/$name.png"
  [ -e "$out" ] && die "refusing to overwrite $out — pick another name or move the old file"
  logfile="$HANDOFF/logs/$ts-image-$name.log"
  marker="$HANDOFF/logs/.$ts-image-$name.marker"
  : > "$marker"

  prompt="\$imagegen $(cat "$promptfile")

Generate exactly one image. When it is generated, copy the final image file to this exact path:
$out
Do not create, edit or delete any other file. Reply with one line: SAVED <absolute path>."

  echo "image    : $name ($refs_n reference image(s))"
  echo "output   : $out"
  cd "$REPO_ROOT" || die "cannot cd to repo root"
  rc=0
  # shellcheck disable=SC2086  # ref_args is a list of flags built above
  codex exec --sandbox workspace-write $ref_args "$prompt" \
    > "$logfile.out" 2> "$logfile" < /dev/null || rc=$?

  if [ ! -s "$out" ]; then
    # Codex keeps generated images under its own home. If it generated one but
    # did not copy it, take the newest file created during this run.
    gen_dir="${CODEX_HOME:-$HOME/.codex}/generated_images"
    if [ -d "$gen_dir" ]; then
      newest=""
      list="$HANDOFF/logs/.$ts-image-$name.found"
      find "$gen_dir" -type f -newer "$marker" \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) -print > "$list" 2>/dev/null
      while IFS= read -r f; do
        if [ -z "$newest" ] || [ "$f" -nt "$newest" ]; then newest="$f"; fi
      done < "$list"
      rm -f "$list" 2>/dev/null
      if [ -n "$newest" ] && [ -f "$newest" ]; then
        cp "$newest" "$out" && echo "note     : copied from $newest"
      fi
    fi
  fi
  rm -f "$marker" 2>/dev/null

  if [ ! -s "$out" ]; then
    log_line "$ts" "image" "write" "$name" "$rc" "NO_IMAGE" "$out"
    echo "RESULT   : no image was produced (exit $rc). See $logfile" >&2
    exit 1
  fi
  if ! is_image "$out"; then
    log_line "$ts" "image" "write" "$name" "$rc" "NOT_AN_IMAGE" "$out"
    echo "RESULT   : $out exists but is not a PNG/JPEG/WEBP file" >&2
    exit 1
  fi
  bytes="$(wc -c < "$out" | tr -d ' ')"
  log_line "$ts" "image" "write" "$name" "$rc" "DONE" "$out"
  echo "STATUS   : DONE ($bytes bytes)"
}

# --------------------------------------------------------------------------- #
# Approved image -> the canonical media location. This is a local file placement
# only: nothing is uploaded and no content record is written. The pack then
# references the printed URL, and deployment/scripts/copy-media-to-r2.sh ships it.
cmd_place() {
  [ $# -eq 2 ] || die "usage: run.sh place <image name or path> <asset_name>"
  src="$1"; asset="$2"
  # a bare name means a generated image in the handoff folder
  [ -f "$src" ] || src="$HANDOFF/images/$(slug_of "$1").png"
  [ -f "$src" ] || die "image not found: $1 (looked for $src too)"
  is_image "$src" || die "not a PNG/JPEG/WEBP file: $src"
  # same shape as the existing asset names, e.g. football_pl_arsene_wenger
  case "$asset" in
    ""|*[!a-z0-9_-]*|[_-]*) die "asset_name must be lower-case letters, digits, _ or - (got: $asset)" ;;
  esac
  ensure_dirs
  uploads="${AKWAAN_UPLOADS_DIR:-$REPO_ROOT/backend/uploads}"
  dir="$uploads/question-assets/images"
  mkdir -p "$dir" || die "cannot create $dir"
  for ext in webp png jpg jpeg; do
    [ -e "$dir/$asset.$ext" ] && die "an asset named $asset.$ext already exists — it may be referenced by live content; pick another name"
  done

  out="$dir/$asset.webp"
  if command -v node >/dev/null 2>&1 \
     && info="$(cd "$REPO_ROOT" && node "$HERE/to-webp.mjs" "$src" "$out" 2>"$HANDOFF/logs/place-$asset.err")"; then
    echo "converted: $info"
  else
    # No converter available. PNG is accepted by the upload rules as it is, so
    # keep the original bytes rather than fail — only larger.
    rm -f "$out" 2>/dev/null
    case "$(head -c 4 "$src" | od -An -tx1 | tr -d ' \n')" in
      89504e47) out="$dir/$asset.png" ;;
      ffd8ff*)  out="$dir/$asset.jpg" ;;
      *)        out="$dir/$asset.webp" ;;
    esac
    cp "$src" "$out" || die "cannot write $out"
    echo "note     : WebP conversion unavailable (see $HANDOFF/logs/place-$asset.err); kept the original format"
  fi

  is_image "$out" || die "$out was written but is not a valid image"
  bytes="$(wc -c < "$out" | tr -d ' ')"
  # the admin upload rule; a larger file would be refused elsewhere in the path
  [ "$bytes" -le 5242880 ] || die "$out is $bytes bytes — over the 5 MB asset limit; lower the quality or resize"
  rel="${out#"$uploads"/}"
  echo "placed   : $out ($bytes bytes)"
  echo "url      : /uploads/$rel"
  echo "next     : reference that url in the pack's media.assets, then"
  echo "           deployment/scripts/copy-media-to-r2.sh --manifest <pack> --dry-run"
}

# --------------------------------------------------------------------------- #
smoke_why() {
  # A failed smoke test is useless without the CLI's own error; show its tail.
  if [ -s "$1" ]; then
    echo "  --- what the CLI said (last lines of $1) ---"
    tail -8 "$1" | sed -e 's/^/  | /'
  else
    echo "  (the CLI printed no error either)"
  fi
}

cmd_doctor() {
  smoke=0
  [ "${1:-}" = "--smoke" ] && smoke=1
  bad=0
  echo "repo     : $REPO_ROOT"
  if ensure_dirs 2>/dev/null && [ -w "$HANDOFF" ]; then echo "handoff  : OK  $HANDOFF"
  else echo "handoff  : FAIL cannot write $HANDOFF"; bad=1; fi
  [ -f "$TEMPLATE" ] && echo "template : OK" || { echo "template : FAIL missing $TEMPLATE"; bad=1; }

  for tool in agy codex; do
    if command -v "$tool" >/dev/null 2>&1; then
      v="$("$tool" --version 2>/dev/null | head -1)"
      printf '%-9s: OK  %s\n' "$tool" "${v:-version unknown}"
    else
      printf '%-9s: MISSING (not on PATH)\n' "$tool"; bad=1
    fi
  done
  if command -v codex >/dev/null 2>&1; then
    if codex login status >/dev/null 2>&1; then echo "codex login : OK"
    else echo "codex login : NOT LOGGED IN — run: codex login"; bad=1; fi
  fi
  command -v aws >/dev/null 2>&1 && echo "aws      : OK (needed by deployment/scripts/copy-media-to-r2.sh)" \
    || echo "aws      : missing (only needed for the R2 media upload)"

  if [ "$smoke" -eq 1 ]; then
    echo "--- smoke: one short prompt to each CLI (uses a little quota) ---"
    if command -v agy >/dev/null 2>&1; then
      err="$HANDOFF/logs/doctor-agy.err"
      r="$(cd "$REPO_ROOT" && agy -p "Reply with exactly the word READY and nothing else." --mode default --output-format text --print-timeout 3m 2>"$err" < /dev/null | tr -d '[:space:]')"
      case "$r" in *READY*) echo "agy smoke    : OK" ;; *) echo "agy smoke    : FAIL (got: ${r:-nothing})"; smoke_why "$err"; bad=1 ;; esac
    fi
    if command -v codex >/dev/null 2>&1; then
      err="$HANDOFF/logs/doctor-codex.err"
      r="$(cd "$REPO_ROOT" && codex exec --sandbox read-only "Reply with exactly the word READY and nothing else." 2>"$err" < /dev/null | tr -d '[:space:]')"
      case "$r" in *READY*) echo "codex smoke  : OK" ;; *) echo "codex smoke  : FAIL (got: ${r:-nothing})"; smoke_why "$err"; bad=1 ;; esac
    fi
  fi
  [ "$bad" -eq 0 ] && { echo "RESULT   : ready"; exit 0; }
  echo "RESULT   : not ready — fix the lines marked MISSING / FAIL above"; exit 1
}

# --------------------------------------------------------------------------- #
sub="${1:-}"; [ $# -gt 0 ] && shift
case "$sub" in
  doctor) cmd_doctor "$@" ;;
  new)    cmd_new "$@" ;;
  agy|gemini) cmd_dispatch "agy" "$@" ;;
  codex) cmd_dispatch "codex" "$@" ;;
  image)  cmd_image "$@" ;;
  place)  cmd_place "$@" ;;
  ""|-h|--help) sed -n '2,42p' "$0" | sed -e 's/^# \{0,1\}//' ;;
  *) die "unknown command: $sub (try --help)" ;;
esac
