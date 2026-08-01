export const TEAM_A_COLORS = ['blue', 'green', 'yellow'] as const;
export const TEAM_B_COLORS = ['red', 'orange', 'pink'] as const;
export const TEAM_COLORS = [...TEAM_A_COLORS, ...TEAM_B_COLORS] as const;

export type TeamColorKey = (typeof TEAM_COLORS)[number];

export const defaultTeamColor = (teamIndex: number): TeamColorKey =>
  teamIndex === 1 ? 'red' : 'blue';

export const isAllowedTeamColor = (
  teamIndex: number,
  color: string,
): color is TeamColorKey =>
  (teamIndex === 1 ? TEAM_B_COLORS : TEAM_A_COLORS).includes(color as never);
