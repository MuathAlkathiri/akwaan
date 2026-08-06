"use client";

import Link from "next/link";
import { Compass, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
// The route only; importing the wizard itself would make worlds depend on setup.
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import { JourneyShell, JourneySection } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCard } from "./world-card";
import { usePlayableWorlds } from "../hooks/use-player-catalog";
import { playableWorlds, selectFeaturedWorlds } from "../utils/featured-worlds";

/**
 * The Akwaan home: a dashboard of Worlds, not a landing page.
 *
 * There is no promotional hero and no marketing call to action, because the
 * Worlds themselves are the call to action. The only thing above them is where
 * the player already was.
 */
export function WorldsHome() {
  const { user, isAuthenticated } = useAuth();
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];
  const featured = query.isSuccess ? selectFeaturedWorlds(query.data) : [];

  return (
    <JourneyShell>
      <div className="space-y-10">
        <Welcome name={user?.fullName} worldCount={worlds.length} />

        <Button asChild size="lg" className="rounded-2xl font-black shadow-[0_10px_30px_rgba(91,33,182,.2)]">
          <Link href={MATCH_SETUP_ROUTE}>
            <Play className="ml-2 h-5 w-5 fill-current" aria-hidden />
            ابدأ لعبة جديدة
          </Link>
        </Button>

        <JourneySection
          id="featured-worlds"
          title="عوالم مختارة"
          description="ابدأ من عالم جاهز، كل واحد بنطاقاته وتحدياته."
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
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((world, index) => (
                <WorldCard
                  key={world.id}
                  world={world}
                  featured
                  priority={index === 0}
                />
              ))}
            </div>
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

function Welcome({ name, worldCount }: { name?: string; worldCount: number }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-black text-[#15803D]">أكوان</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl">
          {name ? `أهلاً ${name}` : "أهلاً بك"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {worldCount
            ? `${worldCount} عالم بانتظاركم. اختر عالماً وابدأ.`
            : "اختر عالماً وابدأ الجلسة."}
        </p>
      </div>
      <Button
        asChild
        variant="outline"
        className="rounded-2xl border-primary/20 bg-white font-black text-primary hover:bg-primary/[0.06] hover:text-primary"
      >
        <Link href="#all-worlds">
          <Compass className="ml-2 h-4 w-4" aria-hidden="true" />
          تصفّح كل العوالم
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
          className={`animate-pulse rounded-3xl border border-black/[0.05] bg-white ${className ?? "h-52"}`}
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
    <div className="rounded-3xl border border-black/[0.06] bg-white p-10 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]">
      <p className="text-lg font-black text-slate-900">
        لا توجد عوالم متاحة بعد
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        سيظهر هنا كل عالم فور تفعيله.
      </p>
      {!isAuthenticated && (
        <Button asChild className="mt-6 rounded-2xl font-black">
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      )}
    </div>
  );
}
