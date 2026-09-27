/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        spotify: {
          green:   '#1DB954',
          'green-hover': '#1ed760',
          black:   '#121212',
          dark:    '#181818',
          card:    '#282828',
          hover:   '#333333',
          muted:   '#B3B3B3',
        },
      },
    },
  },
  plugins: [],
}
