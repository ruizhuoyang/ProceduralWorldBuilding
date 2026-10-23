// ─────────────────────────────────────────────────────────
// Scatter plants on a 10×10 heightfield plane (Class 06 A1)
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'
import { distToPolyline } from '../spline/pathMath'
import type { AvoidPath } from '../spline/influence'
import type { ScatterLayer } from './types'

const PLANE = 10

function hash2(ix: number, iz: number, seed: number): number {
  let n = (ix * 374761393 + iz * 668265263 + seed * 982451653) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function sampleHeight(hf: Float32Array, size: number, u: number, v: number): number {
  const x = Math.max(0, Math.min(size - 1, u * (size - 1)))
  const z = Math.max(0, Math.min(size - 1, v * (size - 1)))
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const x1 = Math.min(size - 1, x0 + 1)
  const z1 = Math.min(size - 1, z0 + 1)
  const tx = x - x0
  const tz = z - z0
  const h00 = hf[z0 * size + x0]
  const h10 = hf[z0 * size + x1]
  const h01 = hf[z1 * size + x0]
  const h11 = hf[z1 * size + x1]
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz
}

/**
 * Sample the heightfield under a world XZ point.
 * - `y` follows the displaced terrain mesh (auto ground-stick).
 * - `slopeDeg` is from the 0..1 map only — Displacement must NOT change
 *   which plants pass density/slope filters (only how tall the mesh looks).
 */
function sampleSurface(
  hf: Float32Array,
  size: number,
  dispScale: number,
  worldX: number,
  worldZ: number,
) {
  const u = (worldX + PLANE / 2) / PLANE
  const v = (worldZ + PLANE / 2) / PLANE
  const h = sampleHeight(hf, size, u, v)
  const eps = 1 / Math.max(size, 1)
  const hx = sampleHeight(hf, size, Math.min(1, u + eps), v)
  const hz = sampleHeight(hf, size, u, Math.min(1, v + eps))
  const worldStep = PLANE * eps

  // Map-space slope (independent of Displacement) for spawn rules.
  const gx = (hx - h) / worldStep
  const gz = (hz - h) / worldStep
  const mapNormal = new THREE.Vector3(-gx, 1, -gz).normalize()
  const slopeRad = Math.acos(Math.max(-1, Math.min(1, mapNormal.y)))

  // World normal matches the visible mesh (includes Displacement) for leaning.
  const wx = ((hx - h) * dispScale) / worldStep
  const wz = ((hz - h) * dispScale) / worldStep
  const meshNormal = new THREE.Vector3(-wx, 1, -wz).normalize()

  return {
    height01: h,
    y: h * dispScale,
    normal: meshNormal,
    slopeDeg: (slopeRad * 180) / Math.PI,
  }
}

export type ScatterInstanceBatch = {
  layerId: string
  plant: ScatterLayer['plant']
  matrices: THREE.Matrix4[]
  colors: THREE.Color[]
}

/**
 * Place plants for one layer. Returns empty if disabled or no heightfield.
 */
export function scatterLayerInstances(
  layer: ScatterLayer,
  heightfield: Float32Array | null,
  displacementScale: number,
  avoidPaths: AvoidPath[] = [],
): ScatterInstanceBatch {
  const matrices: THREE.Matrix4[] = []
  const colors: THREE.Color[] = []
  if (!layer.enabled || !heightfield || heightfield.length < 4) {
    return { layerId: layer.id, plant: layer.plant, matrices, colors }
  }

  const size = Math.round(Math.sqrt(heightfield.length))
  const n = Math.max(4, Math.floor(layer.density))
  const up = new THREE.Vector3(0, 1, 0)
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const pos = new THREE.Vector3()
  const mat = new THREE.Matrix4()
  const baseColor = new THREE.Color()

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const jitterX = hash2(ix, iz, layer.seed) - 0.5
      const jitterZ = hash2(ix, iz, layer.seed + 17) - 0.5
      const worldX = -PLANE / 2 + ((ix + 0.5 + jitterX * 0.85) / n) * PLANE
      const worldZ = -PLANE / 2 + ((iz + 0.5 + jitterZ * 0.85) / n) * PLANE
      if (worldX < -PLANE / 2 + 0.15 || worldX > PLANE / 2 - 0.15) continue
      if (worldZ < -PLANE / 2 + 0.15 || worldZ > PLANE / 2 - 0.15) continue

      const gate = hash2(ix * 3, iz * 5, layer.seed + 31)
      if (gate < layer.noiseThreshold) continue

      // Class 06 A2 — spline ban: keep plants off roads / rivers
      let banned = false
      for (const path of avoidPaths) {
        if (distToPolyline(worldX, worldZ, path.points) < path.radius) {
          banned = true
          break
        }
      }
      if (banned) continue

      const surf = sampleSurface(heightfield, size, displacementScale, worldX, worldZ)
      if (surf.slopeDeg > layer.maxSlopeDeg) continue
      if (surf.height01 < layer.heightMin || surf.height01 > layer.heightMax) continue

      // Hard floor: trees never sit in river / valley bottoms.
      if (layer.plant === 'tree' && surf.height01 < 0.48) continue
      if (layer.plant === 'bush' && surf.height01 < 0.38) continue

      if (layer.nearWater) {
        // Optional low-band preference (off by default for highland plants).
        const shore = 1 - Math.abs(surf.height01 - 0.28) / 0.3
        if (shore < 0.15 || hash2(ix, iz, layer.seed + 71) > shore) continue
      }

      const yaw = hash2(ix, iz, layer.seed + 53) * Math.PI * 2
      const sizeMul =
        layer.plant === 'tree'
          ? 0.75 + surf.height01 * 0.55 + hash2(ix, iz, layer.seed + 11) * 0.35
          : layer.plant === 'bush'
            ? 0.7 + hash2(ix, iz, layer.seed + 11) * 0.5
            : 0.55 + hash2(ix, iz, layer.seed + 11) * 0.7

      pos.set(worldX, surf.y, worldZ)
      if (layer.alignToNormal) {
        quat.setFromUnitVectors(up, surf.normal)
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw))
      } else {
        quat.setFromAxisAngle(up, yaw)
      }
      scale.setScalar(sizeMul)
      mat.compose(pos, quat, scale)
      matrices.push(mat.clone())

      // Terrain-driven leaf tint: higher = cooler/darker, lower = warmer.
      const hueShift = (0.5 - surf.height01) * 0.12
      const light = 0.85 + surf.height01 * 0.25
      if (layer.plant === 'tree') baseColor.setHSL(0.33 + hueShift, 0.45, 0.32 * light)
      else if (layer.plant === 'bush') baseColor.setHSL(0.3 + hueShift, 0.4, 0.36 * light)
      else baseColor.setHSL(0.28 + hueShift * 0.5, 0.5, 0.42 * light)
      colors.push(baseColor.clone())
    }
  }

  return { layerId: layer.id, plant: layer.plant, matrices, colors }
}
