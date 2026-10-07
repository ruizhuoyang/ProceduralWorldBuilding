// ─────────────────────────────────────────────────────────
// Shader study modes — Class 05 Assignment 2 swap strategies
// ─────────────────────────────────────────────────────────

export type ShaderStudyMode = 'deform' | 'contact' | 'ripple' | 'particles'

export const SHADER_STUDY_MODES: { value: ShaderStudyMode; label: string }[] = [
  { value: 'deform', label: 'Deform' },
  { value: 'contact', label: 'Contact' },
  { value: 'ripple', label: 'Ripple' },
  { value: 'particles', label: 'Particles' },
]

export type ShaderStudyParams = {
  // Mesh deformation
  amplitude: number
  frequency: number
  speed: number
  // Depth + contact foam
  shallowColor: string
  deepColor: string
  foamColor: string
  foamWidth: number
  depthScale: number
  // Click ripples
  rippleStrength: number
  rippleWavelength: number
  rippleDecay: number
  // Particles
  particleCount: number
  particleSize: number
  particleSpawnRate: number
  particleLife: number
}

export const DEFAULT_SHADER_STUDY_PARAMS: ShaderStudyParams = {
  amplitude: 0.18,
  frequency: 1.6,
  speed: 1.1,
  shallowColor: '#6ec8e0',
  deepColor: '#0b3d66',
  foamColor: '#ffffff',
  foamWidth: 0.22,
  depthScale: 1.4,
  rippleStrength: 0.28,
  rippleWavelength: 1.8,
  rippleDecay: 1.6,
  particleCount: 400,
  particleSize: 0.08,
  particleSpawnRate: 45,
  particleLife: 2.2,
}

export function createDefaultShaderParams(): ShaderStudyParams {
  return { ...DEFAULT_SHADER_STUDY_PARAMS }
}

/** Up to 4 rock spheres: xyz = center, w = radius. */
export type RockUniform = [number, number, number, number]

export const DEFAULT_ROCKS: RockUniform[] = [
  [1.6, -0.15, 0.8, 0.85],
  [-1.8, -0.35, -1.1, 1.05],
  [0.2, -0.55, -1.9, 0.7],
  [-0.6, -0.1, 1.7, 0.55],
]
