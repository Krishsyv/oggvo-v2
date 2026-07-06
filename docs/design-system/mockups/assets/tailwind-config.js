/* OGGVO v2 design tokens for the static mockups.
 * Mirrors packages/config/tailwind/preset.js — keep in sync. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8eccff",
          400: "#59afff",
          500: "#2e90fa",
          600: "#1570ef",
          700: "#175cd3",
          800: "#1849a9",
          900: "#194185",
        },
        success: { 100: "#d1fadf", 500: "#12b76a", 600: "#039855", 700: "#027a48" },
        warning: { 100: "#fef0c7", 500: "#f79009", 600: "#dc6803", 700: "#b54708" },
        error: { 100: "#fee4e2", 500: "#f04438", 600: "#d92d20", 700: "#b42318" },
        google: "#dc4e41",
        linkedin: "#0077b5",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      borderRadius: { card: "0.75rem" },
    },
  },
};
