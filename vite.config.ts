import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'

/**
 * Read the response headers from customHttp.yml (the file Amplify serves) so
 * `vite preview` sends exactly the same CSP and security headers.
 * Line-based on purpose: each header is `- key: X` followed by `value: "Y"`.
 */
function readAmplifyHeaders(): Record<string, string> {
  const text = readFileSync(resolve(import.meta.dirname, 'customHttp.yml'), 'utf8')
  const headers: Record<string, string> = {}
  for (const m of text.matchAll(/^\s*-\s*key:\s*(\S+)\s*\n\s*value:\s*"(.*)"\s*$/gm)) {
    headers[m[1]] = m[2]
  }
  return headers
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  // Only the production-like preview server gets the strict CSP. The dev
  // server needs inline scripts / eval for HMR, so it is left alone.
  preview: { headers: readAmplifyHeaders() },
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
