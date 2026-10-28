/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkbg: '#090b0f',
        sidebarbg: '#111319',
        cardbg: '#181c25',
        bubbleuser: '#1f2430',
        accentviolet: '#7c3aed',
        accentindigo: '#4f46e5',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
