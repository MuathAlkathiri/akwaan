#!/usr/bin/env bash
#
# Akwaan Cloudflare R2 Media Ingestion Tool
#
# Supports two modes:
# 1. Scoped Manifest Mode (RECOMMENDED for content release promotion):
#    ./deployment/scripts/copy-media-to-r2.sh --manifest ai/scripts/data/marhala-video-games-batch-01.source.json [--dry-run]
#    - Derives media assets ONLY from the approved source pack JSON
#    - Validates local file existence, canonical paths, and non-empty assets
#    - Uploads strictly and exclusively the approved object keys
#    - Never traverses or syncs the entire uploads directory
#
#    Extra options (manifest mode only):
#      --uploads-dir <dir>    Read the files from <dir> instead of backend/uploads.
#                             Needed when the backend ran in Docker: its uploads
#                             live in the `backend_uploads` volume, not on the host.
#                             Export them first:
#                               docker compose cp backend:/app/uploads/. /tmp/akwaan-uploads
#      --require-media        Fail if any non-archived question carries no media
#                             (the Bomb rule: every item must have an image).
#      --check-remote <url>   READ-ONLY report, never uploads. For every asset the
#                             pack declares, say whether it exists locally and
#                             whether <url>/uploads/<key> serves it. Answers "is
#                             this already live?" when a file is missing locally.
#                               --check-remote https://akwaan-api.onrender.com
#      --verify-public <url>  After a live upload, also fetch every asset through
#                             <url>/uploads/<key> and compare its bytes (SHA-256)
#                             with the local file. A HEAD in the bucket proves an
#                             object exists; this proves the game can load it.
#
# 2. Legacy Broad Volume Sync:
#    ./deployment/scripts/copy-media-to-r2.sh [--dry-run]
#    - Historical Docker volume sync (local container -> bucket)
#
# Credentials (required for actual upload, optional for --dry-run):
#   export AWS_ACCESS_KEY_ID=...        # R2 access key id
#   export AWS_SECRET_ACCESS_KEY=...    # R2 secret access key
#   export R2_ACCOUNT_ID=...            # from Cloudflare dashboard
#   export R2_BUCKET=akwaan-beta-media
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MANIFEST=""
DRY_RUN=0
UPLOADS_DIR_ARG=""
REQUIRE_MEDIA=0
CHECK_REMOTE=""
VERIFY_PUBLIC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      if [[ -z "${2:-}" ]]; then
        echo "ERROR: --manifest requires a file path argument" >&2
        exit 1
      fi
      MANIFEST="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --uploads-dir)
      if [[ -z "${2:-}" ]]; then echo "ERROR: --uploads-dir requires a directory" >&2; exit 1; fi
      UPLOADS_DIR_ARG="$2"
      shift 2
      ;;
    --require-media)
      REQUIRE_MEDIA=1
      shift
      ;;
    --check-remote)
      if [[ -z "${2:-}" ]]; then echo "ERROR: --check-remote requires a base URL" >&2; exit 1; fi
      CHECK_REMOTE="$2"
      shift 2
      ;;
    --verify-public)
      if [[ -z "${2:-}" ]]; then echo "ERROR: --verify-public requires a base URL" >&2; exit 1; fi
      VERIFY_PUBLIC="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--manifest <path/to/source.json>] [--dry-run]"
      echo "          [--uploads-dir <dir>] [--require-media]"
      echo "          [--check-remote <base-url>] [--verify-public <base-url>]"
      echo
      echo "Options:"
      echo "  --manifest <file>       Path to canonical source pack JSON (scoped upload)"
      echo "  --dry-run               Validate files and print planned object keys without uploading"
      echo "  --uploads-dir <dir>     Read files from <dir> instead of backend/uploads"
      echo "  --require-media         Fail if any non-archived question carries no media"
      echo "  --check-remote <url>    Read-only: report local and live presence of every asset"
      echo "  --verify-public <url>   After upload, fetch each asset via <url>/uploads/ and compare bytes"
      echo "  -h, --help              Show this help message"
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option '$1'" >&2
      echo "Usage: $0 [--manifest <path/to/source.json>] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# --------------------------------------------------------------------------- #
# Mode 1: Scoped Manifest Mode
# --------------------------------------------------------------------------- #
if [[ -n "$MANIFEST" ]]; then
  if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: Manifest file not found: $MANIFEST" >&2
    exit 1
  fi

  if [[ -n "$UPLOADS_DIR_ARG" ]]; then
    if [[ ! -d "$UPLOADS_DIR_ARG" ]]; then
      echo "ERROR: --uploads-dir is not a directory: $UPLOADS_DIR_ARG" >&2
      exit 1
    fi
    UPLOADS_DIR_ABS="$(cd "$UPLOADS_DIR_ARG" && pwd)"
  else
    UPLOADS_DIR_ABS="$REPO_ROOT/backend/uploads"
  fi
  export UPLOADS_DIR_ABS REQUIRE_MEDIA

  # Read-only. For each asset the pack declares: is the file here, and does the
  # public media path serve it? With $2 = "strict" a local file is required and
  # its SHA-256 must equal what the URL returns. Values travel by environment,
  # never by interpolation into the program text.
  remote_check() {
    REMOTE_BASE="$1" REMOTE_STRICT="${2:-}" MANIFEST_PATH="$MANIFEST" python3 - <<'PY'
import hashlib, json, os, sys, urllib.error, urllib.request

base = os.environ['REMOTE_BASE'].rstrip('/')
strict = os.environ.get('REMOTE_STRICT') == 'strict'
uploads = os.environ['UPLOADS_DIR_ABS']

with open(os.environ['MANIFEST_PATH'], encoding='utf-8') as fh:
    data = json.load(fh)
keys, seen = [], set()
for q in data.get('questions') or data.get('items', []):
    if q.get('status') == 'archived':
        continue
    media = q.get('media') or {}
    if media.get('type') in (None, 'none'):
        continue
    for asset in media.get('assets') or []:
        key = (asset.get('url') or '').strip().lstrip('/')
        if key.startswith('uploads/'):
            key = key[len('uploads/'):]
        if key and key not in seen:
            seen.add(key)
            keys.append((q.get('id', 'unknown'), key))

if not keys:
    print('ERROR: Manifest declares no media assets.', file=sys.stderr)
    sys.exit(5)

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'akwaan-media-check'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, response.headers.get('Content-Type', ''), response.read()
    except urllib.error.HTTPError as error:
        return error.code, '', b''
    except Exception as error:  # DNS, TLS, timeout: unreachable is not "missing"
        return None, str(error), b''

counts = {}
bad = 0
print(f'{"LOCAL":7s} {"REMOTE":16s} KEY')
for qid, key in keys:
    path = os.path.join(uploads, key)
    local = os.path.isfile(path) and os.path.getsize(path) > 0
    status, ctype, body = fetch(f'{base}/uploads/{key}')
    if status is None:
        remote = 'UNREACHABLE'
    elif status != 200:
        remote = f'MISSING({status})'
    elif not body or not (ctype.startswith('image/') or ctype.startswith('audio/') or ctype.startswith('video/')):
        remote = 'INVALID'
    elif local and hashlib.sha256(body).hexdigest() != hashlib.sha256(open(path, 'rb').read()).hexdigest():
        remote = 'DIFFERENT'
    else:
        remote = 'OK'
    ok = remote == 'OK' and (local or not strict)
    bad += 0 if ok else 1
    label = f'{"yes" if local else "NO":7s} {remote:16s}'
    counts[label] = counts.get(label, 0) + 1
    print(f'{label} {key}  [{qid}]')

print('-' * 65)
for label, n in sorted(counts.items()):
    print(f'{n:4d}  local={label.split()[0]:3s} remote={label.split()[1]}')
print(f'Assets: {len(keys)} | not OK: {bad} | base: {base}')
sys.exit(0 if bad == 0 else 1)
PY
  }

  if [[ -n "$CHECK_REMOTE" ]]; then
    echo "================================================================="
    echo "AKWAAN MEDIA — REMOTE CHECK (read-only, zero writes)"
    echo "================================================================="
    echo "Manifest : $MANIFEST"
    echo "Local    : $UPLOADS_DIR_ABS"
    echo
    remote_check "$CHECK_REMOTE"
    exit $?
  fi

  echo "================================================================="
  echo "AKWAAN R2 MEDIA INGESTION — SCOPED MANIFEST MODE"
  echo "================================================================="
  echo "Manifest : $MANIFEST"
  echo "Mode     : $([[ "$DRY_RUN" -eq 1 ]] && echo 'DRY-RUN (read-only, zero network writes)' || echo 'LIVE UPLOAD')"
  echo

  # Use python to extract, validate, and stage the exact assets
  PYTHON_INVENTORY=$(python3 -c "
import json
import os
import sys

manifest_path = '$MANIFEST'
repo_root = '$REPO_ROOT'
local_uploads_dir = os.environ.get('UPLOADS_DIR_ABS') or os.path.join(repo_root, 'backend', 'uploads')
require_media = os.environ.get('REQUIRE_MEDIA') == '1'
no_media = []
active = 0

try:
    with open(manifest_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception as e:
    print(f'ERROR: Failed to parse JSON manifest: {e}', file=sys.stderr)
    sys.exit(2)

questions = data.get('questions') or data.get('items', [])
if not isinstance(questions, list) or len(questions) == 0:
    print('ERROR: Manifest contains zero questions.', file=sys.stderr)
    sys.exit(3)

items = []
seen_keys = set()
errors = []

for q in questions:
    if q.get('status') == 'archived':
        continue
    qid = q.get('id', 'unknown')
    active += 1
    media = q.get('media')
    if not media or not isinstance(media, dict):
        no_media.append(qid)
        continue
    m_type = media.get('type')
    if not m_type or m_type == 'none':
        no_media.append(qid)
        continue
    if m_type not in ('image', 'audio', 'video'):
        errors.append(f'[{qid}] Unsupported media type: {m_type}')
        continue
    assets = media.get('assets') or []
    if not isinstance(assets, list) or len(assets) == 0:
        errors.append(f'[{qid}] Media declared type {m_type} but has empty assets list')
        continue

    for asset in assets:
        url = asset.get('url')
        if not url:
            errors.append(f'[{qid}] Asset missing url')
            continue
        
        # Enforce canonical path layout
        clean_url = url.strip()
        if not (clean_url.startswith('/uploads/question-assets/') or clean_url.startswith('uploads/question-assets/')):
            errors.append(f'[{qid}] Asset url outside canonical question-assets path: {clean_url}')
            continue

        # Object key in bucket: question-assets/...
        key = clean_url.lstrip('/')
        if key.startswith('uploads/'):
            key = key[len('uploads/'):]

        if key in seen_keys:
            continue
        seen_keys.add(key)

        local_file = os.path.join(local_uploads_dir, key)
        if not os.path.isfile(local_file):
            errors.append(f'[{qid}] Missing local asset on disk: {local_file} (key: {key})')
            continue
        
        file_size = os.path.getsize(local_file)
        if file_size == 0:
            errors.append(f'[{qid}] Local asset file is 0 bytes: {local_file}')
            continue

        items.append({
            'qid': qid,
            'type': m_type,
            'key': key,
            'local_file': local_file,
            'size': file_size
        })

# Never silent: a text-only item in a pack that should be all-image is exactly
# the thing a quiet skip would hide.
if no_media:
    print(f'NOTE: {len(no_media)} of {active} active questions carry no media.', file=sys.stderr)
    if require_media:
        for qid in no_media:
            errors.append(f'[{qid}] carries no media (--require-media)')

if errors:
    print('VALIDATION FAILURES:', file=sys.stderr)
    for err in errors:
        print(f'  - {err}', file=sys.stderr)
    if any('Missing local asset on disk' in err for err in errors):
        print(f'HINT: files are read from {local_uploads_dir}', file=sys.stderr)
        print('      If the backend ran in Docker its uploads are in the backend_uploads volume:', file=sys.stderr)
        print('        docker compose cp backend:/app/uploads/. /tmp/akwaan-uploads', file=sys.stderr)
        print('        ... --uploads-dir /tmp/akwaan-uploads', file=sys.stderr)
        print('      To see whether they are already live: --check-remote <api-base-url>', file=sys.stderr)
    sys.exit(4)

if len(items) == 0:
    print('ERROR: Manifest contains zero media assets to ingest.', file=sys.stderr)
    sys.exit(5)

print(json.dumps(items))
")

  if [[ $? -ne 0 ]]; then
    echo "ERROR: Manifest validation failed." >&2
    exit 1
  fi

  ITEM_COUNT=$(python3 -c "import json; data=json.loads('''$PYTHON_INVENTORY'''); print(len(data))")
  echo "Approved Media Assets Found: $ITEM_COUNT"
  echo "-----------------------------------------------------------------"
  python3 -c "
import json
data = json.loads('''$PYTHON_INVENTORY''')
for idx, it in enumerate(data, 1):
    print(f\"{idx:2d}. [{it['type'].upper():5s}] {it['key']:55s} ({it['size']} bytes)\")
"
  echo "-----------------------------------------------------------------"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo
    echo "==> DRY-RUN SUMMARY:"
    echo "  Total approved assets to sync : $ITEM_COUNT"
    echo "  Local source directory        : $UPLOADS_DIR_ABS"
    echo "  Destination bucket target     : s3://${R2_BUCKET:-akwaan-beta-media}"
    echo "  Missing / invalid assets      : 0"
    echo "  Unrelated files included      : 0 (Strictly filtered)"
    echo "  Result                        : DRY-RUN SUCCESS (Zero R2 writes performed)"
    exit 0
  fi

  # Live upload requires credentials
  : "${AWS_ACCESS_KEY_ID:?export AWS_ACCESS_KEY_ID first}"
  : "${AWS_SECRET_ACCESS_KEY:?export AWS_SECRET_ACCESS_KEY first}"
  : "${R2_ACCOUNT_ID:?export R2_ACCOUNT_ID first}"
  : "${R2_BUCKET:?export R2_BUCKET first}"

  command -v aws >/dev/null 2>&1 || { echo "Missing required tool: aws" >&2; exit 1; }

  ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  STAGE_DIR="${STAGE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/akwaan-r2-manifest-XXXXXX")}"
  trap 'rm -rf "$STAGE_DIR"' EXIT

  echo
  echo "==> Staging ONLY the $ITEM_COUNT approved assets into temporary mirror: $STAGE_DIR"
  python3 -c "
import json, os, shutil
data = json.loads('''$PYTHON_INVENTORY''')
stage = '$STAGE_DIR'
for it in data:
    dest = os.path.join(stage, it['key'])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(it['local_file'], dest)
"

  STAGED_COUNT="$(find "$STAGE_DIR" -type f | wc -l | tr -d ' ')"
  echo "Staged files: $STAGED_COUNT / $ITEM_COUNT"

  if [[ "$STAGED_COUNT" -ne "$ITEM_COUNT" ]]; then
    echo "ERROR: Staged file count ($STAGED_COUNT) does not match manifest count ($ITEM_COUNT)!" >&2
    exit 1
  fi

  echo
  echo "==> Uploading strictly approved assets to r2://${R2_BUCKET} (additive only)"
  AWS_DEFAULT_REGION=auto aws s3 sync "$STAGE_DIR" "s3://${R2_BUCKET}" \
    --endpoint-url "$ENDPOINT" \
    --checksum-algorithm CRC32 \
    --no-progress

  echo
  echo "==> Verifying uploaded assets in bucket..."
  python3 -c "
import json, subprocess, sys
data = json.loads('''$PYTHON_INVENTORY''')
bucket = '$R2_BUCKET'
endpoint = '$ENDPOINT'
missing_remote = []

for it in data:
    key = it['key']
    res = subprocess.run([
        'aws', 's3api', 'head-object',
        '--bucket', bucket,
        '--key', key,
        '--endpoint-url', endpoint,
        '--output', 'json'
    ], capture_output=True)
    if res.returncode != 0:
        missing_remote.append(f'{key} (not in bucket)')
        continue
    # Present is not enough: an older object under the same key would pass a
    # bare existence check while serving the wrong bytes.
    try:
        remote_size = json.loads(res.stdout.decode('utf-8')).get('ContentLength')
    except Exception:
        remote_size = None
    if remote_size != it['size']:
        missing_remote.append(f'{key} (bucket size {remote_size} != local {it[\"size\"]})')

if missing_remote:
    print(f'ERROR: {len(missing_remote)} objects failed remote verification:', file=sys.stderr)
    for m in missing_remote:
        print(f'  - {m}', file=sys.stderr)
    sys.exit(1)

print(f'SUCCESS: All {len(data)} objects verified in r2://{bucket} (present, size matches)')
"

  if [[ -n "$VERIFY_PUBLIC" ]]; then
    echo
    echo "==> Verifying through the public media path: ${VERIFY_PUBLIC}/uploads/..."
    remote_check "$VERIFY_PUBLIC" strict
  fi
  echo "Media ingest complete."
  exit 0
fi

# --------------------------------------------------------------------------- #
# Mode 2: Legacy Broad Volume Sync (Historical)
# --------------------------------------------------------------------------- #
echo "================================================================="
echo "AKWAAN R2 MEDIA INGESTION — BROAD VOLUME SYNC (LEGACY)"
echo "================================================================="

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Mode: DRY-RUN (Volume inventory only)"
  SERVICE="${SERVICE:-backend}"
  CONTAINER_UPLOADS="${CONTAINER_UPLOADS:-/app/uploads}"
  echo "==> Source inventory (inside the running ${SERVICE} container)"
  docker compose exec -T "$SERVICE" sh -c "
    find '${CONTAINER_UPLOADS}' -type f | wc -l | xargs echo 'files:';
    du -sh '${CONTAINER_UPLOADS}' | cut -f1 | xargs echo 'size: '
  "
  echo "Result: DRY-RUN SUCCESS (Zero R2 writes performed)"
  exit 0
fi

: "${AWS_ACCESS_KEY_ID:?export AWS_ACCESS_KEY_ID first}"
: "${AWS_SECRET_ACCESS_KEY:?export AWS_SECRET_ACCESS_KEY first}"
: "${R2_ACCOUNT_ID:?export R2_ACCOUNT_ID first}"
: "${R2_BUCKET:?export R2_BUCKET first}"

ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
SERVICE="${SERVICE:-backend}"
CONTAINER_UPLOADS="${CONTAINER_UPLOADS:-/app/uploads}"
STAGE_DIR="${STAGE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/akwaan-media-XXXXXX")}"
trap 'rm -rf "$STAGE_DIR"' EXIT

command -v aws >/dev/null 2>&1 || { echo "Missing required tool: aws" >&2; exit 1; }

echo "==> Source inventory (inside the running ${SERVICE} container)"
docker compose exec -T "$SERVICE" sh -c "
  find '${CONTAINER_UPLOADS}' -type f | wc -l | xargs echo 'files:';
  du -sh '${CONTAINER_UPLOADS}' | cut -f1 | xargs echo 'size: '
"

echo
echo "==> Staging a copy at ${STAGE_DIR} (the volume itself is not modified)"
docker compose cp "${SERVICE}:${CONTAINER_UPLOADS}/." "${STAGE_DIR}/"

STAGED_COUNT="$(find "$STAGE_DIR" -type f | wc -l | tr -d ' ')"
echo "staged files: ${STAGED_COUNT}"

echo
echo "==> Uploading to r2://${R2_BUCKET} (no --delete: additive only)"
AWS_DEFAULT_REGION=auto aws s3 sync "$STAGE_DIR" "s3://${R2_BUCKET}" \
  --endpoint-url "$ENDPOINT" \
  --checksum-algorithm CRC32 \
  --no-progress

echo
echo "==> Verify: object count in the bucket"
REMOTE_COUNT="$(AWS_DEFAULT_REGION=auto aws s3 ls "s3://${R2_BUCKET}" \
  --endpoint-url "$ENDPOINT" --recursive --summarize \
  | awk '/Total Objects:/ { print $3 }')"
echo "local staged: ${STAGED_COUNT}"
echo "bucket:       ${REMOTE_COUNT}"

if [[ "$STAGED_COUNT" != "$REMOTE_COUNT" ]]; then
  echo "Counts differ — re-run the sync before relying on the mirror." >&2
  exit 1
fi

echo
echo "Media mirrored."
