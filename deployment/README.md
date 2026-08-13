# Akwaan temporary VM deployment

This deployment runs the existing frontend, backend, MongoDB replica set, and
uploaded media on one Docker host. It is suitable for an Oracle Always Free VM
and can later be moved to an AWS VPS without changing application architecture.

## 1. Prepare the VM and DNS

Use Ubuntu 22.04 or 24.04 on an Ampere A1 VM (2 OCPUs and at least 8 GB memory
recommended for Docker builds). Install Git and Docker Engine with the Compose
plugin. In both Oracle's network security list and the VM firewall, allow only:

- TCP 22 from your own IP
- TCP 80 from anywhere
- TCP 443 from anywhere
- UDP 443 from anywhere (optional HTTP/3)

Do not open ports 27017, 3000, or 3001.

Create two DNS A records pointing to the VM public IP, one for the frontend and
one for the API. Temporary DNS names are fine. HTTPS is required for browser
microphone permission.

## 2. Configure and launch

```bash
git clone <repository-url> akwaan
cd akwaan
cp deployment/.env.oracle.example deployment/.env
openssl rand -hex 64
# Put the generated value and both DNS hosts in deployment/.env.
chmod +x deployment/scripts/*.sh
deployment/scripts/deploy.sh
```

The production Compose file has no host port for MongoDB, the backend, or the
frontend. Caddy is the only public application entry point. Swagger, AI question
generation, automatic media selection, YouTube downloads, and live-game debug
controls are disabled.

## 3. Copy current local data safely

On the local machine, while the existing Compose stack is running:

```bash
deployment/scripts/export-local-data.sh
```

Copy the resulting timestamped directory to the VM with `scp`. On the VM:

```bash
deployment/scripts/restore-data.sh --confirm-restore /absolute/path/to/backup
deployment/scripts/verify-deployment.sh
```

The export is read-only and does not modify the local database or uploads. The
restore uses `--drop`, so it must only target the temporary deployment database.

## 4. Operations and validation

```bash
docker compose --env-file deployment/.env \
  -f deployment/docker-compose.oracle.yml ps
docker compose --env-file deployment/.env \
  -f deployment/docker-compose.oracle.yml logs -f --tail=200
deployment/scripts/verify-deployment.sh
```

After automated verification, manually test login, admin image authoring,
standard questions, Top 10, Bomb, QR joining, two representatives, timers,
turns, voice input, refresh, and reconnect. Then restart the stack and rerun the
verification script to prove MongoDB and uploads persist.

## 5. Backup and AWS migration

Run `export-local-data.sh` against the active stack before migration (or use the
same `mongodump` and uploads archive commands with the production Compose file).
Copy the repository and backup to AWS, configure `deployment/.env` with the new
hosts, launch the stack, restore, verify, and finally update DNS. Preserve the
old server until the AWS verification is complete.

For a permanent deployment, move uploaded media to S3, encrypt off-site backups,
rotate all secrets, restrict SSH, and add uptime/error monitoring.

## Temporary public testing without a VM

Cloudflare Quick Tunnels can expose the currently running local Docker stack
over temporary HTTPS addresses. The Mac must remain awake and connected. The
tunnel connectors run as Docker services so they survive terminal sessions.

```bash
chmod +x deployment/scripts/*.sh
deployment/scripts/start-quick-tunnel.sh
```

The script creates separate API and frontend tunnels, rebuilds the frontend with
the temporary API URL, and restricts backend CORS to the temporary frontend URL.
The generated addresses are kept under `.cache/quick-tunnel` and connector logs
are available through Docker Compose.

Quick Tunnel addresses are public and intended only for short controlled test
sessions. Stop them immediately after testing:

```bash
deployment/scripts/stop-quick-tunnel.sh
```

Stopping also rebuilds the normal local Docker services so localhost works again.
