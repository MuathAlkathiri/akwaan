import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // The semantic layer lives here, and it is the *only* place team utility
    // classes are written. Leaving it out meant every team colour resolved to
    // nothing: the classes were emitted into the markup and never into the CSS.
    "./src/lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Akwaan semantic tokens. Screens name meaning, never a hue: `team-green`
        // is "team one", not "a green", which is what keeps the two teams the
        // same two colours on every surface.
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          subtle: "hsl(var(--success-subtle))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          subtle: "hsl(var(--warning-subtle))",
        },
        selected: {
          DEFAULT: "hsl(var(--selected))",
          subtle: "hsl(var(--selected-subtle))",
        },
        completed: {
          DEFAULT: "hsl(var(--completed))",
          subtle: "hsl(var(--completed-subtle))",
        },
        disabled: {
          foreground: "hsl(var(--disabled-foreground))",
        },
        team: {
          green: {
            DEFAULT: "hsl(var(--team-green))",
            surface: "hsl(var(--team-green-surface))",
            border: "hsl(var(--team-green-border))",
            text: "hsl(var(--team-green-text))",
            strong: "hsl(var(--team-green-strong))",
          },
          coral: {
            DEFAULT: "hsl(var(--team-coral))",
            surface: "hsl(var(--team-coral-surface))",
            border: "hsl(var(--team-coral-border))",
            text: "hsl(var(--team-coral-text))",
            strong: "hsl(var(--team-coral-strong))",
          },
        },
      },
      transitionTimingFunction: {
        akwaan: "var(--motion-ease)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss/plugin")],
} satisfies Config

export default config
