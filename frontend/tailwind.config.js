import daisyui from 'daisyui'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // optional; daisyUI also respects data-theme
  plugins: [daisyui],
  daisyui: {
    themes: [
      'light','dark','cupcake','bumblebee','emerald','corporate','synthwave','retro',
      'cyberpunk','valentine','halloween','garden','forest','aqua','lofi','pastel',
      'fantasy','wireframe','black','luxury','dracula','cmyk','autumn','business',
      'acid','lemonade','night','coffee','winter'
    ],
  },
}