/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Shadcn UI colors
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
        // NOC Dark Theme palette
        noc: {
          bg: "#0f1117",
          surface: "#161a25",
          card: "#1c2133",
          border: "#2a3042",
          hover: "#252d40",
          text: {
            primary: "#e2e8f0",
            secondary: "#94a3b8",
            muted: "#64748b",
          },
        },
        // Status colors
        status: {
          ok: "#22c55e",
          "ok-bg": "rgba(34, 197, 94, 0.1)",
          warning: "#f59e0b",
          "warning-bg": "rgba(245, 158, 11, 0.1)",
          down: "#ef4444",
          "down-bg": "rgba(239, 68, 68, 0.1)",
          paused: "#6366f1",
          "paused-bg": "rgba(99, 102, 241, 0.1)",
          unknown: "#64748b",
        },
        // Brand
        brand: {
          primary: "#3b82f6",
          secondary: "#6366f1",
          accent: "#06b6d4",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "glow-red": "glowRed 2s ease-in-out infinite alternate",
        "glow-amber": "glowAmber 3s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowRed: {
          "0%": { boxShadow: "0 0 5px rgba(239, 68, 68, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(239, 68, 68, 0.6)" },
        },
        glowAmber: {
          "0%": { boxShadow: "0 0 5px rgba(245, 158, 11, 0.2)" },
          "100%": { boxShadow: "0 0 15px rgba(245, 158, 11, 0.4)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
