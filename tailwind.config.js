/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        // Retro game-UI pair, used by the Pokemon-style battle editor.
        pixel: ["Silkscreen", "ui-monospace", "Menlo", "monospace"],
        round: ["Fredoka", "ui-rounded", "Segoe UI", "system-ui", "sans-serif"]
      },
      boxShadow: {
        phone: "0 28px 80px rgba(15, 23, 42, 0.28)",
        bubble: "0 12px 28px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
};
