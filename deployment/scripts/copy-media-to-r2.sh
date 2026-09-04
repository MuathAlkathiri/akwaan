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
    -h|--help)
      echo "Usage: $0 [--manifest <path/to/source.json>] [--dry-run]"
      echo
      echo "Options:"
      echo "  --manifest <file>  Path to canonical source pack JSON (scoped upload)"
      echo "  --dry-run          Validate files and print planned object keys without uploading"
      echo "  -h, --help         Show this help message"
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
local_uploads_dir = os.path.join(repo_root, 'backend', 'uploads')

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
    media = q.get('media')
    if not media or not isinstance(media, dict):
        continue
    m_type = media.get('type')
    if not m_type or m_type == 'none':
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

if errors:
    print('VALIDATION FAILURES:', file=sys.stderr)
    for err in errors:
        print(f'  - {err}', file=sys.stderr)
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
    echo "  Local source directory        : backend/uploads/"
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
        '--endpoint-url', endpoint
    ], capture_output=True)
    if res.returncode != 0:
        missing_remote.append(key)

if missing_remote:
    print(f'ERROR: {len(missing_remote)} objects failed remote verification:', file=sys.stderr)
    for m in missing_remote:
        print(f'  - {m}', file=sys.stderr)
    sys.exit(1)

print(f'SUCCESS: All {len(data)} objects verified present in r2://{bucket}')
"
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
