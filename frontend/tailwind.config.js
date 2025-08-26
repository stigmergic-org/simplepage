/** Tailwind CSS configuration (v3) with DaisyUI plugin
 *
 * Note: In Tailwind v4 the config shape changes (ESM, `tailwind.config.ts`, 
 *    new entrypoint system). This file is v3-compatible.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    // add only if needed:
    // "../packages/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      "light","dark","cupcake","bumblebee","emerald","corporate","synthwave","retro",
      "cyberpunk","valentine","halloween","garden","forest","aqua","lofi","pastel",
      "fantasy","wireframe","black","luxury","dracula","cmyk","autumn","business",
      "acid","lemonade","night","coffee","winter",
    ],
  },
};