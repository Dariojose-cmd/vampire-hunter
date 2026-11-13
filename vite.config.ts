import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import { previewHeaders } from './build/previewHeaders.ts'

// Test-only: emits marker.txt when VH_E2E_MARKER is set (update-path e2e). Never in a normal build.
function e2eMarker(): Plugin | null {
  const marker = process.env.VH_E2E_MARKER
  if (!marker) return null
  return {
    name: 'vh-e2e-marker',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'marker.txt', source: marker })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), previewHeaders(), e2eMarker()],
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
