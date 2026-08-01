#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_root="${1:-${repo_root}/deployment/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${backup_root}/${timestamp}"

mkdir -p "${destination}"

cd "${repo_root}"
docker compose exec -T mongodb mongodump \
  --uri="mongodb://127.0.0.1:27017/lammah-quiz?replicaSet=rs0" \
  --archive --gzip > "${destination}/mongodb.archive.gz"
docker compose exec -T backend tar -C /app/uploads -czf - . \
  > "${destination}/uploads.tar.gz"

shasum -a 256 "${destination}/mongodb.archive.gz" \
  "${destination}/uploads.tar.gz" > "${destination}/SHA256SUMS"

echo "Backup created at ${destination}"
