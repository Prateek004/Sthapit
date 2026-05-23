import type { Config } from "tailwindcss";

/**
 * Sth1r — Tailwind config
 *
 * Visual alignment with the landing-page design system.
 *
 * Strategy: we REMAP the default `gray` scale to a warm, brand-aligned
 * ash/ember/coal palette. This means every existing `text-gray-500`,
 * `bg-gray-50`, `border-gray-200` etc. across the app instantly inherits
 * the warm brand tone — without touching a single component file.
 *
 * Brand tokens (`fire`, `coal`, `ember`, `ash`, `cream`, `sand`, `smoke`)
 * are also exposed as first-class Tailwind colors so new code can opt-in
 * to the canonical names.
 *
 * Veg/non-veg semantic colors (red/green) are intentionally left as
 * Tailwind defaults — they are regulatory signals and must stay legible.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── Primary saffron (matches --fire from landing) ── */
        primary: {
          50:  "#FEF0E8",
          100: "#FACDB0",
          200: "#F89E6A",
          300: "#F5773A",
          400: "#F49668",
          500: "#E8590C", // --fire
          600: "#B83E06", // --fire-dark
          700: "#9B3A06",
          800: "#7C2600",
        },

        /* ── Warm brand neutrals — replaces Tailwind's cool gray ──
         * Maps 50→cream, 100→sand, 200→ember, 300→ember-deep,
         * 400→ash-light, 500→ash, 600→smoke-light, 700→smoke,
         * 800→smoke-deep, 900→coal.
         * Tuned so contrast ratios stay close to original gray,
         * so no readability is lost. */
        gray: {
          50:  "#FEF9F4", // cream
          100: "#FDF6EE", // sand
          200: "#F0E8DF", // ember
          300: "#E5DBCC", // ember-deep
          400: "#A89684", // ash-light (bumped slightly for legibility)
          500: "#7A6456", // ash
          600: "#5C4A3C", // smoke-light
          700: "#3D2E1E", // smoke
          800: "#2A1E10", // smoke-deep
          900: "#1A1208", // coal
        },

        /* ── First-class brand tokens (use these in new code) ── */
        fire: {
          DEFAULT: "#E8590C",
          dark:    "#B83E06",
          glow:    "rgba(232,89,12,0.25)",
          50:      "#FEF0E8",
          100:     "#FACDB0",
        },
        ember: "#F0E8DF",
        sand:  "#FDF6EE",
        cream: "#FEF9F4",
        ash:   "#7A6456",
        smoke: "#3D2E1E",
        coal:  "#1A1208",

        /* ── Semantic (matches landing) ── */
        veg:    "#2D6A4F",
        nonveg: "#C0392B",
        success: "#2D6A4F",
        warning: "#B07D00",
      },

      fontFamily: {
        /* Use these utilities when you want explicit brand fonts.
         * Body inherits DM Sans via globals.css, so no class is needed there. */
        syne:       ['"Syne"', "sans-serif"],
        instrument: ['"Instrument Serif"', "serif"],
        dm:         ['"DM Sans"', "sans-serif"],
        sans:       ['"DM Sans"', "system-ui", "sans-serif"],
      },

      fontSize: {
        /* Editorial display sizes used by the landing.
         * line-height is tightened for Syne headlines. */
        "display-xs": ["20px", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "display-sm": ["24px", { lineHeight: "1.2",  letterSpacing: "-0.02em" }],
        "display-md": ["32px", { lineHeight: "1.1",  letterSpacing: "-0.02em" }],
        "display-lg": ["40px", { lineHeight: "1.07", letterSpacing: "-0.025em" }],
      },

      borderRadius: {
        /* Consistent scale — matches landing's 8/10/12/14/16/20/24 rhythm. */
        sm:  "8px",
        md:  "10px",
        lg:  "12px",
        xl:  "16px",
        "2xl": "20px",
        "3xl": "24px",
      },

      boxShadow: {
        /* Warm shadows — tinted toward coal instead of cool black.
         * `card` is the default surface elevation,
         * `card-lg` for raised modals / dropdowns,
         * `glow` for the saffron focus halo. */
        card:    "0 2px 8px rgba(26,18,8,0.06), 0 0 0 1px rgba(26,18,8,0.05)",
        "card-lg": "0 8px 32px rgba(26,18,8,0.10), 0 0 0 1px rgba(26,18,8,0.05)",
        glow:    "0 0 0 3px rgba(232,89,12,0.25)",
        soft:    "0 1px 2px rgba(26,18,8,0.04)",
      },

      screens: {
        xs: "380px",
        sm: "480px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },

      maxWidth: {
        app: "480px",
      },

      transitionTimingFunction: {
        /* Same easing curve the landing uses for micro-interactions. */
        brand: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
