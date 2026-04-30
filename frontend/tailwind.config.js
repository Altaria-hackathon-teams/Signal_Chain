/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'tp-bg': '#030806',
        'tp-card': '#06110d',
        'tp-border': '#0f2418',
        'tp-green': '#00ff88',
        'tp-amber': '#ffaa00',
        'tp-red': '#ff4444',
        'tp-text': '#e0e0e0',
        'tp-muted': '#7a9985',
      },
    },
  },
  plugins: [],
}

