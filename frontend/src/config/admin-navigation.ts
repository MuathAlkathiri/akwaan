import { LayoutDashboard, ScanSearch, Users, Network } from "lucide-react";
import { LucideIcon } from "lucide-react";

export interface AdminNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  dashboardDescription?: string;
  dashboardTitle?: string;
  showOnDashboard?: boolean;
}

export const adminNavigation: AdminNavigationItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "العوالم",
    href: "/admin/worlds",
    icon: Network,
    showOnDashboard: true,
    dashboardTitle: "World Management",
    dashboardDescription:
      "إدارة العوالم والنطاقات والمكانيكا وعناصر المحتوى.",
  },
  {
    label: "مراجعة المحتوى",
    href: "/admin/content-engine",
    icon: ScanSearch,
    showOnDashboard: true,
    dashboardTitle: "Content Engine Review",
    dashboardDescription: "مراجعة المرشحات واعتمادها كمسودات فقط.",
  },
  {
    label: "المستخدمين",
    href: "/admin/subscriptions",
    icon: Users,
    showOnDashboard: true,
    dashboardTitle: "Users",
    dashboardDescription: "إدارة اشتراكات وصلاحيات المستخدمين.",
  },
];

export function isAdminNavigationActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
