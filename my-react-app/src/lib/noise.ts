// ─────────────────────────────────────────────────────────
// Procedural noise library — pure TypeScript, zero deps
// ─────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────

/** Base noise equations (Class 03). Fractal modes live in shaping, not here. */
export type NoiseType =
  | 'white'
  | 'perlin'
  | 'simplex'
  | 'value'
  | 'worley'
  | 'voronoi'

export type ColorMode = 'grayscale' | 'accent' | 'terrain' | 'heat'
export type DistanceMetric = 'euclidean' | 'manhattan' | 'chebyshev'
export type CellReturn = 'f1' | 'f2' | 'f2-f1'

// ── Shaping operations (Class 03 math modifiers) ─────────

export type ShapingOp =
  | 'none'
  | 'ridged'
  | 'billow'
  | 'turbulence'
  | 'terrace'
  | 'power'
  | 'domainWarp'
  | 'smoothstep'
  | 'clamp'
  | 'abs'
  | 'quantize'

export type ShapingOpInfo = {
  value: ShapingOp
  label: string
  description: string
  group: 'class03' | 'extra'
}

export const SHAPING_OPS: ShapingOpInfo[] = [
  { value: 'none',       label: 'None',            group: 'class03', description: 'Raw equation output (multi-octave = fBm)' },
  { value: 'ridged',     label: 'Ridged',          group: 'class03', description: '1 − |noise| per octave — sharp mountain ridges' },
  { value: 'billow',     label: 'Billow',          group: 'class03', description: '|noise| per octave — soft cloud-like billows' },
  { value: 'turbulence', label: 'Turbulence',      group: 'class03', description: 'Abs-value octaves — swirly / marble feel' },
  { value: 'terrace',    label: 'Terracing',       group: 'class03', description: 'Staircase levels — flat plateaus' },
  { value: 'power',      label: 'Power curve',     group: 'class03', description: 'Raise to exponent — flatten lows or punch highs' },
  { value: 'domainWarp', label: 'Domain warping',  group: 'class03', description: 'Warp coordinates with noise — organic distortion' },
  { value: 'smoothstep', label: 'Smoothstep',      group: 'extra',   description: 'Hermite S-curve — soft contrast clamp' },
  { value: 'clamp',      label: 'Clamp',           group: 'extra',   description: 'Cut off below min / above max' },
  { value: 'abs',        label: 'Abs',             group: 'extra',   description: 'Mirror around 0.5 — valley at center' },
  { value: 'quantize',   label: 'Quantize',        group: 'extra',   description: 'Snap to N discrete levels — posterize' },
]

/** Fractal / domain shaping runs inside the sampler, not as a post curve. */
export function isFractalShaping(op: ShapingOp): boolean {
  return op === 'ridged' || op === 'billow' || op === 'turbulence' || op === 'domainWarp'
}

export type ShapingParams = {
  op: ShapingOp
  power: number
  smoothstepMin: number
  smoothstepMax: number
  terraceSteps: number
  clampMin: number
  clampMax: number
  quantizeLevels: number
}

export const DEFAULT_SHAPING: ShapingParams = {
  op: 'none',
  power: 2,
  smoothstepMin: 0.2,
  smoothstepMax: 0.8,
  terraceSteps: 6,
  clampMin: 0.2,
  clampMax: 0.8,
  quantizeLevels: 5,
}

/** Apply a post-process shaping curve to a 0..1 value (not fractal modes). */
export function applyShaping(v: number, s: ShapingParams): number {
  if (isFractalShaping(s.op)) return v
  switch (s.op) {
    case 'power':
      return Math.pow(v, s.power)
    case 'smoothstep': {
      const lo = s.smoothstepMin
      const hi = s.smoothstepMax
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 0.001)))
      return t * t * (3 - 2 * t)
    }
    case 'terrace': {
      const steps = Math.max(2, Math.round(s.terraceSteps))
      return Math.floor(v * steps) / (steps - 1)
    }
    case 'clamp':
      return Math.min(1, Math.max(0,
        (Math.min(s.clampMax, Math.max(s.clampMin, v)) - s.clampMin) /
          (s.clampMax - s.clampMin || 0.001),
      ))
    case 'abs':
      return Math.abs(v * 2 - 1)
    case 'quantize': {
      const levels = Math.max(2, Math.round(s.quantizeLevels))
      return Math.round(v * (levels - 1)) / (levels - 1)
    }
    case 'none':
    default:
      return v
  }
}

// ── Blend modes ─────────────────────────────────────────

export type BlendMode = 'add' | 'multiply' | 'screen' | 'overlay' | 'max' | 'min' | 'subtract'

export type BlendModeInfo = { value: BlendMode; label: string }

export const BLEND_MODES: BlendModeInfo[] = [
  { value: 'add',      label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen',   label: 'Screen' },
  { value: 'overlay',  label: 'Overlay' },
  { value: 'max',      label: 'Max' },
  { value: 'min',      label: 'Min' },
  { value: 'subtract', label: 'Subtract' },
]

export function blendValues(base: number, top: number, mode: BlendMode, opacity: number): number {
  let result: number
  switch (mode) {
    case 'add':      result = base + top; break
    case 'multiply': result = base * top; break
    case 'screen':   result = 1 - (1 - base) * (1 - top); break
    case 'overlay':
      result = base < 0.5
        ? 2 * base * top
        : 1 - 2 * (1 - base) * (1 - top)
      break
    case 'max':      result = Math.max(base, top); break
    case 'min':      result = Math.min(base, top); break
    case 'subtract': result = base - top; break
    default:         result = top
  }
  const blended = Math.min(1, Math.max(0, result))
  return base * (1 - opacity) + blended * opacity
}

// ── Layer ────────────────────────────────────────────────

export type NoiseLayer = {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
  params: NoiseParams
  shaping: ShapingParams
}

let layerCounter = 0
export function createLayer(overrides?: Partial<NoiseLayer>): NoiseLayer {
  layerCounter++
  return {
    id: `layer-${layerCounter}-${Date.now()}`,
    name: `Layer ${layerCounter}`,
    visible: true,
    opacity: 1,
    blendMode: 'add',
    params: { ...DEFAULT_NOISE_PARAMS },
    shaping: { ...DEFAULT_SHAPING },
    ...overrides,
  }
}

export function createDefaultLayers(): NoiseLayer[] {
  return [createLayer({ name: 'Base', blendMode: 'add' })]
}

// ── Noise params (per-layer) ────────────────────────────

export type NoiseParams = {
  type: NoiseType
  scale: number
  seed: number
  resolution: number
  colorMode: ColorMode
  octaves: number
  persistence: number
  lacunarity: number
  power: number
  invert: boolean
  distanceMetric: DistanceMetric
  cellReturn: CellReturn
  warpStrength: number
}

// ── Metadata / UI helpers ────────────────────────────────

export type NoiseTypeInfo = {
  value: NoiseType
  label: string
  group: string
  description: string
}

export const NOISE_TYPES: NoiseTypeInfo[] = [
  { value: 'white',   label: 'White',    group: 'Equation', description: 'Pure randomness — no spatial correlation' },
  { value: 'perlin',  label: 'Perlin',   group: 'Equation', description: 'Classic gradient noise — smooth hills' },
  { value: 'simplex', label: 'Simplex',  group: 'Equation', description: 'Less directional artifacts than Perlin' },
  { value: 'value',   label: 'Value',    group: 'Equation', description: 'Lattice-interpolated random values' },
  { value: 'worley',  label: 'Cellular', group: 'Equation', description: 'Distance to nearest cell point (Worley)' },
  { value: 'voronoi', label: 'Voronoi',  group: 'Equation', description: 'Cell ID coloring — stained glass pattern' },
]

export const NOISE_GROUPS = [...new Set(NOISE_TYPES.map((t) => t.group))]

export const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'grayscale', label: 'Gray' },
  { value: 'accent',    label: 'Accent' },
  { value: 'terrain',   label: 'Terrain' },
  { value: 'heat',      label: 'Heat' },
]

export const DISTANCE_METRICS: { value: DistanceMetric; label: string }[] = [
  { value: 'euclidean',  label: 'Euclidean' },
  { value: 'manhattan',  label: 'Manhattan' },
  { value: 'chebyshev',  label: 'Chebyshev' },
]

export const CELL_RETURNS: { value: CellReturn; label: string }[] = [
  { value: 'f1',    label: 'F1 (nearest)' },
  { value: 'f2',    label: 'F2 (second)' },
  { value: 'f2-f1', label: 'F2 − F1 (edge)' },
]

export const DEFAULT_NOISE_PARAMS: NoiseParams = {
  type: 'perlin',
  scale: 6,
  seed: 1337,
  resolution: 512,
  colorMode: 'grayscale',
  octaves: 5,
  persistence: 0.5,
  lacunarity: 2,
  power: 1,
  invert: false,
  distanceMetric: 'euclidean',
  cellReturn: 'f1',
  warpStrength: 4,
}

/** Octaves / persistence / lacunarity — always useful (1 octave = single sample). */
export function usesFractalControls(_type?: NoiseType) {
  return true
}

export function usesWarpControls(shaping: ShapingParams) {
  return shaping.op === 'domainWarp'
}

export function usesCellular(type: NoiseType) {
  return type === 'worley' || type === 'voronoi'
}

// ── Math helpers ─────────────────────────────────────────

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const GRADIENTS = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1],  [0, -1],
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildPermutation(seed: number) {
  const random = mulberry32(seed)
  const source = new Uint8Array(256)
  for (let i = 0; i < 256; i++) source[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = source[i]
    source[i] = source[j]
    source[j] = swap
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = source[i & 255]
  return perm
}

// ── Sampler ──────────────────────────────────────────────

export type NoiseSampler = {
  sample: (x: number, y: number) => number
}

export function createNoiseSampler(
  params: NoiseParams,
  shaping: ShapingParams = DEFAULT_SHAPING,
): NoiseSampler {
  const perm = buildPermutation(params.seed)
  const hash = (x: number, y: number) =>
    perm[(perm[x & 255] + (y & 255)) & 511]

  /** White noise — independent random per lattice cell. */
  const white = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    return (hash(xi, yi) / 255) * 2 - 1
  }

  const perlin = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = fade(xf)
    const v = fade(yf)
    const dot = (gx: number, gy: number, dx: number, dy: number) => gx * dx + gy * dy
    const gradAt = (cx: number, cy: number) => GRADIENTS[hash(cx, cy) & 7]
    const g00 = gradAt(xi, yi)
    const g10 = gradAt(xi + 1, yi)
    const g01 = gradAt(xi, yi + 1)
    const g11 = gradAt(xi + 1, yi + 1)
    const bottom = lerp(dot(g00[0], g00[1], xf, yf), dot(g10[0], g10[1], xf - 1, yf), u)
    const top = lerp(dot(g01[0], g01[1], xf, yf - 1), dot(g11[0], g11[1], xf - 1, yf - 1), u)
    return lerp(bottom, top, v) * 1.4
  }

  const F2 = 0.5 * (Math.sqrt(3) - 1)
  const G2 = (3 - Math.sqrt(3)) / 6
  const simplex = (x: number, y: number) => {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const corner = (gIdx: number, dx: number, dy: number) => {
      const attn = 0.5 - dx * dx - dy * dy
      if (attn < 0) return 0
      const g = GRADIENTS[gIdx & 7]
      return attn * attn * attn * attn * (g[0] * dx + g[1] * dy)
    }
    const n0 = corner(hash(i, j), x0, y0)
    const n1 = corner(hash(i + i1, j + j1), x1, y1)
    const n2 = corner(hash(i + 1, j + 1), x2, y2)
    return 70 * (n0 + n1 + n2)
  }

  const value = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const v = fade(y - yi)
    const at = (cx: number, cy: number) => hash(cx, cy) / 255
    const bottom = lerp(at(xi, yi), at(xi + 1, yi), u)
    const top = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u)
    return lerp(bottom, top, v) * 2 - 1
  }

  const dist = (dx: number, dy: number): number => {
    switch (params.distanceMetric) {
      case 'manhattan':  return Math.abs(dx) + Math.abs(dy)
      case 'chebyshev':  return Math.max(Math.abs(dx), Math.abs(dy))
      case 'euclidean':
      default:           return Math.sqrt(dx * dx + dy * dy)
    }
  }

  const worley = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    let f1 = Number.POSITIVE_INFINITY
    let f2 = Number.POSITIVE_INFINITY
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox
        const cy = yi + oy
        const h = hash(cx, cy)
        const px = cx + perm[h] / 255
        const py = cy + perm[(h + 61) & 511] / 255
        const d = dist(px - x, py - y)
        if (d < f1) { f2 = f1; f1 = d }
        else if (d < f2) { f2 = d }
      }
    }
    switch (params.cellReturn) {
      case 'f2':    return Math.min(f2, 1) * 2 - 1
      case 'f2-f1': return Math.min(f2 - f1, 1) * 2 - 1
      case 'f1':
      default:      return Math.min(f1, 1) * 2 - 1
    }
  }

  const voronoi = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    let nearestDist = Number.POSITIVE_INFINITY
    let nearestId = 0
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox
        const cy = yi + oy
        const h = hash(cx, cy)
        const px = cx + perm[h] / 255
        const py = cy + perm[(h + 61) & 511] / 255
        const d = dist(px - x, py - y)
        if (d < nearestDist) { nearestDist = d; nearestId = h }
      }
    }
    return (nearestId / 255) * 2 - 1
  }

  const fractal = (
    base: (x: number, y: number) => number,
    mode: 'fbm' | 'ridged' | 'billow' | 'turbulence',
  ) => {
    const { octaves, persistence, lacunarity } = params
    return (x: number, y: number) => {
      let amplitude = 1
      let frequency = 1
      let total = 0
      let maxAmplitude = 0
      for (let i = 0; i < octaves; i++) {
        const raw = base(x * frequency, y * frequency)
        let contribution: number
        switch (mode) {
          case 'ridged':     contribution = (1 - Math.abs(raw)) * amplitude; break
          case 'billow':     contribution = Math.abs(raw) * amplitude; break
          case 'turbulence': contribution = Math.abs(raw) * amplitude; break
          case 'fbm': default: contribution = raw * amplitude
        }
        total += contribution
        maxAmplitude += amplitude
        amplitude *= persistence
        frequency *= lacunarity
      }
      const normalised = total / maxAmplitude
      if (mode === 'ridged' || mode === 'billow' || mode === 'turbulence') return normalised * 2 - 1
      return normalised
    }
  }

  const base = (() => {
    switch (params.type) {
      case 'white':   return white
      case 'simplex': return simplex
      case 'value':   return value
      case 'worley':  return worley
      case 'voronoi': return voronoi
      case 'perlin':
      default:        return perlin
    }
  })()

  const domainWarp = (fn: (x: number, y: number) => number) => {
    const { octaves, persistence, lacunarity, warpStrength } = params
    const warpField = fractal(fn, 'fbm')
    return (x: number, y: number) => {
      const wx = x + warpStrength * warpField(x, y)
      const wy = y + warpStrength * warpField(x + 5.2, y + 1.3)
      let amplitude = 1
      let frequency = 1
      let total = 0
      let maxAmplitude = 0
      for (let i = 0; i < octaves; i++) {
        total += fn(wx * frequency, wy * frequency) * amplitude
        maxAmplitude += amplitude
        amplitude *= persistence
        frequency *= lacunarity
      }
      return total / maxAmplitude
    }
  }

  // Class 03: equation → shaping. Ridged / Billow / Turbulence / Domain warp
  // reshape how octaves combine; other ops are post-curves on 0..1.
  const signed = (() => {
    const op = shaping.op
    if (op === 'domainWarp') return domainWarp(base)
    if (op === 'ridged' || op === 'billow' || op === 'turbulence') {
      return fractal(base, op)
    }
    // None / post-curve: multi-octave fBm of the base equation
    if (params.octaves > 1) return fractal(base, 'fbm')
    return base
  })()

  const { power, invert } = params

  return {
    sample: (x, y) => {
      let v = Math.min(1, Math.max(0, signed(x, y) * 0.5 + 0.5))
      if (power !== 1) v = Math.pow(v, power)
      if (invert) v = 1 - v
      v = applyShaping(v, shaping)
      return v
    },
  }
}

// ── Multi-layer compositing ─────────────────────────────

/**
 * Composite all visible layers into a single 0..1 value at (x, y).
 * Coordinates are in noise-space (already scaled by caller).
 */
export function sampleLayers(layers: NoiseLayer[], nx: number, ny: number): number {
  let result = 0
  let first = true

  for (const layer of layers) {
    if (!layer.visible) continue

    const sampler = createNoiseSampler(layer.params, layer.shaping)
    const v = sampler.sample(
      nx * (layer.params.scale / layers[0].params.scale),
      ny * (layer.params.scale / layers[0].params.scale),
    )

    if (first) {
      result = v * layer.opacity
      first = false
    } else {
      result = blendValues(result, v, layer.blendMode, layer.opacity)
    }
  }

  return Math.min(1, Math.max(0, result))
}

// ── Color ramps ──────────────────────────────────────────

type Rgb = [number, number, number]

const TERRAIN_STOPS: { at: number; color: Rgb }[] = [
  { at: 0, color: [12, 24, 46] },
  { at: 0.4, color: [24, 68, 112] },
  { at: 0.48, color: [188, 176, 128] },
  { at: 0.58, color: [62, 140, 82] },
  { at: 0.74, color: [96, 96, 88] },
  { at: 1, color: [236, 240, 244] },
]

const ACCENT_STOPS: { at: number; color: Rgb }[] = [
  { at: 0, color: [10, 12, 16] },
  { at: 0.5, color: [62, 207, 142] },
  { at: 1, color: [232, 255, 244] },
]

const HEAT_STOPS: { at: number; color: Rgb }[] = [
  { at: 0, color: [8, 8, 20] },
  { at: 0.2, color: [32, 12, 96] },
  { at: 0.45, color: [180, 18, 48] },
  { at: 0.7, color: [240, 160, 12] },
  { at: 1, color: [255, 255, 210] },
]

function rampColor(stops: { at: number; color: Rgb }[], t: number): Rgb {
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1]
    const current = stops[i]
    if (t > current.at) continue
    const span = current.at - previous.at
    const local = span === 0 ? 0 : (t - previous.at) / span
    return [
      lerp(previous.color[0], current.color[0], local),
      lerp(previous.color[1], current.color[1], local),
      lerp(previous.color[2], current.color[2], local),
    ]
  }
  return stops[stops.length - 1].color
}

export function colorForValue(mode: ColorMode, t: number): Rgb {
  switch (mode) {
    case 'accent':    return rampColor(ACCENT_STOPS, t)
    case 'terrain':   return rampColor(TERRAIN_STOPS, t)
    case 'heat':      return rampColor(HEAT_STOPS, t)
    case 'grayscale':
    default: {
      const level = t * 255
      return [level, level, level]
    }
  }
}
