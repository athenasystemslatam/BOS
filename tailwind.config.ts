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
        bordo: {
          DEFAULT: "#7D1C2E",
          dark: "#5D1522",
          light: "#9D2438",
          tint: "#F6EDEE",
          tint2: "#F3E2E5",
          border: "#E6D4D7",
        },
        success: "#27AE60",
        warning: "#E67E22",
        danger: "#C0392B",
        // Rediseño Panel General (handoff sep-2026) — paleta "papel" neutra,
        // separada de los grises genéricos de Tailwind para no arrastrar
        // este restyling a pantallas que no son parte del rediseño.
        appbg: "#EEECE7",
        paper: {
          DEFAULT: "#FCFBF9",
          alt: "#F8F6F2",
          hover: "#F4F1EA",
          group: "#F6F3EE",
        },
        ink: {
          // Escala de grises de texto del rediseño, un escalón más oscura
          // (mismo tono cálido, sin tocar el peso de la fuente).
          DEFAULT: "#17141A",
          cell: "#28232A",
          muted: "#605954",
          subtle: "#7C756E",
          faint: "#8E8681",
          ghost: "#B8B2AA",
        },
        line: {
          panel: "#E2DDD4",
          rule: "#DCD6CC",
          group: "#E6E1D8",
          row: "#EFEBE4",
          soft: "#EAE5DC",
          input: "#DDD8CF",
          // Guion "—" de servicio no contratado — distinto de line.input,
          // aunque parecidos a simple vista.
          dash: "#DAD4CB",
        },
        // Punto de ítem inactivo del sidebar y color de hover del ✕ de baja
        // de servicio — mismo hex en las dos specs del handoff.
        dot: "#C3BBB3",
        activo: {
          DEFAULT: "#166B45",
          dot: "#1FA463",
        },
        alerta: {
          bg: "#FDF3E3",
          fg: "#92400E",
          label: "#B07B31",
          dot: "#C08A3E",
          text: "#A8783A",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        archivo: ["var(--font-archivo)", "sans-serif"],
        plex: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
