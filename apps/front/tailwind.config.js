/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // All colors resolve to CSS variables set per-theme in index.css,
      // so utilities like `bg-app-surface` / `text-brand` re-skin automatically.
      colors: {
        'app-bg': 'var(--bg)',
        'app-surface': 'var(--surface)',
        'app-surface2': 'var(--surface-2)',
        'app-border': 'var(--border)',
        fg: {
          DEFAULT: 'var(--text)',
          muted: 'var(--muted)',
        },
        brand: {
          DEFAULT: 'var(--primary)',
          bright: 'var(--primary-bright)',
          accent: 'var(--accent)',
        },
      },
      fontFamily: {
        heading: 'var(--heading-font)',
        body: 'var(--body-font)',
      },
    },
  },
  plugins: [],
};
