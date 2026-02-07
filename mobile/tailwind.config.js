/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brandBlue: "#2145CF",
        brandGold: "#CFAB21",
        brandText: "#424965",
        brandSubtext: "#4a4a4a",
        brandError: "#EF4444",
      },
      fontFamily: {
        sans: [
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

