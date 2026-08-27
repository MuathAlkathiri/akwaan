"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XOctagon,
  Loader2,
} from "lucide-react";

/**
 * The one global toast surface: a small, premium floating notification.
 *
 * Warm near-white surface with navy text on every toast, in the same light Akwaan
 * language as the rest of the UI — not a dark game banner. Semantics live only in
 * the accent, never the fill: a warm-gold check for the rare success, a restrained
 * red mark (and a red hairline) for an error, so the two stay clearly distinct
 * without either being drowned in colour. It floats near the very top of the
 * viewport, centred, sized to its content.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="top-center"
      offset={14}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle2 className="size-4 text-[hsl(var(--brand-gold))]" />
        ),
        info: <Info className="size-4 text-[hsl(var(--brand-gold))]" />,
        warning: (
          <AlertTriangle className="size-4 text-[hsl(var(--brand-gold))]" />
        ),
        error: <XOctagon className="size-4 text-[hsl(var(--sem-error))]" />,
        loading: (
          <Loader2 className="size-4 animate-spin text-[hsl(var(--brand-gold))]" />
        ),
      }}
      style={
        {
          "--normal-bg": "hsl(var(--card))",
          "--normal-text": "hsl(var(--brand-navy))",
          "--normal-border": "hsl(var(--brand-gold) / 0.3)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
