#!/usr/bin/env bash
#
# READ-ONLY report on gameplay runtimes that never reached a terminal status.
#
# Reads. Never writes. No update, no drop, no transition — running this cannot
# change a single document, which is the point: classification comes first and
# any cleanup is a separate, explicit, confirmed step.
#
#   deployment/scripts/diagnose-stale-runtimes.sh              # table
#   FORMAT=json deployment/scripts/diagnose-stale-runtimes.sh  # machine readable
#
# STALE_AFTER_HOURS (default 6) only labels rows; it never filters anything out.
#
set -euo pipefail

DB_NAME="${DB_NAME:-lammah-quiz}"
SERVICE="${SERVICE:-mongodb}"
STALE_AFTER_HOURS="${STALE_AFTER_HOURS:-6}"
FORMAT="${FORMAT:-table}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

docker compose exec -T "$SERVICE" mongosh --quiet "$DB_NAME" --eval "
const STALE_AFTER_MS = ${STALE_AFTER_HOURS} * 3600 * 1000;
const FORMAT = '${FORMAT}';
const now = new Date();

// Newest runtime per session. An older non-terminal runtime beneath a newer
// terminal one is history, not a live challenge.
const newest = db.gameplay_runtimes.aggregate([
  { \$sort: { sessionId: 1, createdAt: -1 } },
  { \$group: { _id: '\$sessionId', doc: { \$first: '\$\$ROOT' } } },
  { \$replaceRoot: { newRoot: '\$doc' } },
  { \$match: { status: { \$nin: ['completed', 'cancelled'] } } },
]).toArray();

const rows = newest.map((r) => {
  const st = r.state || {};
  const round = st.activeRound;
  const interaction = round && round.interaction;
  const deadline = interaction && interaction.prompt && interaction.prompt.deadlineAt
    ? new Date(interaction.prompt.deadlineAt)
    : (typeof st.runtimeState?.deadlineAt === 'string'
        ? new Date(st.runtimeState.deadlineAt) : null);
  const ageMs = now - new Date(r.createdAt);
  const session = db.live_game_sessions.findOne({ sessionId: r.sessionId })
    || db.live_game_sessions.findOne({ _id: r.sessionId });
  const sessionStatus = session ? session.status : 'missing';

  // Only two things make a runtime *obviously* stale, and both must hold:
  // it is older than the window, and nothing about it is still live — the
  // session is over or gone, or its deadline lapsed long ago. Anything else
  // is reported and left explicitly unclassified rather than guessed at.
  const deadlinePassedLongAgo = deadline !== null && (now - deadline) > STALE_AFTER_MS;
  const sessionOver = ['finished', 'cancelled', 'expired', 'missing'].includes(String(sessionStatus));
  const old = ageMs > STALE_AFTER_MS;
  const classification = !old
    ? 'recent-do-not-touch'
    : (sessionOver ? 'stale-session-over'
      : (deadlinePassedLongAgo ? 'stale-deadline-lapsed' : 'unclassified-review-manually'));

  return {
    sessionId: r.sessionId,
    runtimeId: r.runtimeId,
    mechanic: r.modeKey,
    runtimeStatus: r.status,
    roundStatus: round ? round.status : null,
    interactionStatus: interaction ? interaction.status : null,
    deadlineAt: deadline ? deadline.toISOString() : null,
    ageHours: Math.round(ageMs / 3600000),
    sessionStatus: String(sessionStatus),
    classification,
  };
});

if (FORMAT === 'json') { print(JSON.stringify(rows, null, 2)); } else {
  print('sessionId                             runtimeId  mechanic                  rt-status     round   interaction  age(h)  session    classification');
  rows.sort((a, b) => b.ageHours - a.ageHours).forEach((r) => {
    print(
      String(r.sessionId).padEnd(38) +
      String(r.runtimeId).slice(0, 8).padEnd(11) +
      String(r.mechanic).padEnd(26) +
      String(r.runtimeStatus).padEnd(14) +
      String(r.roundStatus).padEnd(8) +
      String(r.interactionStatus).padEnd(13) +
      String(r.ageHours).padStart(6) + '  ' +
      String(r.sessionStatus).padEnd(11) +
      r.classification);
  });
  print('');
  const counts = {};
  rows.forEach((r) => { counts[r.classification] = (counts[r.classification] || 0) + 1; });
  print('total blocked sessions: ' + rows.length);
  Object.entries(counts).forEach(([k, v]) => print('   ' + k.padEnd(30) + v));
  const byMechanic = {};
  rows.forEach((r) => { byMechanic[r.mechanic] = (byMechanic[r.mechanic] || 0) + 1; });
  print('by mechanic:');
  Object.entries(byMechanic).forEach(([k, v]) => print('   ' + k.padEnd(30) + v));
  print('');
  print('READ-ONLY. Nothing was modified.');
}
"
