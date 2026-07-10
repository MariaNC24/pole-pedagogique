/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          500: "#3457d5",
          600: "#2a45b0",
          700: "#22368c",
        },
      },
    },
  },
  plugins: [],
};
