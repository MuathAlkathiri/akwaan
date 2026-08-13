#!/usr/bin/env bash
#
# One-way copy of the live local `lammah-quiz` database into MongoDB Atlas.
#
# The local database is never written to, dropped, or renamed — the only local
# operation is `mongodump`, which is read-only.
#
# The Atlas URI is taken from the environment so no credential ever reaches a
# file or the shell history of a committed script:
#
#   read -rs ATLAS_URI && export ATLAS_URI    # paste, then press enter
#   deployment/scripts/copy-local-db-to-atlas.sh
#
# Requires the MongoDB Database Tools (mongodump/mongorestore):
#   brew install mongodb/brew/mongodb-database-tools
#
# ---------------------------------------------------------------------------
# WHICH MongoDB does "local" mean?
#
# This machine can have two servers answering for MongoDB at once: the Compose
# container (`akwaan-mongodb-1`, the real Akwaan data) and a native Homebrew
# `mongod`. When both run, the native one wins `127.0.0.1:27017` — it binds the
# loopback address specifically, ahead of Docker's wildcard bind — so a host URI
# silently reads a completely different database. That is exactly how a stale
# 5-user dataset was once mistaken for the live one.
#
# So the default source is the container, addressed through Docker rather than
# through a port that another process can win. `SOURCE=host` is available for
# the case where MongoDB runs natively and Compose is not up.
#
# Whichever source is chosen, the identity guard below re-checks the data before
# anything is dumped. Reading from the wrong server is not a survivable mistake
# once it reaches Atlas, so it is checked rather than assumed.
# ---------------------------------------------------------------------------
set -euo pipefail

DB_NAME="${DB_NAME:-lammah-quiz}"
SOURCE="${SOURCE:-container}"
SERVICE="${SERVICE:-mongodb}"
# Host fallback. `directConnection=true` on purpose: replica-set discovery from
# the host resolves Docker-internal hostnames and hangs until it times out.
LOCAL_URI="${LOCAL_URI:-mongodb://127.0.0.1:27017/${DB_NAME}?directConnection=true}"
OUT_DIR="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/akwaan-atlas-XXXXXX")}"

# The dataset fingerprint, in two parts.
#
# EXACT: structural collections that only change through deliberate schema-level
# work. If one of these is off, you are looking at a different database.
#
# MINIMUM: collections that grow during normal authoring and play. Pinning them
# exactly would make this guard cry wolf every time someone writes a
# ContentItem — which it did, hours after being written. A floor still catches
# the failure that matters (a near-empty or stale dataset) without failing on
# healthy growth. Raise the floors when the content baseline genuinely moves.
EXPECTED_EXACT="worlds=5 scopes=18 challenge_types=7"
declare -a MINIMUMS=(
  "content_items:130"
  "users:24"
  "questions:136"
  "categories:19"
  "catalogs:10"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# mktemp creates the default, but an OUT_DIR passed in by the caller may not
# exist yet.
mkdir -p "$OUT_DIR"

if [[ -z "${ATLAS_URI:-}" ]]; then
  echo "ATLAS_URI is not set. Export the Atlas SRV URI first (do not paste it into a file)." >&2
  exit 1
fi

for tool in mongorestore mongosh; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

# The Atlas URI must target the same database name. A mismatch here is how you
# end up with a half-populated cluster the backend cannot see.
case "$ATLAS_URI" in
  *"/${DB_NAME}"*) ;;
  *) echo "ATLAS_URI does not contain /${DB_NAME}. Refusing to guess a target database." >&2; exit 1 ;;
esac

# --- source adapters -------------------------------------------------------

case "$SOURCE" in
  container)
    command -v docker >/dev/null 2>&1 || { echo "Missing required tool: docker" >&2; exit 1; }
    docker compose ps --status running --services 2>/dev/null | grep -qx "$SERVICE" || {
      echo "Compose service '${SERVICE}' is not running. Start it, or re-run with SOURCE=host." >&2
      exit 1
    }
    source_label="container ${SERVICE} (volume-backed Compose MongoDB)"
    run_mongosh() { docker compose exec -T "$SERVICE" mongosh --quiet "$DB_NAME" --eval "$1"; }
    ;;
  host)
    command -v mongodump >/dev/null 2>&1 || { echo "Missing required tool: mongodump" >&2; exit 1; }
    source_label="host ${LOCAL_URI%%\?*}"
    run_mongosh() { mongosh "$LOCAL_URI" --quiet --eval "$1"; }
    ;;
  *)
    echo "SOURCE must be 'container' or 'host' (got '${SOURCE}')." >&2
    exit 1
    ;;
esac

echo "==> Source: ${source_label}"
echo

# --- identity guard --------------------------------------------------------
#
# Counts alone do not prove identity, but a wrong dataset fails this
# immediately, and that is the failure worth catching before a dump reaches
# a cluster.

echo "==> Verifying the source really is the Akwaan dataset"
actual_identity="$(run_mongosh '
  const keys = ["worlds","scopes","challenge_types"];
  print(keys.map(k => k + "=" + db.getCollection(k).countDocuments()).join(" "));
' | tr -d '\r' | tail -1)"

echo "    structural expected: ${EXPECTED_EXACT}"
echo "    structural actual:   ${actual_identity}"

identity_ok=1
[[ "$actual_identity" == "$EXPECTED_EXACT" ]] || identity_ok=0

for entry in "${MINIMUMS[@]}"; do
  collection="${entry%%:*}"
  floor="${entry##*:}"
  count="$(run_mongosh "print(db.getCollection('${collection}').countDocuments())" | tr -d '\r' | tail -1)"
  if [[ "$count" -lt "$floor" ]]; then
    echo "    ${collection}: ${count} (BELOW FLOOR ${floor})"
    identity_ok=0
  else
    echo "    ${collection}: ${count} (>= ${floor})"
  fi
done

if [[ "$identity_ok" -eq 0 ]]; then
  cat >&2 <<EOF

REFUSING TO MIGRATE: the source database does not match the Akwaan fingerprint.

Nothing was dumped and Atlas was not touched.

Most likely causes:
  * A native mongod is shadowing 127.0.0.1:27017 and SOURCE=host read it.
    Check with:  lsof -nP -iTCP:27017 -sTCP:LISTEN
    Then re-run with the default SOURCE=container.
  * The content genuinely changed. If so, update EXPECTED_IDENTITY in this
    script in the same commit that explains why.
EOF
  exit 1
fi
echo "    identity confirmed"
echo

# --- baseline --------------------------------------------------------------

echo "==> Baseline: local counts"
run_mongosh '
  let total = 0;
  db.getCollectionNames().sort().forEach(c => {
    const n = db.getCollection(c).countDocuments();
    total += n;
    print(c.padEnd(36) + n);
  });
  print("TOTAL".padEnd(36) + total);
' | tr -d '\r' | tee "${OUT_DIR}/local-counts.txt"

echo
echo "==> Dumping ${DB_NAME} (read-only) to ${OUT_DIR}"
if [[ "$SOURCE" == "container" ]]; then
  # Dump inside the container, then copy the archive out. Keeps the dump on the
  # same side of the network as the server and avoids the host port entirely.
  docker compose exec -T "$SERVICE" sh -c \
    "rm -rf /tmp/akwaan-dump && mongodump --db='${DB_NAME}' --out=/tmp/akwaan-dump --gzip --quiet"
  mkdir -p "${OUT_DIR}/dump"
  docker compose cp "${SERVICE}:/tmp/akwaan-dump/." "${OUT_DIR}/dump/"
  docker compose exec -T "$SERVICE" rm -rf /tmp/akwaan-dump
else
  mongodump --uri="$LOCAL_URI" --db="$DB_NAME" --out="${OUT_DIR}/dump" --gzip
fi

test -d "${OUT_DIR}/dump/${DB_NAME}" || {
  echo "Dump directory ${OUT_DIR}/dump/${DB_NAME} is missing — aborting before touching Atlas." >&2
  exit 1
}

echo
echo "==> Restoring into Atlas as ${DB_NAME}"
# Canonical dump-directory restore: point mongorestore at the directory that
# CONTAINS `${DB_NAME}/`, and select the namespace with --nsInclude.
#
# Two things have to be true together, and getting only one of them silently
# restores nothing:
#
#   1. --nsInclude instead of --db / --nsFrom / --nsTo. The old --nsFrom/--nsTo
#      pair here was an identity mapping that did nothing at all.
#   2. NO default database in the restore URI. A URI ending in /${DB_NAME} is
#      read as --db, which flips mongorestore into single-database mode. In that
#      mode a dump root is the wrong shape, so it logs
#          "don't know what to do with subdirectory `dump/${DB_NAME}`, skipping"
#      and exits reporting "0 document(s) restored successfully" — a success
#      exit code on a no-op. Adding --nsInclude does not rescue this; the
#      database has to come out of the URI.
#
# ATLAS_URI keeps /${DB_NAME} because the check above uses it to confirm intent,
# so the database is stripped here, for this one call.
#
# No --drop: the target is expected to be an empty new cluster, and refusing to
# drop means a mistargeted URI cannot destroy anything.
#
# No --preserveUUID: it is a boolean flag, so `--preserveUUID=false` is a parse
# error ("bool flag `--preserveUUID' cannot have an argument"), and Atlas M0
# does not permit UUID preservation anyway. Omitting it is the correct form.
restore_uri="$(printf '%s' "$ATLAS_URI" | sed -E "s#/${DB_NAME}(\?|$)#/\1#")"

mongorestore \
  --uri="$restore_uri" \
  --gzip \
  --nsInclude="${DB_NAME}.*" \
  --numInsertionWorkersPerCollection=2 \
  "${OUT_DIR}/dump"

echo
echo "==> Verify: Atlas counts"
mongosh "$ATLAS_URI" --quiet --eval '
  let total = 0;
  db.getCollectionNames().sort().forEach(c => {
    const n = db.getCollection(c).countDocuments();
    total += n;
    print(c.padEnd(36) + n);
  });
  print("TOTAL".padEnd(36) + total);
' | tr -d '\r' | tee "${OUT_DIR}/atlas-counts.txt"

echo
echo "==> Diff (empty means identical)"
if diff -u "${OUT_DIR}/local-counts.txt" "${OUT_DIR}/atlas-counts.txt"; then
  echo "Collection counts match."
else
  echo "Counts differ — investigate before pointing the backend at Atlas." >&2
  exit 1
fi

echo
echo "==> Index parity"
local_indexes="$(run_mongosh '
  let total = 0;
  db.getCollectionNames().forEach(c => total += db.getCollection(c).getIndexes().length);
  print(total);
' | tr -d '\r' | tail -1)"
atlas_indexes="$(mongosh "$ATLAS_URI" --quiet --eval '
  let total = 0;
  db.getCollectionNames().forEach(c => total += db.getCollection(c).getIndexes().length);
  print(total);
' | tr -d '\r' | tail -1)"
echo "    local indexes: ${local_indexes}"
echo "    atlas indexes: ${atlas_indexes}"
if [[ "$local_indexes" != "$atlas_indexes" ]]; then
  echo "Index counts differ — investigate before relying on query performance." >&2
  exit 1
fi

echo
echo "==> Representative records"
mongosh "$ATLAS_URI" --quiet --eval '
  print("worlds:       " + db.worlds.countDocuments());
  print("scopes:       " + db.scopes.countDocuments());
  print("contentItems: " + db.content_items.countDocuments());
  print("questions:    " + db.questions.countDocuments());
  print("admins:       " + db.users.countDocuments({ role: "admin" }));
  const orphanScopes = db.scopes.find().toArray()
    .filter(s => !db.worlds.findOne({ _id: s.worldId })).length;
  print("orphan scopes: " + orphanScopes);
  const q = db.questions.findOne({}, { question: 1, _id: 0 });
  print("sample question present: " + (q ? "yes" : "no"));
'

echo
echo "Dump kept at ${OUT_DIR}. Delete it once Atlas is verified — it contains real data."
