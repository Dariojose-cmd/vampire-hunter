import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PREVIEW_PORT = 4173
export const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const VITE_BIN = resolve(ROOT, 'node_modules/vite/bin/vite.js')

export interface PreviewServer {
  origin: string
  stop: () => Promise<void>
}

/** True when something accepts TCP connections on the port (IPv4 or IPv6 localhost). */
function portOpen(port: number): Promise<boolean> {
  const tryHost = (host: string) =>
    new Promise<boolean>((done) => {
      const socket = createConnection({ port, host })
      socket.once('connect', () => { socket.destroy(); done(true) })
      socket.once('error', () => { socket.destroy(); done(false) })
    })
  return Promise.all([tryHost('127.0.0.1'), tryHost('::1')]).then(([a, b]) => a || b)
}

/**
 * Starts `vite preview --port 4173 --strictPort --outDir <dir>` with the repo's
 * own vite binary, waits until the port accepts connections, and returns stop().
 * `outDir` is resolved against the repo root, so 'dist' and 'dist-e2e-b' both work.
 */
export async function startPreviewServer(outDir = 'dist', timeoutMs = 30_000): Promise<PreviewServer> {
  if (await portOpen(PREVIEW_PORT)) {
    throw new Error(`Port ${PREVIEW_PORT} is already in use; stop the other server first.`)
  }
  const child: ChildProcess = spawn(
    process.execPath,
    [VITE_BIN, 'preview', '--port', String(PREVIEW_PORT), '--strictPort', '--outDir', resolve(ROOT, outDir)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let log = ''
  child.stdout?.on('data', (d: Buffer) => { log += d.toString() })
  child.stderr?.on('data', (d: Buffer) => { log += d.toString() })

  let exited = false
  const exitPromise = new Promise<void>((done) => {
    child.once('exit', () => { exited = true; done() })
  })

  const stop = async () => {
    if (exited) return
    child.kill('SIGTERM')
    const killer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    await exitPromise
    clearTimeout(killer)
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (exited) throw new Error(`vite preview exited early:\n${log}`)
    if (await portOpen(PREVIEW_PORT)) return { origin: PREVIEW_ORIGIN, stop }
    await new Promise((r) => setTimeout(r, 100))
  }
  await stop()
  throw new Error(`vite preview did not open port ${PREVIEW_PORT} within ${timeoutMs} ms:\n${log}`)
}
