"use client";

import { useMemo } from "react";
import { Check, Loader2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { teamIdentityOf } from "@/lib/team-identity";
import { challengeIcon } from "../challenge-identity";
import { unavailableReasons } from "../presentation";
import type { MatchTeamStanding, UnifiedBoardPosition } from "../types";

/**
 * A World as a planet, with its four challenges on the orbit around it.
 *
 * Everything here is a fraction of one square box, so the system scales with
 * its column instead of pinning itself to a pixel size. The geometry is the
 * agreed one: an orbit tilted 14°, the planet at its centre, and the four
 * challenges sitting *on* the orbit line — two on each side — rather than near
 * it, because a ring that misses the things it is drawn for reads as
 * decoration that slipped.
 */

/** Half-axes of the orbit, as a share of the box. */
const ORBIT = { x: 44, y: 37.5, tiltDeg: -14 };
const CENTRE = { x: 50, y: 49 };

/** Where each slot sits, right to left, and which side its name takes. */
const SLOT_ANGLES = [-40, -140, 40, 140] as const;

function onOrbit(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  const t = (ORBIT.tiltDeg * Math.PI) / 180;
  const x = Math.cos(a) * ORBIT.x;
  const y = Math.sin(a) * ORBIT.y;
  return {
    left: `${(CENTRE.x + x * Math.cos(t) - y * Math.sin(t)).toFixed(2)}%`,
    top: `${(CENTRE.y + x * Math.sin(t) + y * Math.cos(t)).toFixed(2)}%`,
    // The two above the planet carry their name above the disc, so no label
    // ever sits over the artwork.
    labelAbove: angleDeg < 0,
  };
}

const SLOT_PLACES = SLOT_ANGLES.map(onOrbit);

/**
 * The dust in the galaxy's band.
 *
 * Deterministic from the station number: random points would be redrawn on
 * every render and make the whole board twitch. Each grain is an ellipse
 * turned along the band, which is what makes a ring of dots read as a sweep
 * of dust rather than as a dotted line.
 */
const DUST_COLOURS = ["#12153F", "#2A2F9A", "#7C6CF0"] as const;
const dustCache = new Map<number, ReturnType<typeof buildDust>>();

function buildDust(seed: number) {
  const noise = (index: number, salt: number) =>
    Math.abs((Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453) % 1);
  return Array.from({ length: 64 }, (_, index) => {
    const angle = noise(index, seed) * Math.PI * 2;
    const radius = 150 + noise(index, seed + 4) * 52;
    const x = 178 + Math.cos(angle) * radius;
    const y = 178 + Math.sin(angle) * radius;
    const shade = noise(index, seed + 1);
    return {
      x,
      y,
      rx: 0.7 + noise(index, seed + 7) * 1.3,
      ry: 2 + noise(index, seed + 7) * 3.6,
      turn: (angle * 180) / Math.PI + 90,
      fill: DUST_COLOURS[shade > 0.66 ? 2 : shade > 0.33 ? 1 : 0],
      opacity: 0.45 + noise(index, seed + 2) * 0.5,
    };
  });
}

function dustFor(seed: number) {
  const held = dustCache.get(seed);
  if (held) return held;
  const made = buildDust(seed);
  dustCache.set(seed, made);
  return made;
}

/** One sweep of the galaxy band. Two of these are stacked, clipped to halves. */
function GalaxyBand({ seed, gradientId }: { seed: number; gradientId: string }) {
  const dust = dustFor(seed);
  return (
    <div className="akwaan-galaxy absolute inset-0">
      <svg viewBox="0 0 356 356" className="size-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#141A52" />
            <stop offset=".45" stopColor="#5A3FD0" />
            <stop offset=".75" stopColor="#1E2A8A" />
            <stop offset="1" stopColor="#0D1038" />
          </linearGradient>
        </defs>
        <circle
          cx="178"
          cy="178"
          r="174"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="24"
          opacity=".34"
        />
        <circle
          cx="178"
          cy="178"
          r="176"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="4"
        />
        <circle
          cx="178"
          cy="178"
          r="160"
          fill="none"
          stroke="#8E9BFF"
          strokeWidth="2.5"
          opacity=".55"
        />
        {dust.map((grain, index) => (
          <ellipse
            key={index}
            cx={grain.x.toFixed(1)}
            cy={grain.y.toFixed(1)}
            rx={grain.rx.toFixed(1)}
            ry={grain.ry.toFixed(1)}
            transform={`rotate(${grain.turn.toFixed(0)} ${grain.x.toFixed(1)} ${grain.y.toFixed(1)})`}
            fill={grain.fill}
            opacity={grain.opacity.toFixed(2)}
          />
        ))}
      </svg>
    </div>
  );
}

/** Which team a finished challenge went to; a draw belongs to neither. */
function winnerOf(position: UnifiedBoardPosition): string | undefined {
  const scores = position.scoreSummary ?? [];
  if (scores.length === 0) return undefined;
  const best = Math.max(...scores.map((score) => score.signedTotal));
  const leaders = scores.filter((score) => score.signedTotal === best);
  return leaders.length === 1 ? leaders[0].teamId : undefined;
}

function OrbitNode({
  position,
  place,
  canSelect,
  blockedReason,
  pending,
  standings,
  onSelect,
  onResume,
}: {
  position: UnifiedBoardPosition;
  place: (typeof SLOT_PLACES)[number];
  canSelect: boolean;
  blockedReason?: string;
  pending: boolean;
  standings: MatchTeamStanding[];
  onSelect: (position: UnifiedBoardPosition) => void;
  onResume: () => void;
}) {
  const completed = position.status === "completed";
  const inProgress = position.status === "in_progress";
  const unplayable =
    position.status === "unavailable" ||
    position.launchability !== "launchable";
  const reason = unplayable
    ? unavailableReasons[
        position.unavailableReason ?? "launcher_not_implemented"
      ]
    : undefined;
  const Icon = challengeIcon(position.challengeKey);
  const interactive = canSelect || inProgress;

  const ownerTeamId = completed ? winnerOf(position) : undefined;
  const owner = ownerTeamId
    ? teamIdentityOf(
        ownerTeamId,
        standings.map((team) => ({ id: team.teamId })),
      )
    : undefined;
  const ownerName = ownerTeamId
    ? standings.find((team) => team.teamId === ownerTeamId)?.name
    : undefined;

  // What the circle's colour cannot say on its own, said in the accessible
  // name: who took it and for how much. The board shows the owner as colour
  // and the tally as dashes; printing the numbers under twelve circles is how
  // this screen became unreadable the first time.
  const tally = (position.scoreSummary ?? [])
    .map(
      (score) =>
        `${standings.find((team) => team.teamId === score.teamId)?.name ?? "فريق"} ${score.displayTotal}`,
    )
    .join(" · ");
  const state = completed
    ? ownerName
      ? `مكتمل · ${ownerName}${tally ? ` · ${tally}` : ""}`
      : `مكتمل · تعادل${tally ? ` · ${tally}` : ""}`
    : inProgress
      ? "قيد اللعب"
      : unplayable
        ? (reason?.detail ?? reason?.label ?? "غير متاح")
        : "جاهز للاختيار";

  const body = (
    <>
      <span
        className={cn(
          "relative grid aspect-square w-[45%] place-items-center rounded-full border-[2.5px] border-[hsl(var(--brand-navy))] bg-white shadow-[0_4px_0_hsl(var(--brand-navy))]",
          completed && owner && owner.solid,
          completed && !owner && "bg-[hsl(var(--brand-navy))] text-white",
          inProgress && "bg-[hsl(var(--brand-gold))]",
          unplayable &&
            "border-[hsl(var(--brand-navy)/.22)] bg-muted shadow-none",
          interactive && "transition-transform group-hover:-translate-y-0.5",
        )}
      >
        {pending || inProgress ? (
          <Loader2 className="size-[44%] animate-spin" aria-hidden />
        ) : (
          <Icon
            className={cn("size-[44%]", unplayable && "text-disabled-foreground")}
            aria-hidden
          />
        )}
        {completed ? (
          <span className="absolute -top-1.5 end-[-6px] grid size-[38%] place-items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))]">
            <Check className="size-[55%]" aria-label="مكتمل" />
          </span>
        ) : position.requiresPhones ? (
          <span className="absolute -top-1.5 end-[-6px] grid size-[38%] place-items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))]">
            <Smartphone className="size-[50%]" aria-label="يحتاج جوالات" />
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-xs font-black whitespace-nowrap sm:text-[0.8rem]",
          unplayable && "text-disabled-foreground",
        )}
      >
        {position.challengeName}
      </span>
    </>
  );

  const data = {
    "data-testid": `unified-position-${position.positionKey}`,
    "data-status": position.status,
    "data-challenge-key": position.challengeKey,
    "data-position-status": position.status,
    "data-launchability": position.launchability,
  } as const;

  const shell = cn(
    "group absolute z-20 flex w-[27%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 border-0 bg-transparent p-0",
    place.labelAbove && "flex-col-reverse",
  );

  if (interactive) {
    return (
      <button
        type="button"
        {...data}
        style={{ left: place.left, top: place.top }}
        className={cn(shell, "cursor-pointer")}
        disabled={pending}
        aria-label={`${position.challengeName} — ${state}`}
        {...(blockedReason ? { title: blockedReason } : {})}
        onClick={() => (inProgress ? onResume() : onSelect(position))}
      >
        {body}
      </button>
    );
  }

  return (
    <article
      {...data}
      style={{ left: place.left, top: place.top }}
      className={shell}
      aria-label={`${position.challengeName} — ${state}`}
      {...(reason?.detail ? { title: reason.detail } : {})}
    >
      {body}
    </article>
  );
}

export function WorldOrbit({
  seed,
  worldName,
  artworkUrl,
  positions,
  canSelect,
  blockedReason,
  pendingKey,
  standings,
  onSelect,
  onResume,
}: {
  seed: number;
  worldName: string;
  artworkUrl?: string;
  positions: UnifiedBoardPosition[];
  canSelect: (position: UnifiedBoardPosition) => boolean;
  blockedReason: (position: UnifiedBoardPosition) => string | undefined;
  pendingKey?: string;
  standings: MatchTeamStanding[];
  onSelect: (position: UnifiedBoardPosition) => void;
  onResume: () => void;
}) {
  const artwork = useMemo(
    () => (artworkUrl ? getMediaUrl(artworkUrl) : undefined),
    [artworkUrl],
  );
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[25rem]">
      {/* The path the four challenges stand on, drawn once and still, so the
          eye has something to read the arrangement against while the galaxy
          turns behind it. */}
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="absolute inset-0 size-full overflow-visible"
      >
        <ellipse
          cx="200"
          cy="196"
          rx="176"
          ry="150"
          transform="rotate(-14 200 196)"
          fill="none"
          stroke="hsl(var(--brand-navy)/.16)"
          strokeWidth="1"
          strokeDasharray="2 7"
        />
      </svg>

      {/* The band is one ring drawn twice: the half behind the planet, then the
          half in front of it. That is the whole trick of the depth — nothing
          here is a picture of a ring, it is a ring the planet sits inside. */}
      <div
        aria-hidden
        className="absolute top-[49%] left-1/2 z-0 aspect-square w-[89%] -translate-x-1/2 -translate-y-1/2 [clip-path:inset(-20%_-20%_50%_-20%)] [transform:translate(-50%,-50%)_rotate(-14deg)_scaleY(.326)]"
      >
        <GalaxyBand seed={seed} gradientId={`galaxy-back-${seed}`} />
      </div>

      {/* Two spans, not one: the centring translate and the drift are both
          transforms, and an animation on the same element would throw the
          planet off centre the moment it ran. */}
      <span className="absolute top-[49%] left-1/2 z-10 aspect-square w-[37.5%] -translate-x-1/2 -translate-y-1/2">
        <span
          className="akwaan-planet-drift relative block size-full overflow-hidden rounded-full shadow-[0_0_0_3px_#fff,0_0_0_4px_hsl(var(--brand-navy)/.12),0_18px_34px_-16px_hsl(var(--brand-navy)/.55)]"
          style={{ animationDelay: `${-seed * 2.3}s` }}
        >
          {artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            // Zoomed onto the World's own planet. A World's picture is a
            // planet drawn in the middle of a light sky, so a plain crop
            // leaves a pale rim inside the circle and the whole thing reads
            // as a square photo in a sticker. 1.35 fills the circle with the
            // planet on the art we have without cutting into what is drawn
            // on it.
            <img
              src={artwork}
              alt=""
              className="size-full scale-[1.35] object-cover [transform:scale(1.35)_translateY(2%)]"
            />
          ) : (
            <span className="font-display grid size-full place-items-center bg-[hsl(var(--brand-gold)/.14)] p-3 text-center text-sm font-black text-[hsl(var(--brand-navy)/.65)]">
              {worldName}
            </span>
          )}
          {/* Light from the top left and a darkened limb: what turns a flat
              illustration into something spherical. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: [
                "radial-gradient(circle at 30% 24%, rgba(255,255,255,.22), transparent 45%)",
                "radial-gradient(circle, transparent 66%, rgba(10,12,40,.28) 100%)",
              ].join(","),
            }}
          />
        </span>
      </span>

      <div
        aria-hidden
        className="absolute top-[49%] left-1/2 z-[15] aspect-square w-[89%] -translate-x-1/2 -translate-y-1/2 [clip-path:inset(50%_-20%_-20%_-20%)] [transform:translate(-50%,-50%)_rotate(-14deg)_scaleY(.326)]"
      >
        <GalaxyBand seed={seed} gradientId={`galaxy-front-${seed}`} />
      </div>

      {positions.map((position, index) => (
        <OrbitNode
          key={position.positionKey}
          position={position}
          place={SLOT_PLACES[index % SLOT_PLACES.length]}
          canSelect={canSelect(position)}
          {...(blockedReason(position)
            ? { blockedReason: blockedReason(position) }
            : {})}
          pending={pendingKey === position.positionKey}
          standings={standings}
          onSelect={onSelect}
          onResume={onResume}
        />
      ))}
    </div>
  );
}
