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
        "feed-trending-surge": {
          "0%": {
            transform: "translate(-3px, 3px) scale(0.92)",
            filter: "drop-shadow(0 0 0 transparent)",
            color: "rgb(229 231 235)",
          },
          "20%": {
            transform: "translate(-1.5px, 1.5px) scale(0.97)",
            filter: "drop-shadow(0 0 5px rgba(251, 191, 36, 0.4))",
            color: "rgb(252 211 77)",
          },
          "46%": {
            transform: "translate(3px, -4px) scale(1.06)",
            filter: "drop-shadow(0 0 14px rgba(251, 191, 36, 0.88))",
            color: "rgb(253 224 71)",
          },
          "56%": {
            transform: "translate(5px, -6px) scale(1.1)",
            filter: "drop-shadow(0 0 20px rgba(252, 211, 77, 0.95))",
            color: "rgb(254 240 138)",
          },
          "62%": {
            transform: "translate(3.5px, -5px) scale(1.06)",
            filter: "drop-shadow(0 0 16px rgba(251, 191, 36, 0.8))",
          },
          "68%": {
            transform: "translate(5.5px, -4px) scale(1.08)",
            filter: "drop-shadow(0 0 18px rgba(252, 211, 77, 0.9))",
          },
          "78%": {
            transform: "translate(1px, -1px) scale(1.02)",
            filter: "drop-shadow(0 0 8px rgba(251, 191, 36, 0.45))",
          },
          "100%": {
            transform: "translate(0, 0) scale(1)",
            filter: "drop-shadow(0 0 0 transparent)",
            color: "inherit",
          },
        },
        "feed-trending-active-pulse": {
          "0%, 100%": {
            transform: "translateY(0)",
            filter: "drop-shadow(0 0 6px rgba(251, 191, 36, 0.42))",
          },
          "50%": {
            transform: "translateY(-1px)",
            filter: "drop-shadow(0 0 12px rgba(252, 211, 77, 0.72))",
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
        /** Home rail dice: dash travels along dice outline (stroke-dashoffset, pathLength=100). */
        "dice-rail-edge-trace": {
          "0%": { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-100" },
        },
        /** End-of-feed dice chip: restrained ring/outline breathing (no full-opacity pulse). */
        "home-end-dice-ring-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 1px rgba(74, 233, 223, 0.28), 0 0 0 0 rgba(74, 233, 223, 0)",
          },
          "50%": {
            boxShadow: "0 0 0 2px rgba(74, 233, 223, 0.42), 0 0 0 5px rgba(74, 233, 223, 0.07)",
          },
        },
        /** Release-attached like save: music notes rise + fade (transform/opacity only). */
        "like-save-note-rise-a": {
          "0%": { opacity: "0.92", transform: "translate(0, 0) scale(0.9)" },
          "8%": { opacity: "1", transform: "translate(0, 0) scale(1)" },
          "48%": { opacity: "1", transform: "translate(-4px, -20px) scale(0.96)" },
          "100%": { opacity: "0", transform: "translate(-9px, -46px) scale(0.72)" },
        },
        "like-save-note-rise-b": {
          "0%": { opacity: "0.92", transform: "translate(0, 0) scale(0.9)" },
          "8%": { opacity: "1", transform: "translate(0, 0) scale(1)" },
          "48%": { opacity: "1", transform: "translate(2px, -22px) scale(0.96)" },
          "100%": { opacity: "0", transform: "translate(5px, -50px) scale(0.68)" },
        },
        "like-save-note-rise-c": {
          "0%": { opacity: "0.92", transform: "translate(0, 0) scale(0.9)" },
          "8%": { opacity: "1", transform: "translate(0, 0) scale(1)" },
          "48%": { opacity: "1", transform: "translate(6px, -16px) scale(0.96)" },
          "100%": { opacity: "0", transform: "translate(12px, -40px) scale(0.65)" },
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
        "feed-trending-surge": "feed-trending-surge 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "feed-trending-active-pulse": "feed-trending-active-pulse 1.8s ease-in-out infinite",
        "submit-edge-trace": "submit-edge-trace 18s linear infinite",
        "random-dice-rail-enter": "random-dice-rail-enter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        "random-dice-rail-exit": "random-dice-rail-exit 0.175s cubic-bezier(0.33, 1, 0.68, 1) both",
        "dice-rail-edge-trace": "dice-rail-edge-trace 1.65s linear infinite",
        "home-end-dice-ring-pulse": "home-end-dice-ring-pulse 2.4s ease-in-out infinite",
        "like-save-note-rise-a": "like-save-note-rise-a 0.92s cubic-bezier(0.22, 1, 0.36, 1) both",
        "like-save-note-rise-b": "like-save-note-rise-b 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both",
        "like-save-note-rise-c": "like-save-note-rise-c 0.98s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
