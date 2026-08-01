#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd "${script_dir}/.." && pwd)"
compose=(docker compose --env-file "${deployment_dir}/.env" -f "${deployment_dir}/docker-compose.oracle.yml")

set -a
source "${deployment_dir}/.env"
set +a

"${compose[@]}" ps
"${compose[@]}" exec -T mongodb mongosh --quiet \
  "mongodb://127.0.0.1:27017/lammah-quiz?replicaSet=rs0" \
  --eval 'JSON.stringify({catalogs:db.catalogs.countDocuments(),categories:db.categories.countDocuments(),questions:db.questions.countDocuments(),games:db.games.countDocuments(),users:db.users.countDocuments()})'
"${compose[@]}" exec -T backend sh -c \
  'printf "uploaded_files="; find /app/uploads -type f | wc -l'

curl --fail --silent --show-error "https://${API_HOST}/health"
curl --fail --silent --show-error --output /dev/null "https://${FRONTEND_HOST}"
echo
echo "Deployment verification passed."
