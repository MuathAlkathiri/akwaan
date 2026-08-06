"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The surface every step of the player journey sits on.
 *
 * Home, World, Scope, and Board are one continuous space, so they share one
 * warm-white canvas and one width. Each screen only supplies its own content and
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
    <div className="min-h-[calc(100vh-5.5rem)] bg-[#fdfaf4] px-4 pb-20 pt-5 text-slate-900 sm:px-6 lg:px-8">
      <div className={cn("mx-auto max-w-7xl", className)}>
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
      <ol className="flex flex-wrap items-center gap-1 text-sm font-bold text-slate-500">
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
                  className="px-2 py-1 text-slate-900"
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!last && (
                <ChevronLeft
                  className="h-4 w-4 shrink-0 text-slate-300"
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
          <h2 id={id} className="text-2xl font-black text-slate-900">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-slate-500">
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
