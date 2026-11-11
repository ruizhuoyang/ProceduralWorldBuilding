import * as THREE from 'three'
import { buildFossilGeometry } from './buildFossilGeometry'
import { normalizeMeshResolution, type FossilParams } from './types'

/** Polar silhouette samples around the imprint (compact enough for GPU uniforms). */
export const IMPRINT_PROFILE_SAMPLES = 24

const _axis = new THREE.Vector3()
const _tangent = new THREE.Vector3()
const _bitangent = new THREE.Vector3()
const _p = new THREE.Vector3()

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/** Orthonormal tangent frame for a scar normal (stable across CPU / GLSL). */
export function scarTangentBasis(
  scarNormal: THREE.Vector3,
  outT: THREE.Vector3,
  outB: THREE.Vector3,
) {
  _axis.copy(scarNormal).normalize()
  outT.set(0, 1, 0).cross(_axis)
  if (outT.lengthSq() < 0.04) outT.set(1, 0, 0).cross(_axis)
  outT.normalize()
  outB.copy(_axis).cross(outT).normalize()
}

export function defaultCircularProfile(): number[] {
  return Array.from({ length: IMPRINT_PROFILE_SAMPLES }, () => 1)
}

export function normalizeImprintProfile(raw: unknown): number[] {
  const fallback = defaultCircularProfile()
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  const out = new Array<number>(IMPRINT_PROFILE_SAMPLES)
  for (let i = 0; i < IMPRINT_PROFILE_SAMPLES; i++) {
    const src = raw[Math.min(i, raw.length - 1)]
    const n = typeof src === 'number' && Number.isFinite(src) ? src : fallback[i]!
    out[i] = clamp(n, 0.28, 1)
  }
  return out
}

/** Sample a polar profile at angle θ (−π…π). */
export function sampleImprintProfile(profile: number[], theta: number): number {
  const list = profile.length === IMPRINT_PROFILE_SAMPLES ? profile : normalizeImprintProfile(profile)
  const n = IMPRINT_PROFILE_SAMPLES
  const t = ((theta / (Math.PI * 2) + 0.5) % 1 + 1) % 1 * n
  const i0 = Math.floor(t) % n
  const i1 = (i0 + 1) % n
  const f = t - Math.floor(t)
  return list[i0]! * (1 - f) + list[i1]! * f
}

/**
 * Extract a simplified polar silhouette of a fossil as seen along `viewDir`
 * (impact flight direction toward the planet). Keeps recognizable lobes / notches.
 */
export function extractImprintProfile(
  params: FossilParams,
  viewDir: [number, number, number],
): number[] {
  const detail = Math.min(normalizeMeshResolution(params.detail), 10)
  const built = buildFossilGeometry({
    ...params,
    detail,
    baseRadius: 1,
  })
  const pos = built.geometry.getAttribute('position') as THREE.BufferAttribute
  _axis.set(...viewDir)
  if (_axis.lengthSq() < 1e-10) _axis.set(0, -1, 0)
  _axis.normalize()
  scarTangentBasis(_axis, _tangent, _bitangent)

  const bins = new Float32Array(IMPRINT_PROFILE_SAMPLES)
  const hits = new Uint8Array(IMPRINT_PROFILE_SAMPLES)
  for (let i = 0; i < pos.count; i++) {
    _p.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const u = _p.dot(_tangent)
    const v = _p.dot(_bitangent)
    const r = Math.hypot(u, v)
    if (r < 1e-5) continue
    const theta = Math.atan2(v, u)
    const bin = Math.floor(((theta / (Math.PI * 2) + 0.5) % 1) * IMPRINT_PROFILE_SAMPLES)
    const bi = ((bin % IMPRINT_PROFILE_SAMPLES) + IMPRINT_PROFILE_SAMPLES) % IMPRINT_PROFILE_SAMPLES
    if (r > bins[bi]!) {
      bins[bi] = r
      hits[bi] = 1
    }
  }
  built.geometry.dispose()

  // Fill empty angular bins from neighbors so the outline stays closed.
  for (let i = 0; i < IMPRINT_PROFILE_SAMPLES; i++) {
    if (hits[i]) continue
    let found = 0
    let sum = 0
    for (let k = 1; k < IMPRINT_PROFILE_SAMPLES && found < 2; k++) {
      const a = (i - k + IMPRINT_PROFILE_SAMPLES) % IMPRINT_PROFILE_SAMPLES
      const b = (i + k) % IMPRINT_PROFILE_SAMPLES
      if (hits[a]) {
        sum += bins[a]!
        found++
      }
      if (hits[b]) {
        sum += bins[b]!
        found++
      }
    }
    bins[i] = found > 0 ? sum / found : 1
  }

  // Light smooth — simplify without erasing lobes.
  const smoothed = new Float32Array(IMPRINT_PROFILE_SAMPLES)
  for (let i = 0; i < IMPRINT_PROFILE_SAMPLES; i++) {
    const i0 = (i - 1 + IMPRINT_PROFILE_SAMPLES) % IMPRINT_PROFILE_SAMPLES
    const i1 = (i + 1) % IMPRINT_PROFILE_SAMPLES
    smoothed[i] = bins[i0]! * 0.2 + bins[i]! * 0.6 + bins[i1]! * 0.2
  }

  let maxR = 0
  for (let i = 0; i < IMPRINT_PROFILE_SAMPLES; i++) maxR = Math.max(maxR, smoothed[i]!)
  if (maxR < 1e-6) return defaultCircularProfile()

  // Normalize to max=1, then lift the floor so thin spikes still read as a stamp.
  const out = new Array<number>(IMPRINT_PROFILE_SAMPLES)
  for (let i = 0; i < IMPRINT_PROFILE_SAMPLES; i++) {
    const rel = smoothed[i]! / maxR
    out[i] = clamp(0.34 + rel * 0.66, 0.34, 1)
  }
  return out
}

/** Angular edge radius at a surface direction for an imprint (radians on unit sphere). */
export function imprintEdgeAngle(
  scarNormal: THREE.Vector3,
  hitDir: THREE.Vector3,
  profile: number[],
  boundingRadius: number,
): number {
  scarTangentBasis(scarNormal, _tangent, _bitangent)
  const u = hitDir.dot(_tangent)
  const v = hitDir.dot(_bitangent)
  const theta = Math.atan2(v, u)
  return boundingRadius * sampleImprintProfile(profile, theta)
}
