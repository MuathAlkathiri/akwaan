"use client";

import { ReactNode } from "react";
import { RequireAdmin } from "@/components/auth/require-admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
