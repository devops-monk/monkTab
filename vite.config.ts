import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    tailwindcss(),
    webExtension({
      manifest: './manifest.json',
      additionalInputs: ['src/background/service-worker.ts'],
      disableAutoLaunch: true,
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});