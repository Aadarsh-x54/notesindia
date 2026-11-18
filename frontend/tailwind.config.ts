import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        ni: {
          bg: '#161616',
          surface: '#1E1E1E',
          surface2: '#262626',
          surface3: '#303030',
          black: '#000000',
          border: '#2E2E2E',
          borderHover: '#4A4A4A',
          text: '#FFFFFF',
          muted: '#A8A8A8',
          subtle: '#787878',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
