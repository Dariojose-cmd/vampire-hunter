import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Property tests run 1000+ cases; 5s default is too tight on a busy laptop.
    testTimeout: 30000,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@engine': resolve(import.meta.dirname, 'src/engine'),
      '@data': resolve(import.meta.dirname, 'src/data'),
      '@components': resolve(import.meta.dirname, 'src/components'),
      '@i18n': resolve(import.meta.dirname, 'src/i18n'),
      '@styles': resolve(import.meta.dirname, 'src/styles'),
      '@audio': resolve(import.meta.dirname, 'src/audio'),
    },
  },
})
