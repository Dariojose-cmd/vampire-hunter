import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { precachePlugin } from './precachePlugin.ts'

// Second build: reads the finished dist/ and emits dist/sw.js (stable name).
export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  publicDir: false,
  plugins: [precachePlugin()],
  build: {
    // VH_OUT_DIR is only set by the update-path e2e spec; default stays 'dist'.
    outDir: process.env.VH_OUT_DIR || 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: {
      entry: resolve(import.meta.dirname, 'sw/sw.ts'),
      formats: ['iife'],
      name: 'vhServiceWorker',
      fileName: () => 'sw.js',
    },
  },
})
