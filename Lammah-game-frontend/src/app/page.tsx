"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { AdminDashboard, UserDashboard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { isAdmin, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="py-12 text-center">جاري تجهيز لوحة التحكم...</div>;
  }

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (isAuthenticated) {
    return <UserDashboard />;
  }

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-primary/15 via-white/[0.06] to-secondary/30 p-8 text-center shadow-2xl shadow-black/30 md:p-14">
        <div className="floaty mx-auto mb-6 grid h-24 w-24 place-items-center rounded-[2rem] bg-primary text-5xl shadow-2xl shadow-primary/25">
          🍉
        </div>
        <h1 className="text-5xl font-black leading-tight md:text-7xl">
          لمّة الأسئلة
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-2xl">
          لعبة أسئلة جماعية محلية للجلسات والتحديات السريعة بين الفرق.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login">
            <Button size="lg">ابدأ لعبة جديدة</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              ألعابي
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
