"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { rememberPostAuthDestination } from "@/features/auth/navigation/post-auth-destination";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      rememberPostAuthDestination(pathname);
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) return <AkwaanLoader label="نتأكد من دخولك" line="ثواني بس" />;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
