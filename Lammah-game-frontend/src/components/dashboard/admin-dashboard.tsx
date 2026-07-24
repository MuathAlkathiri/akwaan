"use client";

import Link from "next/link";
import {
  Boxes,
  ClipboardList,
  Gamepad2,
  LayoutDashboard,
  ListChecks,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUsers } from "@/features/users";
import { useCatalogs } from "@/features/catalogs";
import { useCategories } from "@/features/categories";
import { useGames } from "@/features/games";
import { useQuestions } from "@/features/questions";
import { formatDate, getEntityId, getStatusLabel } from "@/lib/utils";
import { DashboardCard } from "./dashboard-card";
import { StatsCard } from "./stats-card";
import { adminNavigation } from "@/config/admin-navigation";

const managementCards = adminNavigation.filter((item) => item.showOnDashboard);

export function AdminDashboard() {
  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const { data: games } = useGames();
  const { data: catalogs } = useCatalogs();
  const { data: categories } = useCategories();
  const { data: questions } = useQuestions();
  const { data: users } = useUsers();

  const recentGames = (games || []).slice(0, 4);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Admin only
            </div>
            <p className="text-sm font-black text-primary">غرفة التحكم</p>
            <h1 className="mt-2 text-4xl font-black leading-tight md:text-5xl">
              Admin Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              لوحة عملية لإدارة الألعاب والفئات والأسئلة ومراجعة المحتوى المولد.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatsCard
          label="Total games"
          value={games?.length ?? 0}
          icon={Gamepad2}
        />
        <StatsCard
          label="Total catalogs"
          value={catalogs?.length ?? 0}
          icon={Boxes}
        />
        <StatsCard
          label="Total categories"
          value={categories?.length ?? 0}
          icon={Boxes}
        />
        <StatsCard
          label="Total questions"
          value={questions?.length ?? 0}
          icon={ClipboardList}
        />
        <StatsCard
          label="Users"
          value={users?.length ?? 0}
          icon={Users}
          helper="مدعوم عبر الاشتراكات"
        />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-primary">
              Admin-only shortcuts
            </p>
            <h2 className="text-2xl font-black">Management</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {managementCards.map((card) => (
            <DashboardCard
              key={card.href}
              title={card.dashboardTitle ?? card.label}
              description={card.dashboardDescription ?? ""}
              href={card.href}
              icon={card.icon}
              tone="admin"
              badge="Admin"
            />
          ))}
        </div>
      </section>

      {!!recentGames.length && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-black">
              <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentGames.map((game) => (
              <Link
                key={getEntityId(game)}
                href={`/games/${getEntityId(game)}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-primary/35 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-black">{game.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    آخر تحديث: {formatDate(game.updatedAt || game.createdAt)}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/10 px-3 py-1 text-xs font-black text-muted-foreground">
                  {getStatusLabel(game.status)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
