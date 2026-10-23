import * as THREE from 'three'
import { createFbm3D } from './noise3d'
import { buildDigitRegions, sampleDigitBump } from './digitRegions'
import { hashDigits } from './hashDigits'
import { buildLandformSites, sampleLandforms } from './landforms'
import { normalizeMeshResolution, type DigitRegion, type FossilParams } from './types'

const GOLDEN = (1 + Math.sqrt(5)) / 2

const ICO_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, GOLDEN, 0],
  [1, GOLDEN, 0],
  [-1, -GOLDEN, 0],
  [1, -GOLDEN, 0],
  [0, -1, GOLDEN],
  [0, 1, GOLDEN],
  [0, -1, -GOLDEN],
  [0, 1, -GOLDEN],
  [GOLDEN, 0, -1],
  [GOLDEN, 0, 1],
  [-GOLDEN, 0, -1],
  [-GOLDEN, 0, 1],
]

const ICO_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
]

function keyVertex(x: number, y: number, z: number): string {
  return `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`
}

/**
 * Class-I geodesic icosahedron. Frequency f → 10f²+2 verts, 20f² faces.
 * One step in f is a small density change, unlike IcosahedronGeometry(detail)
 * which multiplies faces by 4 each tick.
 */
export function createIcosphereGeometry(frequency: number): THREE.BufferGeometry {
  const f = Math.max(1, Math.round(frequency))
  const positions: number[] = []
  const vertexIndex = new Map<string, number>()

  const vert = (x: number, y: number, z: number): number => {
    const len = Math.hypot(x, y, z) || 1
    const nx = x / len
    const ny = y / len
    const nz = z / len
    const key = keyVertex(nx, ny, nz)
    const existing = vertexIndex.get(key)
    if (existing !== undefined) return existing
    const i = positions.length / 3
    positions.push(nx, ny, nz)
    vertexIndex.set(key, i)
    return i
  }

  const indices: number[] = []

  for (const face of ICO_FACES) {
    const a = ICO_VERTS[face[0]]!
    const b = ICO_VERTS[face[1]]!
    const c = ICO_VERTS[face[2]]!
    const grid: number[][] = []

    for (let i = 0; i <= f; i++) {
      const row: number[] = []
      for (let j = 0; j <= f - i; j++) {
        const k = f - i - j
        row.push(vert((k * a[0] + j * b[0] + i * c[0]) / f, (k * a[1] + j * b[1] + i * c[1]) / f, (k * a[2] + j * b[2] + i * c[2]) / f))
      }
      grid.push(row)
    }

    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        const v00 = grid[i]![j]!
        const v01 = grid[i]![j + 1]!
        const v10 = grid[i + 1]![j]!
        indices.push(v00, v01, v10)
        if (j < f - i - 1) {
          indices.push(v10, v01, grid[i + 1]![j + 1]!)
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

export type FossilBuildResult = {
  geometry: THREE.BufferGeometry
  seed: number
  regions: DigitRegion[]
  /** Actual displaced radius range — used as the Height Tint LUT domain. */
  radiusMin: number
  radiusMax: number
}

/**
 * Build a rock mesh from an icosahedron by radial displacement.
 * Displacements are always computed from the undeformed unit sphere —
 * never from a previously deformed mesh (no cumulative warp).
 * Spherical UVs are written so stone albedo / normal maps wrap cleanly.
 */
export function buildFossilGeometry(params: FossilParams): FossilBuildResult {
  const seed = hashDigits(params.digits)
  const regions = buildDigitRegions(params.digits, params.digitStrength)
  const fbm = createFbm3D(seed, params.fbmOctaves)
  const grainFbm = createFbm3D((seed ^ 0xa5a5a5a5) >>> 0 || 1, 3, 0.45)
  const grainScale = params.noiseScale * 6.5
  const grainAmp = params.normalStrength * 0.04
  const landformSites = buildLandformSites(seed, params.landformLayers)

  const base = createIcosphereGeometry(normalizeMeshResolution(params.detail))
  const positions = base.attributes.position
  if (!positions) {
    throw new Error('Icosphere missing position attribute')
  }

  const count = positions.count
  const out = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  let rMin = Number.POSITIVE_INFINITY
  let rMax = Number.NEGATIVE_INFINITY

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    const len = Math.hypot(x, y, z) || 1
    const dx = x / len
    const dy = y / len
    const dz = z / len

    const noiseDisp =
      fbm(dx * params.noiseScale, dy * params.noiseScale, dz * params.noiseScale) *
      params.noiseStrength
    const digitDisp = sampleDigitBump(dx, dy, dz, regions)
    const grainDisp = grainFbm(dx * grainScale, dy * grainScale, dz * grainScale) * grainAmp
    const landDisp = sampleLandforms(dx, dy, dz, landformSites)
    let r = params.baseRadius + noiseDisp + digitDisp + grainDisp + landDisp
    r = Math.min(params.radiusMax, Math.max(0.18, r))
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r

    out[i * 3] = dx * r
    out[i * 3 + 1] = dy * r
    out[i * 3 + 2] = dz * r

    // Spherical UV from undeformed direction (matches createStoneTextures sampling)
    const u = (Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1
    const v = Math.acos(Math.min(1, Math.max(-1, dy))) / Math.PI
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }

  base.setAttribute('position', new THREE.BufferAttribute(out, 3))
  base.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  base.computeVertexNormals()
  base.computeBoundingSphere()

  if (!Number.isFinite(rMin) || !Number.isFinite(rMax)) {
    rMin = params.radiusMin
    rMax = params.radiusMax
  }
  // Keep a sliver of range so a near-sphere still maps through the LUT.
  if (rMax - rMin < 0.02) {
    const mid = (rMin + rMax) * 0.5
    rMin = mid - 0.01
    rMax = mid + 0.01
  }

  return { geometry: base, seed, regions, radiusMin: rMin, radiusMax: rMax }
}

/** Compare two builds for determinism tests (same params → identical positions). */
export function geometryPositionsEqual(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  const pa = a.attributes.position
  const pb = b.attributes.position
  if (!pa || !pb || pa.count !== pb.count) return false
  const aa = pa.array
  const ba = pb.array
  if (aa.length !== ba.length) return false
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== ba[i]) return false
  }
  return true
}
