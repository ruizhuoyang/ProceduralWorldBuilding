import * as THREE from 'three'

const vertexShader = /* glsl */ `
attribute float aLife;
attribute float aMaxLife;
uniform float uSize;
varying float vFade;

void main() {
  float t = clamp(aLife / max(aMaxLife, 0.001), 0.0, 1.0);
  vFade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.65, 1.0, t));
  if (aLife <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (140.0 / -mv.z) * (0.4 + vFade * 0.45);
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vFade;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float soft = exp(-d * 4.0);
  gl_FragColor = vec4(uColor, soft * vFade * 0.4);
}
`

export function createWeatherParticleMaterial(size: number, color: [number, number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: size },
      uColor: { value: new THREE.Color(color[0], color[1], color[2]) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
}
