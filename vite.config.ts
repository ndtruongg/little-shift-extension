import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  build: {
    target: 'chrome116',
    rollupOptions: {
      input: {
        newtab: resolve(import.meta.dirname, 'index.html'),
        popup: resolve(import.meta.dirname, 'popup.html'),
        offscreen: resolve(import.meta.dirname, 'offscreen.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    },
  },
});
