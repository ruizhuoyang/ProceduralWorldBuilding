// ─────────────────────────────────────────────────────────
// Water ShaderMaterial — deform + depth/contact + click ripples
// Class 05: vertex displacement, contact foam, depth tint
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'
import type { RockUniform, ShaderStudyMode, ShaderStudyParams } from './types'
import { DEFAULT_ROCKS } from './types'

export const MAX_RIPPLES = 4

const waterVertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;
uniform float uEnableDeform;
uniform float uEnableRipple;
uniform float uRippleStrength;
uniform float uRippleWavelength;
uniform float uRippleDecay;
uniform vec4 uRipples[${MAX_RIPPLES}]; // xy = xz origin, z = startTime, w = strength (0 = unused)
uniform sampler2D uHeightMap;
uniform float uHasHeightMap;
uniform float uExtent;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vFoamHint;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float deformHeight(vec2 xz) {
  float t = uTime * uSpeed;
  float h = sin(xz.x * uFrequency + t) * cos(xz.y * uFrequency * 0.85 - t * 0.7);
  h += (noise(xz * uFrequency * 0.55 + t * 0.15) - 0.5) * 1.4;
  return h * uAmplitude * uEnableDeform;
}

float rippleHeight(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.001) continue;
    float age = max(0.0, uTime - r.z);
    float dist = length(xz - r.xy);
    float wave = sin(dist * uRippleWavelength - age * 6.5);
    float envelope = exp(-age * uRippleDecay) * exp(-dist * 0.55);
    h += wave * envelope * r.w * uRippleStrength * uEnableRipple;
  }
  return h;
}

float sampleBed(vec2 xz) {
  if (uHasHeightMap > 0.5) {
    vec2 uv = xz / max(uExtent, 0.001) + 0.5;
    return texture2D(uHeightMap, clamp(uv, 0.0, 1.0)).r;
  }
  return -1e9;
}

void main() {
  vec3 pos = position;
  vec2 xz = pos.xz;
  float h = deformHeight(xz) + rippleHeight(xz);
  pos.y += h;

  // Soft collision: do not push the free surface under the voxel terrain.
  float bed = sampleBed(xz);
  if (bed > -1e8) pos.y = max(pos.y, bed + 0.02);

  // Finite-difference normals for lighting
  float e = 0.08;
  float hx = deformHeight(xz + vec2(e, 0.0)) + rippleHeight(xz + vec2(e, 0.0));
  float hz = deformHeight(xz + vec2(0.0, e)) + rippleHeight(xz + vec2(0.0, e));
  vec3 tangent = normalize(vec3(e, hx - h, 0.0));
  vec3 bitangent = normalize(vec3(0.0, hz - h, e));
  vec3 n = normalize(cross(bitangent, tangent));

  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vFoamHint = abs(h);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const waterFragmentShader = /* glsl */ `
uniform float uEnableContact;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform float uFoamWidth;
uniform float uDepthScale;
uniform vec4 uRocks[4]; // xyz center, w radius (fallback demo rocks)
uniform sampler2D uHeightMap;
uniform float uHasHeightMap;
uniform float uExtent;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vFoamHint;

float bedHeight(vec2 xz) {
  // Prefer voxel terrain height texture when available.
  if (uHasHeightMap > 0.5) {
    vec2 uv = xz / max(uExtent, 0.001) + 0.5;
    return texture2D(uHeightMap, clamp(uv, 0.0, 1.0)).r;
  }
  return -1.15 + 0.22 * sin(xz.x * 0.9) * cos(xz.y * 0.75);
}

float rockFoam(vec2 xz, float waterY) {
  float foam = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rock = uRocks[i];
    float dist = length(xz - rock.xz);
    float radial = 1.0 - smoothstep(rock.w, rock.w + uFoamWidth, dist);
    float top = rock.y + rock.w;
    float bottom = rock.y - rock.w;
    float band = smoothstep(bottom - 0.15, bottom + 0.05, waterY) *
                 (1.0 - smoothstep(top - 0.05, top + 0.2, waterY));
    foam = max(foam, radial * band);
  }
  return foam * uEnableContact;
}

void main() {
  vec2 xz = vWorldPos.xz;
  float waterY = vWorldPos.y;
  float bed = bedHeight(xz);
  float rawDepth = waterY - bed;
  // Terrain collision: discard where the free surface is under rock (shore cutout).
  if (uHasHeightMap > 0.5 && rawDepth < 0.01) discard;

  float depth = max(0.0, rawDepth) * uDepthScale;
  float depthT = clamp(depth * 0.55, 0.0, 1.0);
  vec3 col = mix(uShallowColor, uDeepColor, depthT);

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(0.0, dot(viewDir, normalize(vNormalW))), 3.0);
  col = mix(col, vec3(0.75, 0.9, 1.0), fresnel * 0.35);

  // Shore foam against voxel terrain (shallow depth band) + optional rock spheres.
  float shore = (1.0 - smoothstep(0.0, uFoamWidth * 2.5, depth)) * uEnableContact;
  float foam = max(rockFoam(xz, waterY), shore);
  foam = max(foam, vFoamHint * 0.15 * uEnableContact);
  col = mix(col, uFoamColor, clamp(foam, 0.0, 1.0));

  float alpha = mix(0.72, 0.92, depthT);
  gl_FragColor = vec4(col, alpha);
}
`

function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex)
  return new THREE.Vector3(c.r, c.g, c.b)
}

export function createWaterMaterial(params: ShaderStudyParams, mode: ShaderStudyMode): THREE.ShaderMaterial {
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0))
  const rocks = DEFAULT_ROCKS.map((r) => new THREE.Vector4(...r))

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAmplitude: { value: params.amplitude },
      uFrequency: { value: params.frequency },
      uSpeed: { value: params.speed },
      uEnableDeform: { value: mode === 'deform' || mode === 'particles' || mode === 'ripple' ? 1 : 0.35 },
      uEnableRipple: { value: mode === 'ripple' ? 1 : 0 },
      uEnableContact: { value: mode === 'contact' || mode === 'deform' ? 1 : 0.5 },
      uRippleStrength: { value: params.rippleStrength },
      uRippleWavelength: { value: params.rippleWavelength },
      uRippleDecay: { value: params.rippleDecay },
      uRipples: { value: ripples },
      uShallowColor: { value: hexToVec3(params.shallowColor) },
      uDeepColor: { value: hexToVec3(params.deepColor) },
      uFoamColor: { value: hexToVec3(params.foamColor) },
      uFoamWidth: { value: params.foamWidth },
      uDepthScale: { value: params.depthScale },
      uRocks: { value: rocks },
      uHeightMap: { value: null },
      uHasHeightMap: { value: 0 },
      uExtent: { value: 8 },
    },
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}

export function syncWaterUniforms(
  material: THREE.ShaderMaterial,
  params: ShaderStudyParams,
  mode: ShaderStudyMode,
  time: number,
  ripples: THREE.Vector4[],
  rocks: RockUniform[] = DEFAULT_ROCKS,
  heightMap: THREE.Texture | null = null,
  extent = 8,
) {
  const u = material.uniforms
  u.uTime.value = time
  u.uAmplitude.value = params.amplitude
  u.uFrequency.value = params.frequency
  u.uSpeed.value = params.speed
  u.uEnableDeform.value = mode === 'contact' ? 0.25 : 1
  u.uEnableRipple.value = mode === 'ripple' ? 1 : 0
  u.uEnableContact.value = mode === 'particles' ? 0.35 : 1
  u.uRippleStrength.value = params.rippleStrength
  u.uRippleWavelength.value = params.rippleWavelength
  u.uRippleDecay.value = params.rippleDecay
  u.uShallowColor.value.copy(hexToVec3(params.shallowColor))
  u.uDeepColor.value.copy(hexToVec3(params.deepColor))
  u.uFoamColor.value.copy(hexToVec3(params.foamColor))
  u.uFoamWidth.value = params.foamWidth
  u.uDepthScale.value = params.depthScale
  u.uExtent.value = extent
  u.uHeightMap.value = heightMap
  u.uHasHeightMap.value = heightMap ? 1 : 0
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const src = ripples[i] ?? new THREE.Vector4(0, 0, 0, 0)
    ;(u.uRipples.value as THREE.Vector4[])[i].copy(src)
  }
  for (let i = 0; i < 4; i++) {
    const r = rocks[i] ?? DEFAULT_ROCKS[i]
    ;(u.uRocks.value as THREE.Vector4[])[i].set(r[0], r[1], r[2], r[3])
  }
}
