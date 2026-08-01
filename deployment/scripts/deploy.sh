#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deployment_dir="$(cd "${script_dir}/.." && pwd)"
env_file="${deployment_dir}/.env"

if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}. Copy .env.oracle.example and fill it first." >&2
  exit 2
fi

compose=(docker compose --env-file "${env_file}" -f "${deployment_dir}/docker-compose.oracle.yml")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --build
"${compose[@]}" ps

echo "Deployment started. Caddy will obtain HTTPS certificates after DNS resolves."
