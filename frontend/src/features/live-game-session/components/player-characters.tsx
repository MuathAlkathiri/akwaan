import type { ReactNode } from "react";

/**
 * The characters a player can be.
 *
 * Both teams wear one colour, so this shape is the whole of a player's identity
 * on the shared screen — which is why it has to survive being drawn at about
 * forty pixels across a living room. Every one of them is told apart by its
 * silhouette alone, not by a detail inside it.
 *
 * None of them is a face. There is no skin tone, no hair and no gender here:
 * nobody has to look for a character that resembles them, and nobody is handed
 * one that does not. They are cosmic objects, which is also what أكوان means.
 *
 * The keys are the contract with the server, which hands them out and refuses a
 * duplicate (`live-game-sessions/domain/player-avatars.ts`). `player-characters.test.tsx`
 * pins the two lists together.
 */
const OUTLINE = "#1A1B3D";
/** One outline weight and one shadow offset for the whole set. */
const STROKE = 4.5;
const SHADOW = 5;

export interface PlayerCharacter {
  label: string;
  fill: string;
  /** The silhouette, drawn twice: once as the shadow, once in its colour. */
  body: ReactNode;
  /** Eyes and features, drawn once on top so they stay crisp when small. */
  face: ReactNode;
}

export const PLAYER_CHARACTERS: Record<string, PlayerCharacter> = {
  astronaut: {
    label: "رائد",
    fill: "#FFFFFF",
    body: (
      <>
        <rect x="24" y="22" width="72" height="70" rx="26" />
        <rect x="46" y="92" width="28" height="12" rx="5" />
        <path d="M60 22V10" fill="none" />
        <circle cx="60" cy="7" r="5" />
      </>
    ),
    face: (
      <>
        <path
          d="M34 46 q26 -16 52 0 v16 q-26 14 -52 0z"
          fill="#9FB3C8"
          stroke="#1A1B3D"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="56" r="4.6" fill="#1A1B3D" />
        <circle cx="70" cy="56" r="4.6" fill="#1A1B3D" />
        <path
          d="M40 48 q10 -5 18 -2"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </>
    ),
  },
  alien: {
    label: "فضائي",
    fill: "#B49AE8",
    body: (
      <>
        <path d="M60 16c22 0 34 18 34 38 0 24-14 40-34 40S26 78 26 54c0-20 12-38 34-38z" />
        <path d="M40 22 32 6M80 22 88 6" fill="none" />
        <circle cx="31" cy="4" r="5" />
        <circle cx="89" cy="4" r="5" />
      </>
    ),
    face: (
      <>
        <ellipse
          cx="60"
          cy="54"
          rx="19"
          ry="16"
          fill="#FFFFFF"
          stroke="#1A1B3D"
          strokeWidth="4.5"
        />
        <circle cx="64" cy="56" r="8" fill="#1A1B3D" />
        <path
          d="M50.0 82 q10.0 11.0 20 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  robot: {
    label: "روبوت",
    fill: "#9FB3C8",
    body: (
      <>
        <rect x="24" y="28" width="72" height="66" rx="16" />
        <path d="M60 28V12" fill="none" />
        <circle cx="60" cy="9" r="5.5" />
        <rect x="12" y="50" width="12" height="24" rx="5" />
        <rect x="96" y="50" width="12" height="24" rx="5" />
      </>
    ),
    face: (
      <>
        <rect x="38" y="48" width="16" height="12" rx="4" fill="#1A1B3D" />
        <rect x="66" y="48" width="16" height="12" rx="4" fill="#1A1B3D" />
        <path
          d="M44 76h32"
          stroke="#1A1B3D"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  planet: {
    label: "كوكب",
    fill: "#E8B84B",
    body: (
      <>
        <circle cx="60" cy="58" r="34" />
        <ellipse
          cx="60"
          cy="58"
          rx="54"
          ry="17"
          transform="rotate(-20 60 58)"
          fill="none"
        />
      </>
    ),
    face: (
      <>
        <circle cx="49" cy="54" r="5.2" fill="#1A1B3D" stroke="none" />
        <circle cx="71" cy="54" r="5.2" fill="#1A1B3D" stroke="none" />
        <path
          d="M51.0 68 q9.0 9.9 18 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  star: {
    label: "نجمة",
    fill: "#E8B84B",
    body: (
      <>
        <path d="M60 12 73 44 108 47 81 69 90 103 60 85 30 103 39 69 12 47 47 44z" />
      </>
    ),
    face: (
      <>
        <circle cx="51" cy="56" r="5.2" fill="#1A1B3D" stroke="none" />
        <circle cx="69" cy="56" r="5.2" fill="#1A1B3D" stroke="none" />
        <path
          d="M52.0 70 q8.0 8.8 16 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  moon: {
    label: "هلال",
    fill: "#F7F4ED",
    body: (
      <>
        <path d="M78 14a46 46 0 1 0 14 72A38 38 0 0 1 78 14z" />
      </>
    ),
    face: (
      <>
        <circle cx="52" cy="50" r="5.2" fill="#1A1B3D" />
        <circle cx="72" cy="56" r="5.2" fill="#1A1B3D" />
        <path
          d="M52.5 68 q7.5 8.25 15 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  rocket: {
    label: "صاروخ",
    fill: "#E88BB7",
    body: (
      <>
        <path d="M60 10c16 14 24 32 24 52v18H36V62c0-20 8-38 24-52z" />
        <path d="M36 70 20 92h16zM84 70l16 22H84z" />
        <path d="M48 80h24l-6 22h-12z" />
      </>
    ),
    face: (
      <>
        <circle
          cx="60"
          cy="48"
          r="13"
          fill="#FFFFFF"
          stroke="#1A1B3D"
          strokeWidth="4.5"
        />
        <circle cx="56" cy="46" r="4.4" fill="#1A1B3D" />
        <circle cx="66" cy="46" r="4.4" fill="#1A1B3D" />
      </>
    ),
  },
  ufo: {
    label: "صحن",
    fill: "#C9D2E0",
    body: (
      <>
        <path d="M60 20c16 0 26 11 26 24H34c0-13 10-24 26-24z" />
        <path d="M16 48h88c0 14-20 22-44 22S16 62 16 48z" />
        <path d="M38 74v10M60 78v12M82 74v10" fill="none" />
      </>
    ),
    face: (
      <>
        <circle cx="50" cy="36" r="4.6" fill="#1A1B3D" />
        <circle cx="70" cy="36" r="4.6" fill="#1A1B3D" />
        <circle cx="34" cy="58" r="4" fill="#1A1B3D" />
        <circle cx="60" cy="60" r="4" fill="#1A1B3D" />
        <circle cx="86" cy="58" r="4" fill="#1A1B3D" />
      </>
    ),
  },
  comet: {
    label: "مذنّب",
    fill: "#E9A36A",
    body: (
      <>
        <circle cx="74" cy="46" r="26" />
        <path d="M52 62 14 100M60 70 26 104M44 54 10 82" fill="none" />
      </>
    ),
    face: (
      <>
        <circle cx="65" cy="43" r="4.8" fill="#1A1B3D" stroke="none" />
        <circle cx="83" cy="43" r="4.8" fill="#1A1B3D" stroke="none" />
        <path
          d="M66.5 57 q7.5 8.25 15 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  sun: {
    label: "شمس",
    fill: "#E9A36A",
    body: (
      <>
        <circle cx="60" cy="60" r="30" />
        <path
          d="M60 10v12M60 98v12M10 60h12M98 60h12M25 25l9 9M86 86l9 9M95 25l-9 9M34 86l-9 9"
          fill="none"
        />
      </>
    ),
    face: (
      <>
        <circle cx="50" cy="56" r="5.2" fill="#1A1B3D" stroke="none" />
        <circle cx="70" cy="56" r="5.2" fill="#1A1B3D" stroke="none" />
        <path
          d="M51.0 70 q9.0 9.9 18 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  satellite: {
    label: "قمر صناعي",
    fill: "#9FB3C8",
    body: (
      <>
        <rect x="42" y="34" width="36" height="52" rx="12" />
        <rect x="4" y="46" width="30" height="28" rx="6" />
        <rect x="86" y="46" width="30" height="28" rx="6" />
        <path d="M60 34V18" fill="none" />
        <circle cx="60" cy="14" r="5" />
      </>
    ),
    face: (
      <>
        <circle cx="54" cy="54" r="4.6" fill="#1A1B3D" />
        <circle cx="68" cy="54" r="4.6" fill="#1A1B3D" />
        <path
          d="M54.5 66 q6.5 7.15 13 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
  nebula: {
    label: "سديم",
    fill: "#E88BB7",
    body: (
      <>
        <path d="M38 36c-14 2-22 12-22 24s10 22 24 22c6 10 18 14 28 10 12 6 26 0 30-12 10-6 12-20 4-28-2-14-16-22-28-18-10-8-28-6-36 2z" />
      </>
    ),
    face: (
      <>
        <path
          d="M43 58 q5 -5.5 10 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M65 58 q5 -5.5 10 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M50.0 72 q9.0 9.9 18 0"
          fill="none"
          stroke="#1A1B3D"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </>
    ),
  },
};

export const PLAYER_CHARACTER_KEYS = Object.keys(PLAYER_CHARACTERS);

/**
 * One character, at any size.
 *
 * `title` is what a screen reader announces; without it the drawing is
 * decoration, which is right beside a name it would otherwise repeat.
 */
export function PlayerCharacterIcon({
  characterKey,
  size = 48,
  title,
}: {
  characterKey: string | undefined;
  size?: number;
  title?: string;
}) {
  const character = characterKey ? PLAYER_CHARACTERS[characterKey] : undefined;
  if (!character) return null;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-character={characterKey}
      className="flex-none"
    >
      <g
        transform={`translate(${SHADOW},${SHADOW})`}
        fill={OUTLINE}
        stroke={OUTLINE}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {character.body}
      </g>
      <g
        fill={character.fill}
        stroke={OUTLINE}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {character.body}
      </g>
      {character.face}
    </svg>
  );
}
