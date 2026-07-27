import {
  Boxes,
  ClipboardList,
  Gamepad2,
  LayoutDashboard,
  Sparkles,
  Users,
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
    label: "الألعاب",
    href: "/games",
    icon: Gamepad2,
    showOnDashboard: true,
    dashboardTitle: "Games management",
    dashboardDescription: "متابعة الألعاب المحفوظة وحالة كل تحدي.",
  },
  {
    label: "الكتالوجات",
    href: "/admin/catalogs",
    icon: Boxes,
    showOnDashboard: true,
    dashboardTitle: "Catalogs management",
    dashboardDescription: "تنظيم الفئات داخل كتالوجات واضحة.",
  },
  {
    label: "الفئات",
    href: "/admin/categories",
    icon: Boxes,
    showOnDashboard: true,
    dashboardTitle: "Categories management",
    dashboardDescription: "إضافة وتعديل فئات الأسئلة المتاحة.",
  },
  {
    label: "الأسئلة",
    href: "/admin/questions",
    icon: ClipboardList,
    showOnDashboard: true,
    dashboardTitle: "Questions management",
    dashboardDescription: "مراجعة الأسئلة واعتماد المحتوى.",
  },
  {
    label: "توليد الأسئلة",
    href: "/admin/ai-generator",
    icon: Sparkles,
    showOnDashboard: true,
    dashboardTitle: "Generate Questions",
    dashboardDescription: "توليد أسئلة كمسودات للمراجعة قبل الحفظ.",
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
