// ─────────────────────────────────────────────────────────
// Soft point particles — custom shader beside the water mesh
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'

const particleVertexShader = /* glsl */ `
attribute float aLife;
attribute float aMaxLife;
uniform float uSize;
varying float vLifeT;
varying float vSeed;

void main() {
  vLifeT = clamp(aLife / max(aMaxLife, 0.001), 0.0, 1.0);
  vSeed = fract(position.x * 12.9898 + position.z * 78.233);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float grow = smoothstep(0.0, 0.15, vLifeT) * (1.0 - smoothstep(0.7, 1.0, vLifeT));
  gl_PointSize = uSize * (300.0 / -mv.z) * (0.55 + grow * 0.9);
  gl_Position = projectionMatrix * mv;
}
`

const particleFragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vLifeT;
varying float vSeed;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float soft = exp(-d * 2.8);
  float fade = (1.0 - vLifeT);
  float alpha = soft * fade * (0.55 + 0.35 * vSeed);
  gl_FragColor = vec4(uColor, alpha);
}
`

export type ParticleState = {
  positions: Float32Array
  velocities: Float32Array
  life: Float32Array
  maxLife: Float32Array
  count: number
}

export function createParticleState(count: number): ParticleState {
  return {
    positions: new Float32Array(count * 3),
    velocities: new Float32Array(count * 3),
    life: new Float32Array(count),
    maxLife: new Float32Array(count),
    count,
  }
}

export function createParticleMaterial(size: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uColor: { value: new THREE.Color(0xb7d8ef) },
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

function spawnOne(state: ParticleState, i: number, life: number) {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * 4.2
  state.positions[i * 3] = Math.cos(angle) * radius
  state.positions[i * 3 + 1] = 1.2 + Math.random() * 1.8
  state.positions[i * 3 + 2] = Math.sin(angle) * radius
  state.velocities[i * 3] = (Math.random() - 0.5) * 0.35
  state.velocities[i * 3 + 1] = -0.6 - Math.random() * 0.9
  state.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.35
  state.maxLife[i] = life * (0.7 + Math.random() * 0.6)
  state.life[i] = state.maxLife[i]
}

export function resetParticles(state: ParticleState, life: number) {
  for (let i = 0; i < state.count; i++) spawnOne(state, i, life)
}

/** Integrate particles; returns true if buffers need upload. */
export function stepParticles(
  state: ParticleState,
  dt: number,
  spawnRate: number,
  life: number,
): void {
  let spawnBudget = spawnRate * dt
  for (let i = 0; i < state.count; i++) {
    if (state.life[i] <= 0) {
      if (spawnBudget > 0) {
        spawnOne(state, i, life)
        spawnBudget -= 1
      }
      continue
    }
    state.life[i] -= dt
    state.velocities[i * 3 + 1] -= 1.8 * dt
    state.positions[i * 3] += state.velocities[i * 3] * dt
    state.positions[i * 3 + 1] += state.velocities[i * 3 + 1] * dt
    state.positions[i * 3 + 2] += state.velocities[i * 3 + 2] * dt
    // Splash bounce on the water plane (y≈0) then fade
    if (state.positions[i * 3 + 1] < 0.05 && state.velocities[i * 3 + 1] < 0) {
      state.positions[i * 3 + 1] = 0.05
      state.velocities[i * 3 + 1] *= -0.35
      state.velocities[i * 3] *= 0.8
      state.velocities[i * 3 + 2] *= 0.8
      state.life[i] *= 0.85
    }
  }
}
