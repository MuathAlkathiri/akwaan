export const TEAM_COLOR_KEYS = [
  "blue",
  "green",
  "yellow",
  "red",
  "orange",
  "pink",
] as const;

export type TeamColorKey = (typeof TEAM_COLOR_KEYS)[number];

export interface TeamColorDefinition {
  key: TeamColorKey;
  labelAr: string;
  background: string;
  foreground: string;
  border: string;
  subtle: string;
  swatch: string;
}

export const TEAM_COLORS: Record<TeamColorKey, TeamColorDefinition> = {
  blue: {
    key: "blue",
    labelAr: "أزرق",
    background: "bg-blue-600",
    foreground: "text-blue-50",
    border: "border-blue-300/70",
    subtle: "bg-blue-500/15",
    swatch: "bg-blue-500",
  },
  green: {
    key: "green",
    labelAr: "أخضر",
    background: "bg-emerald-600",
    foreground: "text-emerald-50",
    border: "border-emerald-300/70",
    subtle: "bg-emerald-500/15",
    swatch: "bg-emerald-500",
  },
  yellow: {
    key: "yellow",
    labelAr: "أصفر",
    background: "bg-amber-400",
    foreground: "text-amber-950",
    border: "border-amber-200/80",
    subtle: "bg-amber-400/15",
    swatch: "bg-amber-400",
  },
  red: {
    key: "red",
    labelAr: "أحمر",
    background: "bg-red-600",
    foreground: "text-red-50",
    border: "border-red-300/70",
    subtle: "bg-red-500/15",
    swatch: "bg-red-500",
  },
  orange: {
    key: "orange",
    labelAr: "برتقالي",
    background: "bg-orange-500",
    foreground: "text-orange-50",
    border: "border-orange-200/70",
    subtle: "bg-orange-500/15",
    swatch: "bg-orange-500",
  },
  pink: {
    key: "pink",
    labelAr: "وردي",
    background: "bg-pink-600",
    foreground: "text-pink-50",
    border: "border-pink-300/70",
    subtle: "bg-pink-500/15",
    swatch: "bg-pink-500",
  },
};

export const TEAM_A_COLOR_OPTIONS = [
  TEAM_COLORS.blue,
  TEAM_COLORS.green,
  TEAM_COLORS.yellow,
];
export const TEAM_B_COLOR_OPTIONS = [
  TEAM_COLORS.red,
  TEAM_COLORS.orange,
  TEAM_COLORS.pink,
];

export const resolveTeamColor = (
  color: string | undefined,
  teamIndex: number,
): TeamColorDefinition =>
  TEAM_COLORS[color as TeamColorKey] ??
  TEAM_COLORS[teamIndex === 1 ? "red" : "blue"];
