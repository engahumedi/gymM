import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves this repo at https://<user>.github.io/gymM/, so the app
// must be built with base '/gymM/'. Locally (dev) base is '/'.
// Override with VITE_BASE if the repo is renamed.
export default defineConfig(({ mode }) => ({
  // Production build (and `vite preview` of it) is served from /gymM/ on Pages;
  // the dev server runs at '/'. Keyed off mode so preview matches the build.
  base: mode === 'production' ? (process.env.VITE_BASE ?? '/gymM/') : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
