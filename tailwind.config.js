/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        best: '#34d399',
        likely: '#fbbf24',
        worst: '#f87171',
      },
      fontFamily: {
        // 'Segoe UI' leads deliberately. Inter is never loaded by this app, so
        // leaving it first lets a broken/mismapped local "Inter" hijack every
        // glyph into a symbol font. It is omitted rather than reordered for the
        // same reason: listing a font we never load only invites a bad match.
        sans: [
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'Consolas',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
}
