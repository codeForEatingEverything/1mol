import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        molCream: {
          50: "#fdfaf3",
          100: "#fbf5e6",
          200: "#f7ebcf",
          300: "#f2ddaa",
          400: "#e9c97a",
          500: "#dfb04e",
        },
        molBrown: {
          500: "#8c5633",
          700: "#683d21",
          800: "#502d15",
          900: "#361c0b",
        },
        molDark: "#0f0f11",
      },
      boxShadow: {
        goldGlow: "0 0 25px -5px rgba(223, 176, 78, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
