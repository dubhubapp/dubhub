import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "dice-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "feed-sort-press": {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(0.92)" },
          "100%": { transform: "scale(1)" },
        },
        "feed-flame-ignite": {
          "0%": {
            color: "rgb(229 231 235)",
            transform: "scale(1)",
            filter: "drop-shadow(0 0 0 transparent)",
          },
          "28%": {
            color: "rgb(250 204 21)",
            transform: "scale(0.91)",
            filter: "drop-shadow(0 0 10px rgba(250, 204, 21, 0.85))",
          },
          "55%": {
            color: "rgb(251 146 60)",
            transform: "scale(1.02)",
            filter: "drop-shadow(0 0 14px rgba(251, 146, 60, 0.9))",
          },
          "100%": {
            color: "rgb(252 165 165)",
            transform: "scale(1)",
            filter: "drop-shadow(0 0 16px rgba(248, 113, 113, 0.95))",
          },
        },
        "feed-flame-active-pulse": {
          "0%, 100%": {
            transform: "scale(1)",
            filter: "drop-shadow(0 0 8px rgba(251, 146, 60, 0.55))",
          },
          "50%": {
            transform: "scale(1.07)",
            filter: "drop-shadow(0 0 16px rgba(239, 68, 68, 0.82))",
          },
        },
        "feed-clock-sweep": {
          "0%": { transform: "rotate(0deg) scale(1)" },
          "35%": { transform: "rotate(28deg) scale(0.92)" },
          "100%": { transform: "rotate(0deg) scale(1)" },
        },
        "feed-clock-active-pulse": {
          "0%, 100%": {
            filter: "drop-shadow(0 0 6px rgba(34, 211, 238, 0.45))",
          },
          "50%": {
            filter: "drop-shadow(0 0 14px rgba(103, 232, 249, 0.82))",
          },
        },
        "submit-edge-trace": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "random-dice-rail-enter": {
          "0%": { opacity: "0", transform: "translateX(12px) scale(0.96)" },
          "70%": { opacity: "1", transform: "translateX(0) scale(1.02)" },
          "100%": { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        "random-dice-rail-exit": {
          "0%": { opacity: "1", transform: "translateX(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateX(12px) scale(0.98)" },
        },
        /** Rail dice attention cue: bright white bloom, then long ease-out to neutral. */
        "random-dice-rail-glow-once": {
          "0%": {
            filter:
              "drop-shadow(0 0 0 rgba(255,255,255,0)) drop-shadow(0 0 0 rgba(255,255,255,0))",
          },
          "22%": {
            filter:
              "drop-shadow(0 0 2px rgba(255,255,255,0.95)) drop-shadow(0 0 10px rgba(255,255,255,0.9)) drop-shadow(0 0 22px rgba(255,255,255,0.65)) drop-shadow(0 0 36px rgba(255,255,255,0.4))",
          },
          "32%": {
            filter:
              "drop-shadow(0 0 4px rgba(255,255,255,1)) drop-shadow(0 0 14px rgba(255,255,255,0.95)) drop-shadow(0 0 28px rgba(255,255,255,0.75)) drop-shadow(0 0 48px rgba(255,255,255,0.45))",
          },
          "52%": {
            filter:
              "drop-shadow(0 0 3px rgba(255,255,255,0.55)) drop-shadow(0 0 12px rgba(255,255,255,0.4)) drop-shadow(0 0 24px rgba(255,255,255,0.22))",
          },
          "100%": {
            filter:
              "drop-shadow(0 0 0 rgba(255,255,255,0)) drop-shadow(0 0 0 rgba(255,255,255,0))",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "dice-spin": "dice-spin 0.42s cubic-bezier(0.33, 1, 0.68, 1) both",
        "feed-sort-press": "feed-sort-press 0.18s cubic-bezier(0.33, 1, 0.68, 1) both",
        "feed-flame-ignite": "feed-flame-ignite 0.34s cubic-bezier(0.33, 1, 0.68, 1) both",
        "feed-flame-active-pulse": "feed-flame-active-pulse 1.85s ease-in-out infinite",
        "feed-clock-sweep": "feed-clock-sweep 0.24s cubic-bezier(0.33, 1, 0.68, 1) both",
        "feed-clock-active-pulse": "feed-clock-active-pulse 1.75s ease-in-out infinite",
        "submit-edge-trace": "submit-edge-trace 18s linear infinite",
        "random-dice-rail-enter": "random-dice-rail-enter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "random-dice-rail-exit": "random-dice-rail-exit 0.175s cubic-bezier(0.33, 1, 0.68, 1) both",
        "random-dice-rail-glow-once":
          "random-dice-rail-glow-once 1.7s cubic-bezier(0.25, 0.1, 0.25, 1) 0.2s 1 both",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
