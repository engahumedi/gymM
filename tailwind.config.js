/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Custom palette via CSS variables — no default Tailwind named colors.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      bg: 'var(--bg)',
      // Public-site block system (see index.css) — additive, so the dashboard
      // and portal palettes are untouched.
      ground: 'var(--ground)',
      block: 'var(--block)',
      'block-2': 'var(--block-2)',
      'block-line': 'var(--block-line)',
      paper: 'var(--paper)',
      'paper-ink': 'var(--paper-ink)',
      'paper-muted': 'var(--paper-muted)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      border: 'var(--border)',
      'border-strong': 'var(--border-strong)',
      text: 'var(--text)',
      muted: 'var(--muted)',
      faint: 'var(--faint)',
      accent: 'var(--accent)',
      'accent-on': 'var(--accent-on)',
      'accent-ink': 'var(--accent-ink)',
      sand: 'var(--sand)',
      good: 'var(--good)',
      warn: 'var(--warn)',
    },
    borderRadius: {
      none: '0',
      DEFAULT: 'var(--r)',
      sm: '2px',
      md: 'var(--r)',
      lg: 'var(--r-lg)',
      full: '9999px',
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      maxWidth: { content: '72rem' },
    },
  },
  plugins: [],
};
