/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#111113', 2: '#3A3A3F' },
        muted: { DEFAULT: '#8A8A91', 2: '#B4B4BA' },
        line: { DEFAULT: '#ECECEA', 2: '#E2E2DF' },
        canvas: '#F5F5F3',
        soft: '#F8F8F6',
        accent: { DEFAULT: '#6A4CFF', 600: '#5A3BF0', 50: '#F3F0FF', 100: '#E9E3FF', 200: '#D4C9FF' },
        lime: { DEFAULT: '#D8F65C', ink: '#3B4A00' },
        danger: { DEFAULT: '#EF4136', 50: '#FEF1F0', 100: '#FDDDDB' },
        warn: { DEFAULT: '#F5A524', 50: '#FFF7E8' },
        ok: { DEFAULT: '#14A660', 50: '#EAF8F0' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,20,.04), 0 0 0 1px rgba(16,16,20,.04)',
        pop: '0 12px 40px -8px rgba(16,16,20,.18), 0 0 0 1px rgba(16,16,20,.06)',
      },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
};
