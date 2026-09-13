import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  root: '.',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5273, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
