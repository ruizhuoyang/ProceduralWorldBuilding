/**
 * Determinism self-check via Vite SSR module load.
 * Run from data-fossil/: node scripts/selfcheck.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
})

async function load(rel) {
  return server.ssrLoadModule(`/src/lib/${rel}`)
}

const { sanitizeDigits, hashDigits } = await load('hashDigits.ts')
const { buildFossilGeometry, createIcosphereGeometry, geometryPositionsEqual } = await load(
  'buildFossilGeometry.ts',
)
const { DEFAULT_FOSSIL_PARAMS, DEFAULT_ATMOSPHERE } = await load('types.ts')
const { atmosphereCount, atmospherePointSize } = await load('atmosphere.ts')
const { buildAtmosphereField, sampleAtmosphereField } = await load('atmosphereField.ts')

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('OK:', msg)
  }
}

const ico4 = createIcosphereGeometry(4)
assert(ico4.attributes.position.count === 10 * 16 + 2, 'icosphere freq 4 has 162 verts')
assert(ico4.index.count === 20 * 16 * 3, 'icosphere freq 4 has 320 faces')
ico4.dispose()

assert(sanitizeDigits('0012') === '0012', 'leading zeros preserved for 0012')
assert(sanitizeDigits('12abc34') === '1234', 'non-digits stripped')
assert(hashDigits('1208') === hashDigits('1208'), 'hash stable')
assert(hashDigits('0012') !== hashDigits('12'), '0012 hash ≠ 12 hash')

const base = {
  ...DEFAULT_FOSSIL_PARAMS,
  digits: '1208',
}
const a = buildFossilGeometry(base)
const b = buildFossilGeometry(base)
assert(geometryPositionsEqual(a.geometry, b.geometry), 'unique: identical rebuild')
assert(a.seed === hashDigits('1208'), 'seed matches hashDigits')
a.geometry.dispose()
b.geometry.dispose()

const c = buildFossilGeometry({ ...base, digits: '1209' })
const d = buildFossilGeometry(base)
assert(!geometryPositionsEqual(c.geometry, d.geometry), 'different digits → different mesh')
c.geometry.dispose()
d.geometry.dispose()

const lowOct = buildFossilGeometry({ ...base, fbmOctaves: 1 })
const highOct = buildFossilGeometry({ ...base, fbmOctaves: 8 })
assert(
  !geometryPositionsEqual(lowOct.geometry, highOct.geometry),
  'octaves change displacement',
)
lowOct.geometry.dispose()
highOct.geometry.dispose()

const smooth = buildFossilGeometry({ ...base, normalStrength: 0 })
const grainy = buildFossilGeometry({ ...base, normalStrength: 1.4 })
assert(
  !geometryPositionsEqual(smooth.geometry, grainy.geometry),
  'surface grain changes displacement',
)
smooth.geometry.dispose()
grainy.geometry.dispose()

const { defaultLandformLayers, createLandformLayer, buildLandformSites } = await load('landforms.ts')
const bare = buildFossilGeometry(base)
const volcanoLayer = { ...createLandformLayer(1, 'volcano'), enabled: true, sparse: 0.15 }
const volcanic = buildFossilGeometry({ ...base, landformLayers: [volcanoLayer] })
assert(!geometryPositionsEqual(bare.geometry, volcanic.geometry), 'volcano landform changes mesh')
bare.geometry.dispose()
volcanic.geometry.dispose()
const pitted = buildFossilGeometry({
  ...base,
  landformLayers: [{ ...createLandformLayer(1, 'cave'), enabled: true, sparse: 0.1 }],
})
const basined = buildFossilGeometry({
  ...base,
  landformLayers: [{ ...createLandformLayer(1, 'basin'), enabled: true, sparse: 0.1 }],
})
assert(!geometryPositionsEqual(pitted.geometry, basined.geometry), 'cave and basin differ')
pitted.geometry.dispose()
basined.geometry.dispose()
const fewCaves = buildLandformSites(1, [
  { ...createLandformLayer(1, 'cave'), enabled: true, density: 2, sparse: 0 },
])
const manyCaves = buildLandformSites(1, [
  { ...createLandformLayer(1, 'cave'), enabled: true, density: 8, sparse: 0 },
])
assert(manyCaves.length > fewCaves.length, 'higher count places more separate caves')
const huddled = buildLandformSites(1, [
  { ...createLandformLayer(1, 'volcano'), enabled: true, density: 6, sparse: 0.85 },
])
const spread = buildLandformSites(1, [
  { ...createLandformLayer(1, 'volcano'), enabled: true, density: 6, sparse: 0 },
])
assert(huddled.length < spread.length, 'higher cluster places fewer features')
assert(defaultLandformLayers().every((layer) => layer.enabled === false), 'default landform layers start off')

assert(atmosphereCount(0) === 0, 'amount 0 → no particles')
assert(atmosphereCount(DEFAULT_ATMOSPHERE.amount) >= 32, 'default atmosphere has particles')
assert(atmosphereCount(1) >= atmosphereCount(0.5), 'more amount → more particles')
assert(atmosphereCount(2) > atmosphereCount(1), 'amount 2 denser than 1')
assert(atmospherePointSize(0.5) > atmospherePointSize(0), 'Edit Size 0–0.5 changes sprite size')
assert(atmospherePointSize(0.22, 4) > atmospherePointSize(0.22, 1), 'stellar sizeMul enlarges distant haze')
const vortex = buildAtmosphereField('vortex', 0, 0)
const atX = sampleAtmosphereField(vortex, 1, 0)
assert(Math.abs(atX.vx) < 0.2 && atX.vz > 0.5, 'vortex at +X points toward +Z')

const {
  orbitRadiusAt,
  defaultOrbitDistance,
  resolveEccentricity,
  planetDisplayScale,
  normalizePlanetOrbit,
  orbitTiltRadians,
  orbitSpeedWithPace,
  orbitKeplerSpeed,
} = await load('orbit.ts')
assert(Math.abs(orbitRadiusAt(4, 0, 0) - 4) < 1e-9, 'circle radius is semi-major')
const peri = orbitRadiusAt(4, 0.5, 0)
const apo = orbitRadiusAt(4, 0.5, Math.PI)
assert(Math.abs(peri - 2) < 1e-6, 'ellipse periapsis a(1-e)')
assert(Math.abs(apo - 6) < 1e-6, 'ellipse apoapsis a(1+e)')
assert(defaultOrbitDistance(1, 0.5) > defaultOrbitDistance(0, 0.5), 'later save sits farther')
assert(resolveEccentricity({ size: 0.5, distance: null, eccentricity: 0.4 }, 'circle') === 0, 'circle ignores stretch')
assert(planetDisplayScale(0.5) > planetDisplayScale(0.1), 'size slider scales planet')
assert(planetDisplayScale(1) > planetDisplayScale(0.5), 'size 1 is larger than 0.5')
assert(planetDisplayScale(1) < 0.8, 'orbit size 1 stays in view')
assert(normalizePlanetOrbit({}, '12').distance === null, 'legacy saves use auto-distance')
assert(orbitTiltRadians(0) === 0, 'tilt 0 is equatorial')
assert(orbitTiltRadians(1) > 1.2, 'tilt 1 leans the plane steeply')
assert(orbitTiltRadians(-1) < -1.2, 'tilt -1 leans the opposite way')
assert(Math.abs(orbitTiltRadians(-1) + orbitTiltRadians(1)) < 1e-9, 'tilt is symmetric around 0')
assert(
  Math.abs(orbitSpeedWithPace(4, 2) - orbitKeplerSpeed(4) * 2) < 1e-9,
  'pace 2 doubles Kepler speed',
)
assert(normalizePlanetOrbit({}, '12').pace === 1, 'legacy pace defaults to 1')
assert(normalizePlanetOrbit({ tilt: -0.4 }, '12').tilt === -0.4, 'negative tilt is kept')
assert(normalizePlanetOrbit({ size: 0.9 }, '12').size === 0.9, 'orbit size accepts 0–1')

await server.close()

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll self-checks passed.')
