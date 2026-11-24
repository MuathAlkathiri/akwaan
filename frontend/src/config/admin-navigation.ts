import {
  LayoutDashboard,
  ScanSearch,
  Ticket,
  Users,
  Network,
  Gift,
} from "lucide-react";
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
  {
    label: "المباريات والحملة",
    href: "/admin/matches",
    icon: Gift,
    showOnDashboard: true,
    dashboardTitle: "Matches & Campaign",
    dashboardDescription:
      "أضف مباريات لحساب، غيّر العدد المجاني الأسبوعي، وسوِّ أكواد هدايا.",
  },
  {
    label: "أكواد الخصم",
    href: "/admin/discount-codes",
    icon: Ticket,
    showOnDashboard: true,
    dashboardTitle: "Discount Codes",
    dashboardDescription: "سوِّ أكواد خصم وأوقفها، وشوف كم استُخدم كل واحد.",
  },
];

export function isAdminNavigationActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
