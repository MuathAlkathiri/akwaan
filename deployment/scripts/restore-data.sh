#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm-restore" || -z "${2:-}" ]]; then
  echo "Usage: $0 --confirm-restore /absolute/path/to/backup-directory" >&2
  echo "This replaces collections in the deployment database." >&2
  exit 2
fi

backup_dir="$(cd "$2" && pwd)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd "${script_dir}/.." && pwd)"
compose=(docker compose --env-file "${deployment_dir}/.env" -f "${deployment_dir}/docker-compose.oracle.yml")

test -f "${backup_dir}/mongodb.archive.gz"
test -f "${backup_dir}/uploads.tar.gz"

if [[ -f "${backup_dir}/SHA256SUMS" ]]; then
  (cd "${backup_dir}" && shasum -a 256 -c SHA256SUMS)
fi

"${compose[@]}" up -d mongodb backend
"${compose[@]}" exec -T mongodb mongorestore \
  --uri="mongodb://127.0.0.1:27017/lammah-quiz?replicaSet=rs0" \
  --archive --gzip --drop < "${backup_dir}/mongodb.archive.gz"
"${compose[@]}" exec -T backend tar -C /app/uploads -xzf - \
  < "${backup_dir}/uploads.tar.gz"

echo "Data restored. Run deployment/scripts/verify-deployment.sh next."
