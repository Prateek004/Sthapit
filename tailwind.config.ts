import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#FEF3EE",
          100: "#FDE3D0",
          200: "#FBC5A0",
          300: "#F89E6A",
          400: "#F5773A",
          500: "#E8590C",
          600: "#C44A08",
          700: "#9B3A06",
        },
      },
      screens: {
        xs: "380px",
        sm: "480px",   // fills the gap between xs and md
        md: "768px",
        lg: "1024px",
        xl: "1280px",
      },
      maxWidth: {
        app: "480px",
      },
    },
  },
  plugins: [],
};

export default config;
