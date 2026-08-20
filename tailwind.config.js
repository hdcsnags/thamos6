import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  // Container queries let result pages reflow with their desktop WINDOW
  // (the @container ancestor) instead of the browser viewport. Mapping used
  // when converting viewport breakpoints: sm(640px)→@xl(576px),
  // md(768px)→@3xl(768px), lg(1024px)→@5xl(1024px).
  plugins: [containerQueries],
};
