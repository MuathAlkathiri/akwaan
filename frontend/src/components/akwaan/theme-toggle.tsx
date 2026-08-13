"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/theme-provider";

/**
 * This client's own light/dark switch.
 *
 * Deliberately *not* a global setting. The shared screen and the phone are different
 * viewing contexts and each keeps its own preference, so a host dimming the television
 * does not dim everyone's phone — and a player brightening their phone does not put
 * the room's glare back.
 *
 * Both clients start in the light room, which is the product's identity; this is the
 * control for opting out of it, not a mode switch between two equal defaults.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, surface } = useTheme();
  const goingDark = theme === "light";
  const target = goingDark ? "الوضع الليلي" : "الوضع النهاري";
  const scope = surface === "shared-screen" ? "الشاشة المشتركة" : "جوالك";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="theme-toggle"
      data-theme={theme}
      // Names the scope as well as the action: the whole point is that this switch
      // changes one client, and a bare moon icon does not say that.
      aria-label={`${target} — ${scope}`}
      title={`${target} — ${scope}`}
      onClick={toggleTheme}
      className={cn("font-black", className)}
    >
      {goingDark ? (
        <Moon className="size-4" aria-hidden />
      ) : (
        <Sun className="size-4" aria-hidden />
      )}
    </Button>
  );
}
