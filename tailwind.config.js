/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand:   { DEFAULT:'#185FA5', dark:'#0C447C', light:'#E6F1FB' },
        b2c:     { DEFAULT:'#185FA5', light:'#E6F1FB' },
        b2b:     { DEFAULT:'#059669', light:'#D1FAE5' },
      },
    },
  },
  plugins: [],
}
