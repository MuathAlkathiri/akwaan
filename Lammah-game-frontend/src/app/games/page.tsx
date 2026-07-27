"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequireAuth } from "@/components/auth/require-auth";
import { useAuth } from "@/components/auth/auth-provider";
import { GamesList } from "@/features/games";
import { PageHeader } from "@/components/shared";

export default function GamesPage() {
  const { user } = useAuth();
  const canUseFreeGame = (user?.freeGamesUsed || 0) === 0;
  const hasActiveSubscription = user?.subscriptionStatus === "active";

  return (
    <RequireAuth>
      <div className="space-y-8">
        <PageHeader
          title="ألعابي"
          description="جاهز للتحدي؟ تابع ألعابك أو ابدأ لعبة جديدة."
          actions={
            <Button asChild size="lg">
              <Link href="/games/new">لعبة جديدة</Link>
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">
              الألعاب المجانية المستخدمة: {user?.freeGamesUsed ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">
              حالة الاشتراك: {user?.subscriptionStatus || "none"}
            </p>
            {canUseFreeGame && (
              <p className="text-primary">عندك لعبة مجانية واحدة</p>
            )}
            {!canUseFreeGame && !hasActiveSubscription && (
              <p className="text-destructive">تحتاج اشتراك لإنشاء لعبة جديدة</p>
            )}
          </CardContent>
        </Card>

        <GamesList />
      </div>
    </RequireAuth>
  );
}
