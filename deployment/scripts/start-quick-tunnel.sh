#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_dir="${repo_root}/.cache/quick-tunnel"
mkdir -p "${runtime_dir}"

if [[ -f "${runtime_dir}/urls" ]]; then
  echo "A recorded tunnel already exists. Run stop-quick-tunnel.sh first." >&2
  exit 2
fi

cleanup_failed_start() {
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
    rm -sf tunnel-api tunnel-frontend >/dev/null 2>&1 || true
  rm -f "${runtime_dir}/urls"
}
trap cleanup_failed_start ERR INT TERM

wait_for_url() {
  local service="$1"
  local url=""
  for _ in {1..60}; do
    url="$(docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
      logs --no-color "${service}" 2>/dev/null \
      | grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' \
      | head -1 || true)"
    if [[ -n "${url}" ]]; then
      printf '%s' "${url}"
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${service}. Inspect its Docker logs." >&2
  return 1
}

cd "${repo_root}"
docker compose up -d mongodb backend
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d tunnel-api
api_url="$(wait_for_url tunnel-api)"

TUNNEL_API_URL="${api_url}" \
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d --build --no-deps frontend

TUNNEL_API_URL="${api_url}" \
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d tunnel-frontend
frontend_url="$(wait_for_url tunnel-frontend)"

TUNNEL_API_URL="${api_url}" TUNNEL_FRONTEND_URL="${frontend_url}" \
  docker compose -f docker-compose.yml -f docker-compose.tunnel.yml \
  up -d --no-deps --force-recreate backend

cat > "${runtime_dir}/urls" <<EOF
TUNNEL_FRONTEND_URL=${frontend_url}
TUNNEL_API_URL=${api_url}
EOF

trap - ERR INT TERM
echo
echo "Akwaan temporary public URL: ${frontend_url}"
echo "API tunnel: ${api_url}"
echo
echo "Keep this Mac awake and Docker running."
echo "Stop access with: deployment/scripts/stop-quick-tunnel.sh"
