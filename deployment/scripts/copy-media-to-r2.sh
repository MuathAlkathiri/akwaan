#!/usr/bin/env bash
#
# One-way copy of the live `backend_uploads` Docker volume into a Cloudflare R2
# bucket, preserving the key layout the database already references.
#
# A file served locally as
#     /uploads/questions/images/abc.webp
# becomes the bucket key
#     questions/images/abc.webp
# so MEDIA_PUBLIC_BASE_URL + key resolves without touching a single document.
#
# Nothing is deleted: this syncs local -> bucket only. The local volume is read
# out of the running container and left exactly as it is.
#
# Credentials come from the environment, never from a file:
#
#   export AWS_ACCESS_KEY_ID=...        # R2 access key id
#   export AWS_SECRET_ACCESS_KEY=...    # R2 secret access key
#   export R2_ACCOUNT_ID=...            # from the Cloudflare dashboard
#   export R2_BUCKET=akwaan-media
#   deployment/scripts/copy-media-to-r2.sh
#
# Requires the AWS CLI (R2 speaks the S3 API):
#   brew install awscli
#
set -euo pipefail

: "${AWS_ACCESS_KEY_ID:?export the R2 access key id first}"
: "${AWS_SECRET_ACCESS_KEY:?export the R2 secret access key first}"
: "${R2_ACCOUNT_ID:?export R2_ACCOUNT_ID first}"
: "${R2_BUCKET:?export R2_BUCKET first}"

ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
SERVICE="${SERVICE:-backend}"
CONTAINER_UPLOADS="${CONTAINER_UPLOADS:-/app/uploads}"
STAGE_DIR="${STAGE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/akwaan-media-XXXXXX")}"

command -v aws >/dev/null 2>&1 || { echo "Missing required tool: aws" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

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
echo "Media mirrored. Spot-check one public URL in a browser, for example:"
find "$STAGE_DIR" -type f | head -1 | sed "s|^${STAGE_DIR}/|  \${MEDIA_PUBLIC_BASE_URL}/|"
echo
echo "Staging copy kept at ${STAGE_DIR}. Delete it once the URLs load."
