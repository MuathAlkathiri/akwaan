"use client";

import { RequireAuth } from "@/components/auth/require-auth";
import { UserDashboard } from "@/components/dashboard";

/**
 * The classic six-category picker that used to be the home page.
 *
 * The home page is World-first now, but the classic game still starts from six
 * categories, so the picker keeps its own route instead of disappearing.
 */
export default function ClassicCategorySelectionPage() {
  return (
    <RequireAuth>
      <UserDashboard />
    </RequireAuth>
  );
}
