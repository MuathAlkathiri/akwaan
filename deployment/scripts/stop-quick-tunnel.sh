#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_dir="${repo_root}/.cache/quick-tunnel"

cd "${repo_root}"
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  rm -sf tunnel-api tunnel-frontend
rm -f "${runtime_dir}/urls"
rm -f "${runtime_dir}"/*.pid "${runtime_dir}"/*.log
docker compose up -d --build backend frontend

echo "Quick Tunnels stopped and the local Docker configuration was restored."
