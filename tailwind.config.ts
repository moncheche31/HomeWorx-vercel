import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // HomeWorx 360 Corporate Navy — #0B3C5D
        brand: {
          50:  "#EBF2F8",
          100: "#C5D9EA",
          200: "#9DBFDB",
          300: "#6FA2C9",
          400: "#4B8BBF",
          500: "#286FA0",
          600: "#1A5985",
          700: "#0B3C5D",
          800: "#083048",
          900: "#042030",
        },
        // HomeWorx 360 Accent Green — #41AD49
        accent: {
          50:  "#EAF6EB",
          100: "#C4E8C7",
          200: "#9DD9A2",
          300: "#71C878",
          400: "#52BB5A",
          500: "#41AD49",
          600: "#35983D",
          700: "#298331",
          800: "#1E6625",
          900: "#134A1A",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
