import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import webExtension from 'vite-plugin-web-extension';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

function copyIcons() {
  return {
    name: 'copy-icons',
    closeBundle() {
      const sizes = [16, 32, 48, 128];
      const outDir = resolve(__dirname, 'dist/icons');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      sizes.forEach((s) => {
        const src = resolve(__dirname, `icons/icon${s}.png`);
        if (existsSync(src)) copyFileSync(src, resolve(outDir, `icon${s}.png`));
      });
    },
  };
}

// Bundled CC0 field recordings for the soundscape player
function copySounds() {
  return {
    name: 'copy-sounds',
    closeBundle() {
      const srcDir = resolve(__dirname, 'sounds');
      if (!existsSync(srcDir)) return;
      const outDir = resolve(__dirname, 'dist/sounds');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      readdirSync(srcDir)
        .filter((f) => f.endsWith('.ogg'))
        .forEach((f) => copyFileSync(resolve(srcDir, f), resolve(outDir, f)));
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    webExtension({
      manifest: './manifest.json',
      additionalInputs: ['src/background/service-worker.ts'],
      disableAutoLaunch: true,
    }),
    copyIcons(),
    copySounds(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
