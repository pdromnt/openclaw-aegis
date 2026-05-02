import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import pkg from './package.json';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { test: /react-syntax-highlighter/, name: 'syntax-highlighter' },
            { test: /react-markdown|remark-gfm/, name: 'markdown' },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
