"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
// The route only; importing the wizard itself would make worlds depend on setup.
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import { JourneyShell, JourneySection } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCard } from "./world-card";
import { FeaturedWorldsCarousel } from "./featured-worlds-carousel";
import { usePlayableWorlds } from "../hooks/use-player-catalog";
import { playableWorlds, selectFeaturedWorlds } from "../utils/featured-worlds";

/**
 * The Akwaan home: a dashboard of Worlds, not a landing page.
 *
 * The hero names the one action the product is asking for; the Worlds directly
 * below it provide the visual discovery layer.
 */
export function WorldsHome() {
  const { isAuthenticated } = useAuth();
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];
  const featured = query.isSuccess ? selectFeaturedWorlds(query.data) : [];

  return (
    <JourneyShell>
      <div className="space-y-10">
        <Welcome />

        <JourneySection
          id="featured-worlds"
          title="عوالم مختارة"
          description="ثلاثة عوالم جاهزة لاكتشافها."
        >
          {query.isLoading ? (
            <CardSkeletons count={3} className="h-72" columns="featured" />
          ) : query.isError ? (
            <JourneyError
              title="تعذر تحميل العوالم"
              description={
                isAuthenticated
                  ? "تحقّق من اتصالك ثم حاول مرة أخرى."
                  : "سجّل دخولك لعرض العوالم المتاحة."
              }
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : featured.length ? (
            <FeaturedWorldsCarousel worlds={featured} />
          ) : (
            <EmptyWorlds isAuthenticated={isAuthenticated} />
          )}
        </JourneySection>

        {worlds.length > 0 && (
          <JourneySection
            id="all-worlds"
            title="كل العوالم"
            description="اختر العالم الذي يناسب جلستكم."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {worlds.map((world) => (
                <WorldCard key={world.id} world={world} />
              ))}
            </div>
          </JourneySection>
        )}
      </div>
    </JourneyShell>
  );
}

function Welcome() {
  return (
    <header className="mx-auto max-w-2xl py-3 text-center sm:py-5">
      <h1 className="text-3xl font-black text-foreground sm:text-4xl">
        اختر عالمك وابدأ التحدي
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
        عوالم مختلفة، تحديات مختلفة، وكل مباراة لها قصتها.
      </p>
      <Button
        asChild
        size="lg"
        className="mt-6 rounded-[var(--radius)] font-black shadow-[0_10px_30px_hsl(var(--primary)/0.2)]"
      >
        <Link href={MATCH_SETUP_ROUTE}>
          <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
          ابدأ مباراة جديدة
        </Link>
      </Button>
    </header>
  );
}

export function CardSkeletons({
  count,
  className,
  columns = "grid",
}: {
  count: number;
  className?: string;
  columns?: "featured" | "grid";
}) {
  return (
    <div
      className={
        columns === "featured"
          ? "grid gap-5 md:grid-cols-2 lg:grid-cols-3"
          : "grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4"
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`animate-pulse rounded-3xl border border-border bg-card ${className ?? "h-52"}`}
        />
      ))}
    </div>
  );
}

/**
 * The *true* empty state: the request succeeded and there is nothing to play
 * yet. A failed request is never shown here — it gets `JourneyError`, because a
 * failure the player cannot tell from "no content" hides a real defect.
 */
export function EmptyWorlds({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]">
      <p className="text-lg font-black text-foreground">
        لا توجد عوالم متاحة بعد
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        سيظهر هنا كل عالم فور تفعيله.
      </p>
      {!isAuthenticated && (
        <Button asChild className="mt-6 rounded-[var(--radius)] font-black">
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      )}
    </div>
  );
}
