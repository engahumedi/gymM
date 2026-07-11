/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#e11d2a',
          dark: '#b3141f',
        },
        ink: '#0f172a',
      },
    },
  },
  plugins: [],
};
