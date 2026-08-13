"use client";

import { LucideIcon } from "lucide-react";
import { DashboardCard } from "./dashboard-card";

interface QuickActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActionCard(props: QuickActionCardProps) {
  return <DashboardCard {...props} tone="playful" />;
}
