// Build 3D ribbons / centerlines from UV splines projected onto the heightfield

import * as THREE from 'three'
import { PLANE, resampleCatmullRom, sampleHeight, uvToWorld } from './pathMath'
import { convertToKind, type ConvertTo, type GeneratedSpline, type SplinePCGParams } from './types'

export type WorldPathPoint = { x: number; y: number; z: number; u: number; v: number }

export function projectControlsToWorld(
  controls: { u: number; v: number }[],
  samples: number,
  heightfield: Float32Array,
  displacementScale: number,
  yOffset: number,
): WorldPathPoint[] {
  if (controls.length < 2) return []
  const size = Math.round(Math.sqrt(heightfield.length))
  const uv = resampleCatmullRom(controls, samples)
  return uv.map(({ u, v }) => {
    const { x, z } = uvToWorld(u, v)
    const h = sampleHeight(heightfield, size, u, v)
    return { x, y: h * displacementScale + yOffset, z, u, v }
  })
}

export function projectSplinePath(
  path: GeneratedSpline,
  params: SplinePCGParams,
  heightfield: Float32Array,
  displacementScale: number,
): WorldPathPoint[] {
  const yOffset = params.convertTo === 'river' ? 0.02 : params.convertTo === 'roads' ? 0.04 : 0.06
  return projectControlsToWorld(
    path.controls,
    params.samples,
    heightfield,
    displacementScale,
    yOffset,
  )
}

/** Control-point world positions (exact nodes, not dense samples). */
export function projectControlMarkers(
  path: GeneratedSpline,
  heightfield: Float32Array,
  displacementScale: number,
  yOffset = 0.08,
): WorldPathPoint[] {
  const size = Math.round(Math.sqrt(heightfield.length))
  return path.controls.map(({ u, v }) => {
    const { x, z } = uvToWorld(u, v)
    const h = sampleHeight(heightfield, size, u, v)
    return { x, y: h * displacementScale + yOffset, z, u, v }
  })
}

export function kindColor(mode: ConvertTo): THREE.Color {
  switch (mode) {
    case 'river':
      return new THREE.Color(0x3a8ec8)
    case 'roads':
      return new THREE.Color(0x55555a)
    case 'splineOnly':
    default:
      return new THREE.Color(0x6ec8ff)
  }
}

export function buildRibbonGeometry(
  path: WorldPathPoint[],
  width: number,
): THREE.BufferGeometry | null {
  if (path.length < 2) return null
  const half = width * 0.5
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  let lengthAcc = 0
  const lengths = [0]
  for (let i = 1; i < path.length; i++) {
    lengthAcc += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
    lengths.push(lengthAcc)
  }
  const totalLen = Math.max(lengthAcc, 1e-6)

  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)]
    const next = path[Math.min(path.length - 1, i + 1)]
    let tx = next.x - prev.x
    let tz = next.z - prev.z
    const tLen = Math.hypot(tx, tz) || 1
    tx /= tLen
    tz /= tLen
    const sx = -tz
    const sz = tx
    const p = path[i]
    positions.push(p.x - sx * half, p.y, p.z - sz * half, p.x + sx * half, p.y, p.z + sz * half)
    normals.push(0, 1, 0, 0, 1, 0)
    const vv = lengths[i] / totalLen
    uvs.push(0, vv, 1, vv)
    if (i < path.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export function createRibbonMaterial(mode: ConvertTo): THREE.MeshStandardMaterial {
  const color = kindColor(mode)
  return new THREE.MeshStandardMaterial({
    color,
    roughness: mode === 'river' ? 0.22 : 0.9,
    metalness: mode === 'river' ? 0.12 : 0.04,
    transparent: mode === 'river',
    opacity: mode === 'river' ? 0.88 : 1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
}

export function createCenterlineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0x7ad0ff,
    transparent: true,
    opacity: 0.95,
  })
}

export function pathXZ(path: WorldPathPoint[]): { x: number; z: number }[] {
  return path.map((p) => ({ x: p.x, z: p.z }))
}

export function planeExtent() {
  return PLANE
}

export { convertToKind }
