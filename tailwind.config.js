/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#C4B5FD',
          500: '#8B7FD4',
          600: '#7C6BC4',
          700: '#6D5BB0',
          900: '#3B2E7A',
        },
        accent: {
          DEFAULT: '#27D2BF',
          soft: '#EAFBF8',
          text: '#0F766E',
        },
        mint: '#A8E6CF',
        peach: '#FFB7A5',
        danger: '#E8463A',
        warning: '#EFAA17',
        success: '#1DC981',
      },
      fontFamily: {
        sans: ['"SF Pro Text"', '"PingFang SC"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'card': '12px',
        'button': '10px',
        'input': '8px',
        'pill': '999px',
      },
      boxShadow: {
        'soft': '0 2px 12px rgba(0, 0, 0, 0.06)',
        'soft-lg': '0 4px 24px rgba(0, 0, 0, 0.08)',
        'glow': '0 0 20px rgba(124, 107, 196, 0.15)',
      },
      transitionProperty: {
        'theme': 'background-color, border-color, color, fill, stroke',
      }
    },
  },
  plugins: [],
}
