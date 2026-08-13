"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAdmin, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, isAuthenticated, isLoading, router]);

  if (isLoading)
    return <div className="text-center py-10">جاري التحقق من الصلاحيات...</div>;
  if (!isAuthenticated || !isAdmin) return null;

  return <>{children}</>;
}
