import { GameplaySessionEffect } from '../domain/gameplay-mode.plugin';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';

export function applyGameplaySessionEffects(
  effects: readonly GameplaySessionEffect[],
  session: LiveGameSession,
  now: Date,
): boolean {
  let changed = false;
  for (const effect of effects) {
    if (effect.type === 'emit-runtime-event') continue;
    changed = true;
    if (effect.type === 'switch-active-team') {
      session.switchTurn(effect.teamId || undefined, effect.reason, now);
    } else if (effect.type === 'adjust-active-team-time') {
      session.adjustActiveTeamTime(effect.deltaMs, now);
    } else if (effect.type === 'stop-active-turn') {
      session.endTurn(effect.reason, now);
    } else if (effect.type === 'finish-live-session') {
      const loserId = session.serialize().activeTeamId;
      session.finish(
        effect.reason,
        otherTeam(session.serialize(), loserId),
        undefined,
        now,
      );
    } else if (effect.type === 'start-team-turn') {
      session.startTurn(effect.teamId, effect.reason, now);
    } else if (effect.type === 'pause-active-turn') {
      session.pauseTurn(now);
    } else if (effect.type === 'resume-active-turn') {
      session.resumeTurn(now);
    }
  }
  return changed;
}

function otherTeam(
  state: LiveGameSessionState,
  excluded?: string,
): string | undefined {
  return state.teams.find((team) => team.active && team.id !== excluded)?.id;
}
