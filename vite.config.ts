import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
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
