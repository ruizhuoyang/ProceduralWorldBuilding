// ─────────────────────────────────────────────────────────
// 3D Perlin noise + fBm (copied from my-react-app/src/lib/voxel/noise3d.ts)
// Seeded via mulberry32 — deterministic, no Math.random.
// ─────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildPermutation(seed: number): Uint8Array {
  const random = mulberry32(seed)
  const source = new Uint8Array(256)
  for (let i = 0; i < 256; i++) source[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = source[i]
    source[i] = source[j]
    source[j] = swap
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = source[i & 255]
  return perm
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

export type Noise3D = (x: number, y: number, z: number) => number

/** Classic 3D Perlin noise, roughly in [-1, 1]. */
export function createPerlin3D(seed: number): Noise3D {
  const p = buildPermutation(seed)
  return (x, y, z) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const X = xi & 255
    const Y = yi & 255
    const Z = zi & 255
    const xf = x - xi
    const yf = y - yi
    const zf = z - zi
    const u = fade(xf)
    const v = fade(yf)
    const w = fade(zf)

    const A = p[X] + Y
    const AA = p[A] + Z
    const AB = p[A + 1] + Z
    const B = p[X + 1] + Y
    const BA = p[B] + Z
    const BB = p[B + 1] + Z

    return lerp(
      lerp(
        lerp(grad(p[AA], xf, yf, zf), grad(p[BA], xf - 1, yf, zf), u),
        lerp(grad(p[AB], xf, yf - 1, zf), grad(p[BB], xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(grad(p[AA + 1], xf, yf, zf - 1), grad(p[BA + 1], xf - 1, yf, zf - 1), u),
        lerp(grad(p[AB + 1], xf, yf - 1, zf - 1), grad(p[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    )
  }
}

/** Fractal sum of Perlin octaves, normalised back to roughly [-1, 1]. */
export function createFbm3D(seed: number, octaves: number, persistence = 0.5): Noise3D {
  const perlin = createPerlin3D(seed)
  const layers = Math.max(1, Math.round(octaves))
  const persist = Math.min(0.95, Math.max(0.05, persistence))
  return (x, y, z) => {
    let amplitude = 1
    let frequency = 1
    let total = 0
    let max = 0
    for (let i = 0; i < layers; i++) {
      total += perlin(x * frequency, y * frequency, z * frequency) * amplitude
      max += amplitude
      amplitude *= persist
      frequency *= 2
    }
    return total / max
  }
}
