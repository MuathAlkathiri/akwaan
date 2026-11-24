"use client";

import { useMemo } from "react";
import { Check, Loader2 } from "lucide-react";
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
 * The World's ring: a pale band with one purple line through it.
 *
 * Flat on purpose. The identity has no gradients and no glow, and purple is
 * its decoration colour — gold is kept for what the game is saying. Two of
 * these are stacked and clipped to halves, which is what puts the planet
 * inside the ring instead of in front of a picture of one.
 */
function OrbitRing() {
  return (
    <svg viewBox="0 0 356 356" className="absolute inset-0 size-full overflow-visible">
      <circle cx="178" cy="178" r="172" fill="none" stroke="#E3DCF6" strokeWidth="14" />
      <circle
        cx="178"
        cy="178"
        r="172"
        fill="none"
        stroke="hsl(var(--brand-purple))"
        strokeWidth="4"
      />
    </svg>
  );
}

/**
 * Which team a finished challenge went to; a draw belongs to neither.
 *
 * Exported because the dashes under the orbit answer the same question, and
 * they used to answer it differently: a `reduce` that keeps the first highest
 * score hands a drawn challenge to whichever team the array happened to list
 * first, and a team's colour then appears on this board for something it did
 * not win.
 */
export function winnerOf(position: UnifiedBoardPosition): string | undefined {
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
        : blockedReason
          ? "مقفل الحين"
          : "جاهز للاختيار";

  // Whatever is worth hovering: why it cannot be played, or why nothing can be
  // picked right now. The old tile printed this under the icon; here it is the
  // title and the accessible name, because twelve copies of one board-level
  // sentence is what made this screen unreadable.
  const hint = reason?.detail ?? blockedReason;

  const body = (
    <>
      <span
        className={cn(
          "relative grid aspect-square w-[45%] place-items-center rounded-full border-4 border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
          // The shell is a transparent box, so the ring goes on the disc: a
          // keyboard user needs to see which circle they are on.
          "group-focus-visible:ring-4 group-focus-visible:ring-[hsl(var(--brand-purple))] group-focus-visible:ring-offset-2",
          // Gold is game state: this one is done. Whose it is rides on the
          // corner as a dot, never as the circle's own colour.
          completed && "bg-[hsl(var(--brand-gold))]",
          inProgress && "bg-[#E3DAF6]",
          unplayable &&
            "border-[hsl(var(--brand-navy)/.22)] bg-muted shadow-none",
          interactive && "transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none",
        )}
      >
        {pending ? (
          // Only a tap in flight spins. An in-progress challenge keeps its own
          // icon: the circles are what the host aims at and the room reads, so
          // they hold still, and a spinner here also hid which of the twelve
          // was actually running.
          <Loader2 className="size-[44%] animate-spin motion-reduce:animate-none" aria-hidden />
        ) : completed ? (
          <Check className="size-[46%]" strokeWidth={3} aria-label="مكتمل" />
        ) : (
          <Icon
            className={cn("size-[44%]", unplayable && "text-disabled-foreground")}
            aria-hidden
          />
        )}
        {completed && owner && (
          <span
            aria-hidden
            data-testid="position-winner-dot"
            className={cn(
              "absolute -top-1 end-[-4px] size-[26%] rounded-full border-[3px] border-[hsl(var(--brand-navy))]",
              completed && owner && owner.dot,
            )}
          />
        )}
      </span>
      <span
        className={cn(
          "text-sm font-bold whitespace-nowrap sm:text-base xl:text-[19px]",
          completed && "text-brand-slate",
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
        className={cn(shell, "cursor-pointer focus-visible:outline-none")}
        disabled={pending}
        aria-label={`${position.challengeName} — ${state}`}
        {...(hint ? { title: hint } : {})}
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
      {...(hint ? { title: hint } : {})}
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
          stroke="#DDD6F3"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 9"
        />
      </svg>

      {/* The band is one ring drawn twice: the half behind the planet, then the
          half in front of it. That is the whole trick of the depth — nothing
          here is a picture of a ring, it is a ring the planet sits inside. */}
      <div
        aria-hidden
        className="absolute top-[49%] left-1/2 z-0 aspect-square w-[89%] [clip-path:inset(-20%_-20%_50%_-20%)] [transform:translate(-50%,-50%)_rotate(-14deg)_scaleY(.326)]"
      >
        <OrbitRing />
      </div>

      {/* Two spans, not one: the centring translate and the drift are both
          transforms, and an animation on the same element would throw the
          planet off centre the moment it ran. */}
      <span className="absolute top-[49%] left-1/2 z-10 aspect-square w-[37.5%] -translate-x-1/2 -translate-y-1/2">
        <span
          className="akwaan-planet-drift relative block size-full overflow-hidden rounded-full bg-[#F1DCEC]"
          style={{ animationDelay: `${-seed * 2.3}s` }}
        >
          {artwork ? (
            // Zoomed onto the World's own planet. A World's picture is a
            // planet drawn in the middle of a light sky, so a plain crop
            // leaves a pale rim inside the circle and the whole thing reads
            // as a square photo in a sticker. 1.35 fills the circle with the
            // planet on the art we have without cutting into what is drawn
            // on it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artwork}
              alt=""
              className="size-full object-cover [transform:scale(1.35)_translateY(2%)]"
            />
          ) : (
            <span className="font-display grid size-full place-items-center p-3 text-center text-sm font-black text-[hsl(var(--brand-navy)/.65)]">
              {worldName}
            </span>
          )}
        </span>
      </span>

      <div
        aria-hidden
        className="absolute top-[49%] left-1/2 z-[15] aspect-square w-[89%] [clip-path:inset(50%_-20%_-20%_-20%)] [transform:translate(-50%,-50%)_rotate(-14deg)_scaleY(.326)]"
      >
        <OrbitRing />
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
