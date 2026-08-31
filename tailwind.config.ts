import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        accent: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(1200px 500px at 10% -10%, rgba(99,102,241,0.25), transparent 60%), radial-gradient(900px 400px at 100% 0%, rgba(236,72,153,0.20), transparent 60%)",
        "gradient-brand":
          "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(15, 23, 42, 0.15)",
        pop:  "0 12px 32px -12px rgba(99, 102, 241, 0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { transform: "scale(1)", opacity: "1" },
          "50%":     { transform: "scale(1.6)", opacity: "0.4" },
        },
      },
      animation: {
        "fade-up": "fade-up .35s ease-out both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
