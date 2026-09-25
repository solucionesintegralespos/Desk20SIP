/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef3fc',
          100: '#dbe6fa',
          200: '#b8cef4',
          300: '#88aceb',
          400: '#4e7dd9',
          500: '#1955b5',
          600: '#063d92',
          700: '#0a3076',
          800: '#0b2561',
          900: '#071653',
          950: '#030830',
        },
        brand: {
          coral: '#ff514f',
          'coral-light': '#fff0ed',
          'coral-dark': '#b43231',
          amber: '#ffbf00',
          'amber-light': '#fff8dc',
          'amber-dark': '#805100',
          green: '#86c449',
          'green-light': '#eff8e6',
          'green-dark': '#23742c',
        },
        gray: { 50: '#f4f6fb' },
      },
    },
  },
  plugins: [],
}
