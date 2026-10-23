import * as THREE from 'three'
import { STONE_COLOR_MAX, normalizeColorAlts, normalizeStoneColors } from './types'

const CACHE_KEY = 'data-fossil-stone-noise-v6'

export type StoneNoiseParams = {
  colors: string[]
  colorAlts?: number[]
  seed: number
  normalStrength: number
  noiseScale?: number
  heightBlend?: number
  radiusMin?: number
  radiusMax?: number
}

type StoneUniforms = {
  uColors: { value: THREE.Vector3[] }
  uStops: { value: number[] }
  uColorCount: { value: number }
  uSeed: { value: number }
  uGrain: { value: number }
  uNoiseScale: { value: number }
  uHeightBlend: { value: number }
  uRadiusMin: { value: number }
  uRadiusMax: { value: number }
}

function hexToVec3(hex: string): THREE.Vector3 {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (!Number.isFinite(n)) return new THREE.Vector3(0.69, 0.667, 0.635)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function writePalette(target: THREE.Vector3[], colors: string[]) {
  const list = normalizeStoneColors(colors)
  for (let i = 0; i < STONE_COLOR_MAX; i++) {
    const hex = list[Math.min(i, list.length - 1)]!
    target[i]!.copy(hexToVec3(hex))
  }
}

function writeStops(target: number[], alts: number[], count: number) {
  const stops = normalizeColorAlts(alts, count)
  for (let i = 0; i < STONE_COLOR_MAX; i++) {
    target[i] = stops[Math.min(i, stops.length - 1)] ?? 0
  }
}

function getUniforms(material: THREE.MeshStandardMaterial): StoneUniforms | undefined {
  return material.userData.stoneUniforms as StoneUniforms | undefined
}

/**
 * Patch MeshStandardMaterial so albedo / roughness / normals come from
 * object-space 3D fBm — no 2D plate, no triplanar seams.
 */
export function enableStoneNoiseMaterial(material: THREE.MeshStandardMaterial): void {
  // Declares fragment `normalMatrix` when we also assign a dummy later? We inject it ourselves.
  material.normalMapType = THREE.ObjectSpaceNormalMap

  const colors = Array.from({ length: STONE_COLOR_MAX }, () => new THREE.Vector3(0.69, 0.667, 0.635))
  const uniforms: StoneUniforms = {
    uColors: { value: colors },
    uStops: { value: Array.from({ length: STONE_COLOR_MAX }, (_, i) => (i === 0 ? 0 : 1)) },
    uColorCount: { value: 1 },
    uSeed: { value: 1 },
    uGrain: { value: 0.9 },
    uNoiseScale: { value: 2.4 },
    uHeightBlend: { value: 0.45 },
    uRadiusMin: { value: 0.4 },
    uRadiusMax: { value: 1.75 },
  }
  material.userData.stoneUniforms = uniforms

  material.customProgramCacheKey = () => CACHE_KEY

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uColors = uniforms.uColors
    shader.uniforms.uStops = uniforms.uStops
    shader.uniforms.uColorCount = uniforms.uColorCount
    shader.uniforms.uSeed = uniforms.uSeed
    shader.uniforms.uGrain = uniforms.uGrain
    shader.uniforms.uNoiseScale = uniforms.uNoiseScale
    shader.uniforms.uHeightBlend = uniforms.uHeightBlend
    shader.uniforms.uRadiusMin = uniforms.uRadiusMin
    shader.uniforms.uRadiusMax = uniforms.uRadiusMax

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vObjectPos;
        varying vec3 vObjectNormal;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vObjectPos = transformed;
        `,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        /* glsl */ `
        #include <defaultnormal_vertex>
        vObjectNormal = normalize(objectNormal);
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vObjectPos;
        varying vec3 vObjectNormal;
        uniform vec3 uColors[${STONE_COLOR_MAX}];
        uniform float uStops[${STONE_COLOR_MAX}];
        uniform int uColorCount;
        uniform float uSeed;
        uniform float uGrain;
        uniform float uNoiseScale;
        uniform float uHeightBlend;
        uniform float uRadiusMin;
        uniform float uRadiusMax;
        uniform mat3 normalMatrix;

        vec3 seedOff() {
          return vec3(
            fract(uSeed * 0.0001234) * 47.0,
            fract(uSeed * 0.0003456) * 53.0,
            fract(uSeed * 0.0005678) * 59.0
          );
        }

        float hash13(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash13(i);
          float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
          return mix(
            mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
            mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
            f.z
          );
        }

        float fbm3(vec3 p) {
          float amp = 0.5;
          float freq = 1.0;
          float sum = 0.0;
          float norm = 0.0;
          for (int i = 0; i < 5; i++) {
            sum += noise3(p * freq) * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2.0;
          }
          return sum / max(norm, 1e-5);
        }

        float fieldAt(vec3 p, float ox, float oy, float oz) {
          vec3 o = vec3(ox, oy, oz) + seedOff();
          return fbm3(p * 2.4 + o) * 0.7 + fbm3(p * 5.1 + o.yzx) * 0.3;
        }

        vec3 sampleHeightLut(float t) {
          int n = uColorCount;
          if (n <= 1) return uColors[0];
          float x = clamp(t, 0.0, 1.0);
          int lo = 0;
          int hi = 0;
          float loT = -1.0e9;
          float hiT = 1.0e9;
          bool hasLo = false;
          bool hasHi = false;
          for (int i = 0; i < ${STONE_COLOR_MAX}; i++) {
            if (i >= n) break;
            float s = uStops[i];
            if (s <= x && s >= loT) { lo = i; loT = s; hasLo = true; }
            if (s >= x && s <= hiT) { hi = i; hiT = s; hasHi = true; }
          }
          if (!hasLo) return uColors[hi];
          if (!hasHi) return uColors[lo];
          float span = hiT - loT;
          float f = span < 1e-4 ? 0.0 : clamp((x - loT) / span, 0.0, 1.0);
          return mix(uColors[lo], uColors[hi], f);
        }

        vec3 mixPalette(vec3 p) {
          if (uColorCount <= 1) return uColors[0];
          float bestW = -1.0e9;
          float secondW = -1.0e9;
          int best = 0;
          int second = 0;
          for (int i = 0; i < ${STONE_COLOR_MAX}; i++) {
            if (i >= uColorCount) break;
            float w = fieldAt(p, float(i) * 19.17, float(i) * 11.31, float(i) * 7.63);
            if (w > bestW) {
              second = best;
              secondW = bestW;
              best = i;
              bestW = w;
            } else if (w > secondW) {
              second = i;
              secondW = w;
            }
          }
          float gap = bestW - secondW;
          float edge = clamp(1.0 - gap * 4.5, 0.0, 1.0);
          if (edge < 0.04) return uColors[best];
          return mix(uColors[best], uColors[second], edge * 0.45);
        }

        vec3 stoneAlbedo(vec3 pos, out float roughnessOut) {
          vec3 p = pos * uNoiseScale + seedOff();
          float n1 = fbm3(p * 2.2);
          float n2 = fbm3(p * 5.5 + vec3(17.3, 4.1, 9.8));
          float h = fbm3(p * 7.0 + vec3(8.2, 1.5, 14.6));

          vec3 mottled = mixPalette(pos * uNoiseScale);
          float elev = clamp(
            (length(pos) - uRadiusMin) / max(uRadiusMax - uRadiusMin, 0.001),
            0.0,
            1.0
          );
          elev = smoothstep(0.0, 1.0, elev);
          vec3 banded = sampleHeightLut(elev);
          vec3 base = mix(mottled, banded, clamp(uHeightBlend, 0.0, 1.0));
          vec3 dark = base * 0.78;
          vec3 mid = base;
          vec3 light = min(vec3(1.0), base * 1.05);

          float midMask = clamp((n1 - 0.15) * 0.7 + 0.35, 0.0, 1.0);
          float dustMask = clamp((n2 - 0.35) * 0.55 + 0.15, 0.0, 1.0);

          vec3 c = mix(dark, mid, midMask);
          c = mix(c, light, dustMask);

          float pore = 0.94 + h * 0.08;
          c *= pore;

          roughnessOut = clamp(0.72 + n1 * 0.14 - dustMask * 0.1, 0.2, 1.0);
          return clamp(c, 0.0, 1.0);
        }

        float grainHeight(vec3 pos) {
          vec3 p = pos * uNoiseScale * 7.0 + seedOff() + vec3(8.2, 1.5, 14.6);
          return fbm3(p);
        }

        vec3 stoneNormal(vec3 pos, vec3 geoN) {
          float e = 0.035;
          vec3 t1 = normalize(cross(geoN, vec3(0.0, 1.0, 0.0)));
          if (length(t1) < 0.2) t1 = normalize(cross(geoN, vec3(1.0, 0.0, 0.0)));
          vec3 t2 = normalize(cross(geoN, t1));
          float h = grainHeight(pos);
          float hx = grainHeight(pos + t1 * e);
          float hy = grainHeight(pos + t2 * e);
          float micro = uGrain * 0.35;
          vec3 n = normalize(geoN - t1 * ((hx - h) * micro * 2.4) - t2 * ((hy - h) * micro * 2.4));
          return n;
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        float stoneRoughness = roughness;
        vec3 stoneColor = stoneAlbedo(vObjectPos, stoneRoughness);
        diffuseColor.rgb *= stoneColor;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = stoneRoughness;
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec3 triN = stoneNormal(vObjectPos, normalize(vObjectNormal));
        #ifdef FLIP_SIDED
          triN = - triN;
        #endif
        #ifdef DOUBLE_SIDED
          triN = triN * faceDirection;
        #endif
        normal = normalize(normalMatrix * triN);
        `,
      )

    material.userData.stoneShader = shader
  }

  material.needsUpdate = true
}

export function applyStoneNoiseParams(material: THREE.MeshStandardMaterial, params: StoneNoiseParams) {
  const uniforms = getUniforms(material)
  if (!uniforms) return
  const colors = normalizeStoneColors(params.colors)
  writePalette(uniforms.uColors.value, colors)
  writeStops(uniforms.uStops.value, params.colorAlts ?? [], colors.length)
  uniforms.uColorCount.value = colors.length
  uniforms.uSeed.value = params.seed || 1
  uniforms.uGrain.value = params.normalStrength
  uniforms.uNoiseScale.value = params.noiseScale ?? 2.4
  uniforms.uHeightBlend.value = params.heightBlend ?? 0.45
  uniforms.uRadiusMin.value = params.radiusMin ?? 0.4
  uniforms.uRadiusMax.value = params.radiusMax ?? 1.75
}
