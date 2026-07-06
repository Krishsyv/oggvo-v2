// Shared Tailwind preset — design tokens for the whole platform.
// Imported by @oggvo/ui and apps/web so brand styling is defined once.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8eccff",
          400: "#59afff",
          500: "#2e90fa", // brand blue (matches v1 review widget default)
          600: "#1570ef",
          700: "#175cd3",
          800: "#1849a9",
          900: "#194185",
        },
        success: { 500: "#12b76a", 600: "#039855" },
        warning: { 500: "#f79009", 600: "#dc6803" },
        error: { 500: "#f04438", 600: "#d92d20" },
        google: "#dc4e41",
        linkedin: "#0077b5",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "0.75rem",
      },
    },
  },
  plugins: [],
};
