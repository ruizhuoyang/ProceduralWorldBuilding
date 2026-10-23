// ─────────────────────────────────────────────────────────
// Procedural plant assets (simple primitives, no external GLB)
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PlantKind } from './types'

function paint(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** Pine-ish tree: trunk + stacked cones. */
function createTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.04, 0.07, 0.45, 6)
  trunk.translate(0, 0.225, 0)
  paint(trunk, new THREE.Color(0x5c3d24))

  const crownParts: THREE.BufferGeometry[] = []
  const leaf = new THREE.Color(0x2f7a45)
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.ConeGeometry(0.28 - i * 0.06, 0.38, 7)
    cone.translate(0, 0.55 + i * 0.22, 0)
    paint(cone, leaf.clone().offsetHSL(0, 0, i * 0.04))
    crownParts.push(cone)
  }

  const merged = mergeGeometries([trunk, ...crownParts], false)
  trunk.dispose()
  crownParts.forEach((g) => g.dispose())
  if (!merged) throw new Error('Failed to merge tree geometry')
  merged.computeVertexNormals()
  return merged
}

/** Low rounded bush from a few spheres. */
function createBushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const green = new THREE.Color(0x3d8f4a)
  const offsets: [number, number, number, number][] = [
    [0, 0.14, 0, 0.16],
    [0.1, 0.12, 0.06, 0.12],
    [-0.09, 0.11, -0.05, 0.11],
    [0.02, 0.18, -0.08, 0.1],
  ]
  offsets.forEach(([x, y, z, r], i) => {
    const s = new THREE.SphereGeometry(r, 7, 5)
    s.translate(x, y, z)
    paint(s, green.clone().offsetHSL((i - 1.5) * 0.02, 0, 0))
    parts.push(s)
  })
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('Failed to merge bush geometry')
  merged.computeVertexNormals()
  return merged
}

/** Grass tuft: thin blades. */
function createGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const tip = new THREE.Color(0x6db86a)
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.ConeGeometry(0.025, 0.28 + (i % 3) * 0.04, 3)
    const a = (i / 5) * Math.PI * 2
    blade.translate(Math.cos(a) * 0.04, 0.14, Math.sin(a) * 0.04)
    blade.rotateZ(((i % 3) - 1) * 0.12)
    paint(blade, tip.clone().offsetHSL(0, 0, (i - 2) * 0.03))
    parts.push(blade)
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!merged) throw new Error('Failed to merge grass geometry')
  merged.computeVertexNormals()
  return merged
}

const cache = new Map<PlantKind, THREE.BufferGeometry>()

export function getPlantGeometry(kind: PlantKind): THREE.BufferGeometry {
  let g = cache.get(kind)
  if (g) return g
  g = kind === 'tree' ? createTreeGeometry() : kind === 'bush' ? createBushGeometry() : createGrassGeometry()
  cache.set(kind, g)
  return g
}

export function createPlantMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  })
}
