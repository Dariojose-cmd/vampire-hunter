/**
 * Reads the pixel size of a PNG from its signature and IHDR chunk.
 * Pure TypeScript: no React, no DOM, no Node APIs.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Returns width and height, or null if the bytes are not a PNG with a valid IHDR. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 type + 4 width + 4 height = 24 bytes
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== SIGNATURE[i]) return null;
  }
  // First chunk must be IHDR with a 13-byte payload.
  const length = u32(bytes, 8);
  if (length !== 13) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
