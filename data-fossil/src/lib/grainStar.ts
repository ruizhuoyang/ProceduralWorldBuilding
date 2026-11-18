import * as THREE from 'three'
import { createPerlin3D } from './noise3d'

/**
 * Grainy particle star for the centre of the stellar system: tens of thousands of fine
 * warm grains instead of a smooth sphere — white-hot core, granular orange body,
 * a flickering corona that breathes outward. Rotates differentially (inner faster).
 */

const vertexShader = /* glsl */ `
uniform float uScale;
uniform float uTime;
uniform float uR;
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  vec3 p = position;
  float r = length(p);
  // Differential rotation about Y: the core turns faster than the corona.
  float ang = uTime * (0.08 + 0.22 / (0.4 + r / uR));
  float c = cos(ang);
  float s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  // Corona grains breathe in and out.
  float corona = smoothstep(uR * 0.98, uR * 1.15, r);
  p *= 1.0 + corona * 0.06 * sin(uTime * (0.7 + aSeed * 1.3) + aSeed * 40.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.001, -mv.z);
  float px = aSize * uScale / dist;
  float a = aAlpha;
  if (px < 1.0) {
    a *= px;
    px = 1.0;
  }
  px = min(px, 220.0);
  // Granulation flicker.
  a *= 0.7 + 0.3 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 60.0);
  vColor = aColor;
  vAlpha = a;
  vSoft = smoothstep(3.0, 10.0, px);
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float r2 = dot(pc, pc) * 4.0;
  if (r2 > 1.0) discard;
  float disc = 1.0 - smoothstep(0.35, 1.0, r2);
  float glow = exp(-r2 * 4.0) * (1.0 - r2);
  float a = vAlpha * mix(disc, glow, vSoft);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type GrainStar = {
  points: THREE.Points
  dispose: () => void
}

const _size = new THREE.Vector2()

export function createGrainStar(R: number, count = 30000, seed = 4242): GrainStar {
  const rnd = mulberry32(seed)
  const cells = createPerlin3D(seed)
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const alpha = new Float32Array(count)
  const seeds = new Float32Array(count)

  // Hot white core → yellow → orange → deep amber rim.
  const ramp = (t: number, out: number[]) => {
    const stops: Array<[number, number, number, number]> = [
      [0.0, 1.0, 0.97, 0.88],
      [0.35, 1.0, 0.86, 0.58],
      [0.75, 1.0, 0.64, 0.3],
      [1.0, 0.92, 0.46, 0.2],
      [1.6, 0.75, 0.32, 0.14],
    ]
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1]![0]) k++
    const [t0, r0, g0, b0] = stops[k]!
    const [t1, r1, g1, b1] = stops[k + 1]!
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
    out[0] = r0 + (r1 - r0) * u
    out[1] = g0 + (g1 - g0) * u
    out[2] = b0 + (b1 - b0) * u
  }
  const c3 = [0, 0, 0]

  let n = 0
  // One big soft glow at the centre.
  pos.set([0, 0, 0], 0)
  col.set([1.0, 0.9, 0.68], 0)
  size[0] = R * 3.2
  alpha[0] = 0.28
  seeds[0] = 0.5
  n = 1

  while (n < count) {
    const pick = rnd()
    // Random direction.
    const th = rnd() * Math.PI * 2
    const ph = Math.acos(2 * rnd() - 1)
    const dx = Math.sin(ph) * Math.cos(th)
    const dy = Math.cos(ph)
    const dz = Math.sin(ph) * Math.sin(th)
    let r: number
    let sz: number
    let a: number
    if (pick < 0.42) {
      // Body: denser toward the centre.
      r = R * Math.pow(rnd(), 0.75)
      sz = R * (0.03 + rnd() * 0.035)
      a = 0.05 + rnd() * 0.09
    } else if (pick < 0.8) {
      // Granular photosphere: a shell broken into bright cells.
      r = R * (0.86 + rnd() * 0.16)
      const g = cells(dx * 4.5, dy * 4.5, dz * 4.5)
      if (rnd() > 0.35 + g * 1.6) continue
      sz = R * (0.028 + rnd() * 0.03)
      a = 0.12 + rnd() * 0.22
    } else if (pick < 0.97) {
      // Corona: exponential falloff outward, faint.
      r = R * (1.0 + -Math.log(1 - rnd() * 0.95) * 0.32)
      sz = R * (0.03 + rnd() * 0.05)
      a = 0.06 + rnd() * 0.12
    } else {
      // Soft glow puffs that fill the body.
      r = R * Math.pow(rnd(), 0.6) * 1.1
      sz = R * (0.5 + rnd() * 0.6)
      a = 0.015 + rnd() * 0.015
    }
    ramp(r / R + (rnd() - 0.5) * 0.12, c3)
    const i3 = n * 3
    pos[i3] = dx * r
    pos[i3 + 1] = dy * r
    pos[i3 + 2] = dz * r
    col[i3] = c3[0]!
    col[i3 + 1] = c3[1]!
    col[i3 + 2] = c3[2]!
    size[n] = sz
    alpha[n] = a
    seeds[n] = rnd()
    n++
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 800 },
      uTime: { value: 0 },
      uR: { value: R },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    toneMapped: false,
  })

  const points = new THREE.Points(geo, material)
  points.name = 'grainStar'
  points.frustumCulled = false
  points.renderOrder = 5
  const t0 = performance.now()
  points.onBeforeRender = (renderer, _scene, camera) => {
    const cam = camera as THREE.PerspectiveCamera
    renderer.getDrawingBufferSize(_size)
    material.uniforms.uScale!.value =
      (_size.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 40) / 2))) * (cam.zoom ?? 1)
    material.uniforms.uTime!.value = (performance.now() - t0) * 0.001
  }

  return {
    points,
    dispose: () => {
      points.removeFromParent()
      geo.dispose()
      material.dispose()
    },
  }
}
