/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3F1E8',
        surface: '#FFFFFF',
        court: { DEFAULT: '#2453C7', dark: '#1B3F99' },
        ball: '#E6F53D',
        ink: '#16233D',
        line: '#E3E0D4',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        btn: '20px',
      },
      letterSpacing: {
        tightest: '-0.03em',
        tighter: '-0.02em',
      },
      maxWidth: {
        app: '480px',
      },
    },
  },
  plugins: [],
};
