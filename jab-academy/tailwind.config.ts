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
        "jab-red": "#C8102E",
        "jab-black": "#0A0A0A",
        "jab-white": "#FFFFFF",
        "jab-mud": "#4A2E1B",
        "jab-mud-dark": "#2D1B10",
        "jab-amber": "#FF6B00",
        "jab-gold": "#FFB800",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "flame-glow":
          "radial-gradient(circle at 50% 50%, #FFB800 0%, #FF6B00 35%, #C8102E 65%, transparent 75%)",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1", transform: "scaleY(1)" },
          "50%": { opacity: "0.85", transform: "scaleY(1.04)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px 0 rgba(255,107,0,0.35)" },
          "50%": { boxShadow: "0 0 40px 8px rgba(255,184,0,0.45)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        flicker: "flicker 2.4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.8s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
    },
  },
  plugins: [],
};
export default config;
