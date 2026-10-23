import * as THREE from 'three'
import { createFbm3D } from './noise3d'
import { normalizeStoneColors } from './types'

export type StoneTextures = {
  map: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
}

export type StoneTextureOptions = {
  /** 1 = solid; 2+ = noise-mottled mix across the palette */
  colors?: string[]
  /** 0–1 ochre fleck amount */
  ochreAmount?: number
  size?: number
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return [176, 170, 162]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = clamp01(t)
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ]
}

function shade(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.round(clamp01((rgb[0] / 255) * factor) * 255),
    Math.round(clamp01((rgb[1] / 255) * factor) * 255),
    Math.round(clamp01((rgb[2] / 255) * factor) * 255),
  ]
}

type Noise3 = (x: number, y: number, z: number) => number

/**
 * Cellular-style pick on a planar noise plate (for triplanar projection).
 */
function mixPaletteAt(
  palette: [number, number, number][],
  px: number,
  py: number,
  fields: Noise3[],
): [number, number, number] {
  if (palette.length === 1) return palette[0]!

  let best = 0
  let bestW = -Infinity
  let second = 0
  let secondW = -Infinity

  for (let i = 0; i < palette.length; i++) {
    const n = fields[i]!
    const ox = i * 19.17
    const oy = i * 11.31
    const w =
      n(px * 2.4 + ox, py * 2.4 + oy, 0.37 + i * 0.13) * 0.7 +
      n(px * 5.1 + oy, py * 5.1 + ox, 0.61 + i * 0.09) * 0.3
    if (w > bestW) {
      second = best
      secondW = bestW
      best = i
      bestW = w
    } else if (w > secondW) {
      second = i
      secondW = w
    }
  }

  const gap = bestW - secondW
  const edge = clamp01(1 - gap * 4.5)
  if (edge < 0.04) return palette[best]!
  return lerpRgb(palette[best]!, palette[second]!, edge * 0.45)
}

/**
 * Seeded stone maps as a **planar repeating plate** for triplanar projection.
 * (Not a spherical unwrap — that only made sense with seam-prone sphere UVs.)
 */
export function createStoneTextures(seed: number, options: StoneTextureOptions = {}): StoneTextures {
  const size = options.size ?? 512
  const ochreAmount = options.ochreAmount ?? 0.45
  const hexes = normalizeStoneColors(options.colors)
  const palette = hexes.map(parseHex)

  // Domain scale across the plate (world units ≈ rock radius ~1)
  const plateScale = 3.2

  const shapeNoise = createFbm3D(seed, 5)
  const mottling = createFbm3D((seed ^ 0xa5a5a5a5) >>> 0 || 1, 4)
  const speckles = createFbm3D((seed ^ 0x3c6ef372) >>> 0 || 1, 3)
  const heightFbm = createFbm3D((seed ^ 0x7f4a7c15) >>> 0 || 1, 4)

  const mixFields: Noise3[] = []
  const seeds = [0x85ebca6b, 0xc2b2ae35, 0x27d4eb2d, 0x165667b1, 0xd3a2646c, 0xfd7046c5]
  for (let i = 0; i < palette.length; i++) {
    const s = ((seed ^ seeds[i % seeds.length]!) + i * 0x9e3779b9) >>> 0 || 1
    mixFields.push(createFbm3D(s, 4))
  }

  const albedo = document.createElement('canvas')
  albedo.width = size
  albedo.height = size
  const aCtx = albedo.getContext('2d', { willReadFrequently: true })!
  const aImg = aCtx.createImageData(size, size)

  const rough = document.createElement('canvas')
  rough.width = size
  rough.height = size
  const rCtx = rough.getContext('2d', { willReadFrequently: true })!
  const rImg = rCtx.createImageData(size, size)

  const height = new Float32Array(size * size)

  const ochre: [number, number, number] = [210, 168, 98]
  const speck: [number, number, number] = [228, 196, 128]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Continuous planar coords — tile-friendly for RepeatWrapping + triplanar
      const px = (x / size) * plateScale
      const py = (y / size) * plateScale

      const n1 = shapeNoise(px * 2.2, py * 2.2, 0.2)
      const n2 = mottling(px * 5.5, py * 5.5, 0.4)
      const n3 = speckles(px * 18, py * 18, 0.7)
      const h = heightFbm(px * 7, py * 7, 0.5)
      height[y * size + x] = h

      const base = mixPaletteAt(palette, px, py, mixFields)

      const dark = shade(base, 0.78)
      const mid = shade(base, 1.0)
      const light = shade(base, 1.16)

      const midMask = clamp01((n1 + 0.35) * 0.7)
      const dustMask = clamp01((n2 + 0.15) * 0.55)
      const ochreMask =
        n2 > 0.32 ? clamp01((n2 - 0.32) * 2.4) * 0.65 * ochreAmount : 0
      const speckMask = n3 > 0.45 ? clamp01((n3 - 0.45) * 5) * ochreAmount : 0

      let r = dark[0] * (1 - midMask) + mid[0] * midMask
      let g = dark[1] * (1 - midMask) + mid[1] * midMask
      let b = dark[2] * (1 - midMask) + mid[2] * midMask

      r = r * (1 - dustMask) + light[0] * dustMask
      g = g * (1 - dustMask) + light[1] * dustMask
      b = b * (1 - dustMask) + light[2] * dustMask

      r = r * (1 - ochreMask) + ochre[0] * ochreMask
      g = g * (1 - ochreMask) + ochre[1] * ochreMask
      b = b * (1 - ochreMask) + ochre[2] * ochreMask

      r = r * (1 - speckMask) + speck[0] * speckMask
      g = g * (1 - speckMask) + speck[1] * speckMask
      b = b * (1 - speckMask) + speck[2] * speckMask

      const pore = 0.94 + h * 0.08
      r = Math.min(255, r * pore)
      g = Math.min(255, g * pore)
      b = Math.min(255, b * pore)

      const i = (y * size + x) * 4
      aImg.data[i] = Math.round(clamp01(r / 255) * 255)
      aImg.data[i + 1] = Math.round(clamp01(g / 255) * 255)
      aImg.data[i + 2] = Math.round(clamp01(b / 255) * 255)
      aImg.data[i + 3] = 255

      const roughVal = clamp01(0.72 + n1 * 0.14 - dustMask * 0.1 + speckMask * 0.05)
      const rv = Math.round(roughVal * 255)
      rImg.data[i] = rv
      rImg.data[i + 1] = rv
      rImg.data[i + 2] = rv
      rImg.data[i + 3] = 255
    }
  }

  aCtx.putImageData(aImg, 0, 0)
  rCtx.putImageData(rImg, 0, 0)

  const normal = document.createElement('canvas')
  normal.width = size
  normal.height = size
  const nCtx = normal.getContext('2d')!
  const nImg = nCtx.createImageData(size, size)
  const strength = 4.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = height[y * size + ((x - 1 + size) % size)]!
      const xr = height[y * size + ((x + 1) % size)]!
      const yu = height[((y - 1 + size) % size) * size + x]!
      const yd = height[((y + 1) % size) * size + x]!
      const nx = (xl - xr) * strength
      const ny = (yu - yd) * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      const i = (y * size + x) * 4
      nImg.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      nImg.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      nImg.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255)
      nImg.data[i + 3] = 255
    }
  }
  nCtx.putImageData(nImg, 0, 0)

  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  map.needsUpdate = true

  const roughnessMap = new THREE.CanvasTexture(rough)
  roughnessMap.colorSpace = THREE.NoColorSpace
  roughnessMap.wrapS = THREE.RepeatWrapping
  roughnessMap.wrapT = THREE.RepeatWrapping
  roughnessMap.needsUpdate = true

  const normalMap = new THREE.CanvasTexture(normal)
  normalMap.colorSpace = THREE.NoColorSpace
  normalMap.wrapS = THREE.RepeatWrapping
  normalMap.wrapT = THREE.RepeatWrapping
  normalMap.needsUpdate = true

  return { map, roughnessMap, normalMap }
}

export function disposeStoneTextures(tex: StoneTextures | null | undefined) {
  if (!tex) return
  tex.map.dispose()
  tex.roughnessMap.dispose()
  tex.normalMap.dispose()
}
