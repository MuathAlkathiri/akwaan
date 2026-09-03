"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The surface every step of the player journey sits on.
 *
 * Home, World, Scope, and Board are one continuous space, so they share one
 * white canvas and one width. Each screen only supplies its own content and
 * the trail that got the player here.
 */
export function JourneyShell({
  trail,
  children,
  className,
}: {
  trail?: JourneyCrumb[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative min-h-[calc(100vh-5.5rem)] bg-transparent px-4 pb-20 pt-5 text-foreground sm:px-6 lg:px-8">
      <div className={cn("relative z-10 mx-auto max-w-7xl", className)}>
        {trail?.length ? <JourneyTrail trail={trail} /> : null}
        {children}
      </div>
    </div>
  );
}

export interface JourneyCrumb {
  label: string;
  href?: string;
}

/**
 * Where the player is, and one tap back to anywhere they have been. It is a
 * trail, not a progress bar: nothing here implies a required order.
 */
export function JourneyTrail({ trail }: { trail: JourneyCrumb[] }) {
  return (
    <nav aria-label="مسار التصفح" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm font-bold text-muted-foreground">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li
              key={`${crumb.label}-${index}`}
              className="flex items-center gap-1"
            >
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="rounded-lg px-2 py-1 transition hover:bg-primary/[0.07] hover:text-primary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="px-2 py-1 text-foreground"
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!last && (
                <ChevronLeft
                  className="h-4 w-4 shrink-0 text-border"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A section heading used identically on every journey screen. */
export function JourneySection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-2xl font-black text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A centred section title framed by two gold diamond flourishes. */
export function SectionHeading({
  id,
  title,
}: {
  id?: string;
  title: string;
}) {
  return (
    <div className="mb-7 flex items-center justify-center gap-3">
      <Flourish />
      <h2 id={id} className="text-2xl font-black text-foreground sm:text-3xl">
        {title}
      </h2>
      <Flourish flip />
    </div>
  );
}

function Flourish({ flip = false }: { flip?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center gap-1.5 text-[hsl(var(--brand-gold))]",
        flip && "flex-row-reverse",
      )}
    >
      <span className="h-px w-8 bg-gradient-to-l from-[hsl(var(--brand-gold))] to-transparent sm:w-12" />
      <span className="size-1.5 rotate-45 bg-[hsl(var(--brand-gold))]" />
    </span>
  );
}
