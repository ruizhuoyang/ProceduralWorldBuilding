// Planet landform layers on the radial shell.
// Class 06 scatter: enable a layer, Count places separate sites, Cluster huddles them.

export type LandformKind = 'volcano' | 'basin' | 'cave'

export type LandformLayer = {
  id: string
  name: string
  kind: LandformKind
  enabled: boolean
  /** Candidate count (how many). */
  density: number
  /** Noise gate 0..1 — higher = sparser / more clustered. */
  sparse: number
  /** Radial amplitude 0..1. */
  strength: number
  /** Angular size 0..1. */
  size: number
}

export type LandformSite = {
  kind: LandformKind
  x: number
  y: number
  z: number
  /** Angular half-width (cave: short axis). */
  radius: number
  amp: number
  /** Tangent axis — caves stretch along this. */
  ax: number
  ay: number
  az: number
  /** 1 = round; >1 = elongated fissure. */
  aspect: number
}

export const LANDFORM_KINDS: { value: LandformKind; label: string }[] = [
  { value: 'volcano', label: 'Volcano' },
  { value: 'basin', label: 'Basin' },
  { value: 'cave', label: 'Cave' },
]

export const LANDFORM_LAYER_MAX = 8
export const LANDFORM_DENSITY_MIN = 1
export const LANDFORM_DENSITY_MAX = 14
export const LANDFORM_SPARSE_MIN = 0
export const LANDFORM_SPARSE_MAX = 0.92
export const LANDFORM_STRENGTH_MIN = 0.05
export const LANDFORM_STRENGTH_MAX = 1
export const LANDFORM_SIZE_MIN = 0.15
export const LANDFORM_SIZE_MAX = 1

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const KIND_SPEC: Record<
  LandformKind,
  { salt: number; r0: number; r1: number; a0: number; a1: number }
> = {
  volcano: { salt: 1103, r0: 0.16, r1: 0.34, a0: 0.12, a1: 0.44 },
  basin: { salt: 2207, r0: 0.42, r1: 0.78, a0: 0.07, a1: 0.2 },
  cave: { salt: 3319, r0: 0.12, r1: 0.22, a0: 0.34, a1: 0.74 },
}

const KIND_DEFAULTS: Record<LandformKind, Pick<LandformLayer, 'density' | 'sparse' | 'strength' | 'size'>> = {
  volcano: { density: 4, sparse: 0.22, strength: 0.72, size: 0.55 },
  basin: { density: 3, sparse: 0.18, strength: 0.62, size: 0.82 },
  cave: { density: 5, sparse: 0.2, strength: 0.82, size: 0.62 },
}

function hash01(n: number): number {
  let x = (n | 0) * 374761393
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smooth01(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

function isKind(raw: unknown): raw is LandformKind {
  return raw === 'volcano' || raw === 'basin' || raw === 'cave'
}

function kindLabel(kind: LandformKind): string {
  return LANDFORM_KINDS.find((item) => item.value === kind)?.label ?? kind
}

export function landformLayerName(index: number, kind: LandformKind): string {
  return `Layer ${index} — ${kindLabel(kind)}`
}

export function createLandformLayer(index: number, kind: LandformKind = 'volcano'): LandformLayer {
  const preset = KIND_DEFAULTS[kind]
  return {
    id: `lf-${index}-${kind}`,
    name: landformLayerName(index, kind),
    kind,
    enabled: true,
    density: preset.density,
    sparse: preset.sparse,
    strength: preset.strength,
    size: preset.size,
  }
}

export function defaultLandformLayers(): LandformLayer[] {
  return [
    { ...createLandformLayer(1, 'volcano'), enabled: false },
    { ...createLandformLayer(2, 'basin'), enabled: false },
    { ...createLandformLayer(3, 'cave'), enabled: false },
  ]
}

function clampLayer(raw: Record<string, unknown>, index: number): LandformLayer {
  const kind: LandformKind = isKind(raw.kind) ? raw.kind : 'volcano'
  const preset = KIND_DEFAULTS[kind]
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `lf-${index}-${kind}`
  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name
      : landformLayerName(index, kind)
  return {
    id,
    name,
    kind,
    enabled: raw.enabled === true,
    density: clamp(
      typeof raw.density === 'number' ? raw.density : preset.density,
      LANDFORM_DENSITY_MIN,
      LANDFORM_DENSITY_MAX,
    ),
    sparse: clamp(
      typeof raw.sparse === 'number' ? raw.sparse : preset.sparse,
      LANDFORM_SPARSE_MIN,
      LANDFORM_SPARSE_MAX,
    ),
    strength: clamp(
      typeof raw.strength === 'number' ? raw.strength : preset.strength,
      LANDFORM_STRENGTH_MIN,
      LANDFORM_STRENGTH_MAX,
    ),
    size: clamp(
      typeof raw.size === 'number' ? raw.size : preset.size,
      LANDFORM_SIZE_MIN,
      LANDFORM_SIZE_MAX,
    ),
  }
}

function layerFromLegacyAmount(kind: LandformKind, amount: number, sparse: number, index: number): LandformLayer {
  const spec = KIND_DEFAULTS[kind]
  const density = Math.max(
    LANDFORM_DENSITY_MIN,
    Math.round(amount * (kind === 'cave' ? 9 : kind === 'basin' ? 5 : 7)),
  )
  return {
    ...createLandformLayer(index, kind),
    enabled: true,
    density,
    sparse,
    strength: clamp(amount, LANDFORM_STRENGTH_MIN, LANDFORM_STRENGTH_MAX),
    size: spec.size,
  }
}

/** Accept new layer arrays, or migrate the old volcano/basin/cave sliders. */
export function normalizeLandformLayers(raw: unknown, legacy?: Record<string, unknown>): LandformLayer[] {
  if (Array.isArray(raw)) {
    const seen = new Set<string>()
    const out: LandformLayer[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const layer = clampLayer(item as Record<string, unknown>, out.length + 1)
      let id = layer.id
      if (seen.has(id)) id = `${id}-${out.length + 1}`
      seen.add(id)
      out.push({ ...layer, id })
      if (out.length >= LANDFORM_LAYER_MAX) break
    }
    return out
  }

  const src = legacy && typeof legacy === 'object' ? legacy : {}
  const sparse =
    typeof src.sparse === 'number' && Number.isFinite(src.sparse)
      ? clamp(src.sparse, LANDFORM_SPARSE_MIN, LANDFORM_SPARSE_MAX)
      : 0.45
  const migrated: LandformLayer[] = []
  const addIf = (kind: LandformKind, amount: unknown) => {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0.02) return
    migrated.push(layerFromLegacyAmount(kind, amount, sparse, migrated.length + 1))
  }
  addIf('volcano', src.volcano)
  addIf('basin', src.basin)
  addIf('cave', src.cave)
  return migrated.length > 0 ? migrated : defaultLandformLayers()
}

function fibonacciDir(i: number, n: number): [number, number, number] {
  const y = 1 - ((i + 0.5) / Math.max(n, 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN_ANGLE * i
  return [Math.cos(theta) * r, y, Math.sin(theta) * r]
}

function idSalt(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

function tangentAxis(nx: number, ny: number, nz: number, seed: number, i: number): [number, number, number] {
  let ax = hash01(seed + i * 17) * 2 - 1
  let ay = hash01(seed + i * 29) * 2 - 1
  let az = hash01(seed + i * 41) * 2 - 1
  const d = ax * nx + ay * ny + az * nz
  ax -= d * nx
  ay -= d * ny
  az -= d * nz
  if (Math.hypot(ax, ay, az) < 1e-5) {
    ax = -ny
    ay = nx
    az = 0
  }
  return normalize3(ax, ay, az)
}

function siteSpan(site: Pick<LandformSite, 'kind' | 'radius' | 'aspect'>): number {
  if (site.kind === 'cave') return site.radius * (0.55 + site.aspect * 0.5)
  if (site.kind === 'basin') return site.radius * 0.85
  return site.radius * 0.95
}

function tooClose(
  x: number,
  y: number,
  z: number,
  span: number,
  occupied: LandformSite[],
): boolean {
  for (const other of occupied) {
    const cosang = clamp(x * other.x + y * other.y + z * other.z, -1, 1)
    const ang = Math.acos(cosang)
    const minSep = Math.max(0.16, 0.82 * (span + siteSpan(other)))
    if (ang < minSep) return true
  }
  return false
}

function pickSites(layer: LandformLayer, seed: number, occupied: LandformSite[]): LandformSite[] {
  if (!layer.enabled) return []
  const spec = KIND_SPEC[layer.kind]
  const cluster = clamp(layer.sparse, 0, 1)
  const want = Math.max(1, Math.round(layer.density * (1 - cluster * 0.62)))
  const clusterN = Math.max(1, Math.round(lerp(5, 1, cluster)))
  const salt = spec.salt + idSalt(layer.id)
  const hubs: [number, number, number][] = []
  for (let h = 0; h < clusterN; h++) {
    hubs.push(fibonacciDir(h * 5 + (salt % 11), clusterN * 5 + 7))
  }

  const pool = Math.max(want * 18, 36)
  const sites: LandformSite[] = []
  for (let i = 0; i < pool && sites.length < want; i++) {
    let [x, y, z] = fibonacciDir((i * 3 + salt) % (pool * 3 + 13), pool * 3 + 13)
    const hub = hubs[i % hubs.length]!
    const pull = cluster * 0.88
    ;[x, y, z] = normalize3(
      x * (1 - pull) + hub[0] * pull,
      y * (1 - pull) + hub[1] * pull,
      z * (1 - pull) + hub[2] * pull,
    )
    const u = hash01(seed + salt + i * 13)
    const v = hash01(seed + salt + i * 29)
    const radius = lerp(spec.r0, spec.r1, layer.size) * (0.9 + u * 0.2)
    const amp = lerp(spec.a0, spec.a1, layer.strength) * (0.88 + v * 0.24)
    const aspect = layer.kind === 'cave' ? lerp(2.4, 3.8, hash01(seed + salt + i * 7)) : 1
    const span = layer.kind === 'cave' ? radius * (0.55 + aspect * 0.5) : layer.kind === 'basin' ? radius * 0.85 : radius * 0.95
    if (tooClose(x, y, z, span, occupied) || tooClose(x, y, z, span, sites)) continue
    const [ax, ay, az] = tangentAxis(x, y, z, seed + salt, i)
    sites.push({ kind: layer.kind, x, y, z, radius, amp, ax, ay, az, aspect })
  }
  return sites
}

export function buildLandformSites(seed: number, layers: LandformLayer[]): LandformSite[] {
  const sites: LandformSite[] = []
  for (const layer of layers) {
    sites.push(...pickSites(layer, seed, sites))
  }
  return sites
}

function volcanoKernel(t: number, amp: number): number {
  const rim = 0.3
  if (t < rim) return lerp(-0.42 * amp, amp, smooth01(t / rim))
  const u = (t - rim) / (1 - rim)
  return amp * (1 - u) * (1 - u)
}

function basinKernel(t: number, amp: number): number {
  if (t >= 1) return 0
  if (t < 0.42) return -amp
  if (t < 0.72) {
    const u = (t - 0.42) / 0.3
    return lerp(-amp, amp * 0.28, smooth01(u))
  }
  const outer = (t - 0.72) / 0.28
  return amp * 0.28 * (1 - outer) * (1 - outer)
}

function caveKernel(t: number, amp: number): number {
  if (t >= 1) return 0
  if (t < 0.38) return -amp
  const wall = (t - 0.38) / 0.62
  const steep = (1 - wall) * (1 - wall) * (1 - wall)
  return -amp * steep
}

function featureWeight(dx: number, dy: number, dz: number, site: LandformSite): number {
  if (site.kind === 'cave') {
    const facing = dx * site.x + dy * site.y + dz * site.z
    if (facing <= 0) return 2
    const along = dx * site.ax + dy * site.ay + dz * site.az
    const cx = site.y * site.az - site.z * site.ay
    const cy = site.z * site.ax - site.x * site.az
    const cz = site.x * site.ay - site.y * site.ax
    const across = dx * cx + dy * cy + dz * cz
    return Math.hypot(along / (site.radius * site.aspect), across / site.radius)
  }
  const cosang = dx * site.x + dy * site.y + dz * site.z
  const reach = Math.cos(site.radius)
  if (cosang <= reach) return 2
  const ang = Math.acos(clamp(cosang, -1, 1))
  return ang / site.radius
}

export function sampleLandforms(dx: number, dy: number, dz: number, sites: LandformSite[]): number {
  if (sites.length === 0) return 0
  let lift = 0
  let caldera = 0
  let dig = 0
  for (const site of sites) {
    const t = featureWeight(dx, dy, dz, site)
    if (t >= 1) continue
    if (site.kind === 'volcano') {
      const k = volcanoKernel(t, site.amp)
      if (k >= 0) lift = Math.max(lift, k)
      else caldera = Math.min(caldera, k)
    } else if (site.kind === 'basin') {
      const k = basinKernel(t, site.amp)
      if (k >= 0) lift = Math.max(lift, k)
      else dig = Math.min(dig, k)
    } else {
      dig = Math.min(dig, caveKernel(t, site.amp))
    }
  }
  return lift + caldera + dig
}
