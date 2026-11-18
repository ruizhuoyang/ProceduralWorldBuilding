import * as THREE from 'three'

/**
 * Deep-cosmos skydome: near-black space, three layers of procedural stars (constant
 * on-screen size via screen-space derivatives, so they stay crisp at any FOV), and a
 * faint warm Milky-Way band with dusty lanes and a cool blue-grey outer haze.
 *
 * The dome follows the camera and sits just inside its far plane, so it works in every
 * view (orbit, stone, surface FPS) without parallax.
 */

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pin to the far plane; depthTest is off so this only fixes clipping.
  gl_Position = clip.xyww;
  gl_Position.z = gl_Position.w * 0.9999;
}
`

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uBand;
uniform vec3 uAxis;
uniform vec3 uCoreDir;
varying vec3 vDir;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}

// One star layer: one candidate star per 3D cell of the scaled direction.
// pxAng = angular size of one pixel, so star radius is in pixels.
vec3 starLayer(vec3 dir, float scale, float density, float radiusPx, float pxAng, float boost) {
  vec3 p = dir * scale;
  vec3 cell = floor(p);
  vec3 h = hash33(cell);
  if (h.x > density) return vec3(0.0);
  vec3 pos = cell + 0.2 + 0.6 * hash33(cell + 17.0);
  float d = length(p - pos) / scale;
  float r = radiusPx * pxAng;
  float core = exp(-(d * d) / (r * r));
  // Brightness: mostly faint, a few bright.
  float b = pow(h.y, 5.0) * 1.6 + 0.12;
  // Gentle twinkle.
  b *= 0.85 + 0.15 * sin(uTime * (0.6 + h.z * 2.0) + h.x * 60.0);
  // Colour temperature: warm / white / cool.
  vec3 warm = vec3(1.0, 0.78, 0.55);
  vec3 cool = vec3(0.72, 0.82, 1.0);
  vec3 col = h.z < 0.35 ? mix(warm, vec3(1.0), h.z / 0.35) : mix(vec3(1.0), cool, (h.z - 0.35) / 0.65);
  return col * core * b * boost;
}

void main() {
  vec3 dir = normalize(vDir);
  float pxAng = max(length(fwidth(dir)), 1e-5);

  // Milky-Way band: a tilted great circle with a brighter core region.
  // Tilted so the band runs diagonally behind the default stone view.
  vec3 axis = normalize(uAxis);
  float lat = dot(dir, axis);
  float warp = fbm(dir * 2.2) - 0.5;
  float band = exp(-pow((lat + warp * 0.28) * 2.9, 2.0));
  vec3 coreDir = normalize(uCoreDir);
  float core = exp(-pow(length(dir - coreDir) * 1.3, 2.0));
  float clouds = fbm(dir * 4.5 + 3.0);
  float lanes = smoothstep(0.42, 0.7, fbm(dir * 7.0 - 5.0));
  float glow = band * (0.3 + clouds * 1.0) * (0.5 + core * 1.5);
  glow *= 1.0 - lanes * 0.8 * band;

  vec3 col = vec3(0.006, 0.006, 0.009);
  // Faint dark-blue dust everywhere so space is not a flat black.
  col += vec3(0.018, 0.022, 0.032) * smoothstep(0.35, 0.75, fbm(dir * 3.0 + 9.0));
  // Cool blue-grey haze on the band's flanks, warm dusty light at its heart.
  col += vec3(0.07, 0.085, 0.11) * band * clouds * 0.8 * uBand;
  col += vec3(0.30, 0.21, 0.14) * glow * 0.75 * uBand;
  col += vec3(0.46, 0.36, 0.26) * pow(glow, 2.0) * 0.6 * uBand;

  // Stars — more of them inside the band.
  float bandBoost = 1.0 + (band * 1.6 + core * 1.2) * uBand;
  col += starLayer(dir, 90.0, 0.10, 1.25, pxAng, 1.25);
  col += starLayer(dir, 210.0, 0.16 * bandBoost, 0.95, pxAng, 0.85);
  col += starLayer(dir, 480.0, 0.10 * bandBoost, 0.8, pxAng, 0.55);

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`

export type CosmosBackdrop = {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  dispose: () => void
}

/** `band`: strength of the painted Milky-Way band (0 when a real 3D galaxy is present). */
export function createCosmosBackdrop(
  opts: { band?: number; axis?: THREE.Vector3; coreDir?: THREE.Vector3 } = {},
): CosmosBackdrop {
  const geometry = new THREE.SphereGeometry(1, 64, 32)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uBand: { value: opts.band ?? 1 },
      uAxis: { value: (opts.axis ?? new THREE.Vector3(0.743, -0.515, -0.427)).clone().normalize() },
      uCoreDir: { value: (opts.coreDir ?? new THREE.Vector3(-0.548, -0.103, -0.83)).clone().normalize() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'cosmosBackdrop'
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    // Follow the camera, stay inside its far plane.
    camera.getWorldPosition(mesh.position)
    const far = (camera as THREE.PerspectiveCamera).far ?? 100
    mesh.scale.setScalar(far * 0.5)
    mesh.updateMatrixWorld(true)
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld)
    material.uniforms.uTime!.value = performance.now() * 0.001
  }
  return {
    mesh,
    material,
    dispose: () => {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
