"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { rememberPostAuthDestination } from "@/features/auth/navigation/post-auth-destination";

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      rememberPostAuthDestination("/matches/new");
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading)
    return <div className="text-center py-10">جاري التحقق من الدخول...</div>;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
