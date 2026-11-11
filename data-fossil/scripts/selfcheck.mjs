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

const {
  buildFormedPlanetGeometry,
  planetGrowth,
  planetRoundness,
} = await load('planetFormation.ts')
const {
  bodyCollisionRadius,
  createSystemBodyFromEntry,
  demoInsertionOrbit,
  mergeSystemBodies,
} = await load('systemBodies.ts')
assert(planetGrowth(2) > planetGrowth(0), 'accretion grows mean radius scale')
assert(planetRoundness(3) > planetRoundness(1), 'more impacts round the silhouette')
const seedPlanet = {
  baseId: 'a',
  digits: '1208',
  seed: hashDigits('1208'),
  params: { ...DEFAULT_FOSSIL_PARAMS, digits: '1208' },
  lighting: { key: 1.1 },
  atmosphere: { ...DEFAULT_ATMOSPHERE },
  scars: [],
}
const g0 = buildFormedPlanetGeometry(seedPlanet)
const scarA = {
  fossilId: 'b',
  color: '#c49a5a',
  localPoint: [0.9, 0.2, 0.1],
  direction: [-1, 0, 0],
}
const scarB = {
  ...scarA,
  localPoint: [-0.2, 0.9, 0.1],
  direction: [0, -1, 0],
}
const g1 = buildFormedPlanetGeometry({ ...seedPlanet, scars: [scarA] })
const g2 = buildFormedPlanetGeometry({ ...seedPlanet, scars: [scarB] })
assert(!geometryPositionsEqual(g0.geometry, g1.geometry), 'first impact changes planet mesh')
assert(!geometryPositionsEqual(g1.geometry, g2.geometry), 'impact site moves with scar local point')
assert(g1.meanRadius > g0.meanRadius * 0.98, 'impact keeps / grows planet bulk')
g0.geometry.dispose()
g1.geometry.dispose()
g2.geometry.dispose()

const fakeEntry = {
  id: 'e1',
  digits: '1208',
  seed: hashDigits('1208'),
  thumb: '',
  createdAt: 1,
  params: {
    noiseStrength: DEFAULT_FOSSIL_PARAMS.noiseStrength,
    noiseScale: DEFAULT_FOSSIL_PARAMS.noiseScale,
    digitStrength: DEFAULT_FOSSIL_PARAMS.digitStrength,
    stoneColors: DEFAULT_FOSSIL_PARAMS.stoneColors,
    colorAlts: DEFAULT_FOSSIL_PARAMS.colorAlts,
    normalStrength: DEFAULT_FOSSIL_PARAMS.normalStrength,
    heightBlend: DEFAULT_FOSSIL_PARAMS.heightBlend,
    detail: DEFAULT_FOSSIL_PARAMS.detail,
    fbmOctaves: DEFAULT_FOSSIL_PARAMS.fbmOctaves,
    landformLayers: DEFAULT_FOSSIL_PARAMS.landformLayers,
  },
  lighting: { key: 1.1 },
  atmosphere: { ...DEFAULT_ATMOSPHERE },
  orbit: normalizePlanetOrbit({}, '1208'),
}
const body0 = createSystemBodyFromEntry(fakeEntry, [], { shape: 'circle', spread: 0.38, playing: true })
const insert = demoInsertionOrbit([body0], { ...fakeEntry, id: 'e2', digits: '0612' }, {
  shape: 'circle',
  spread: 0.38,
  playing: true,
})
assert(insert.orbit.distance == null, 'later insert uses auto-distance track')
assert(insert.orbit.pace === 1, 'later insert keeps normal pace until encounter')
assert(bodyCollisionRadius(body0) > 0.05, 'collision radius is positive')
const body1 = createSystemBodyFromEntry({ ...fakeEntry, id: 'e2', digits: '0612' }, [body0], {
  shape: 'circle',
  spread: 0.38,
  playing: true,
})
const { computeEncounterOrbit, forwardDelta } = await load('encounterOrbit.ts')
const encounter = computeEncounterOrbit(body1, body0, 0.4, { shape: 'circle', spread: 0.38, playing: true }, 0)
assert(encounter.orbit.distance === body0.orbit.distance, 'encounter shares target distance')
assert(encounter.orbit.pace > body0.orbit.pace, 'encounter speeds the mover')
assert(encounter.etaSeconds > 1 && encounter.etaSeconds < 40, 'encounter ETA is a short wait')
assert(forwardDelta(0, Math.PI) > 3, 'forward delta wraps correctly')
const merged = mergeSystemBodies(body0, body1, {
  localPoint: [0.8, 0.2, 0.1],
  direction: [-1, 0, 0],
  color: '#e07a2f',
  phase: body0.phase,
  nodeAngle: body0.nodeAngle,
  orbit: body0.orbit,
})
assert(merged.planet.scars.length === 1, 'merge records one new scar')
assert(merged.planet.scars[0].color === '#e07a2f', 'merge stores absorbed fossil color on scar')
assert((merged.planet.scars[0].radius ?? 0) >= 0.8, 'scar radius is large enough to read from orbit')
assert(merged.sourceEntryIds.length === 2, 'merge keeps both fossil sources')
assert(merged.phase === body0.phase, 'merge keeps contact-site phase')
assert(merged.label === body0.label, 'merge keeps survivor display name')
assert(/^Planet \d+$/.test(body0.label), 'new body uses Planet N name')
const { pickScarColor, defaultScarRadius } = await load('planetFormation.ts')
assert(pickScarColor(['#9a9a9a', '#e07a2f']) === '#e07a2f', 'scar color picks the vivid swatch')
assert(defaultScarRadius(0) >= 0.5, 'default scar radius is orbit-visible')
const { ACCRETION_DURATION } = await load('accretionAnim.ts')
assert(ACCRETION_DURATION >= 1 && ACCRETION_DURATION <= 2.5, 'accretion lasts about 1–2 seconds')

await server.close()

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll self-checks passed.')
