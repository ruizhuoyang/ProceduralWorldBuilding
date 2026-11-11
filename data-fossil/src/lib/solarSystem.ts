import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  createAtmosphere,
  disposeAtmosphere,
  setAtmosphereSizeMul,
  stepAtmosphere,
  type AtmosphereSystem,
} from './atmosphere'
import {
  orbitRadiusAt,
  orbitSpeedWithPace,
  orbitTiltRadians,
  planetDisplayScale,
  resolveEccentricity,
  resolveOrbitDistance,
  type OrbitSystemSettings,
} from './orbit'
import { buildFormedPlanetGeometry } from './planetFormation'
import { applyStoneNoiseParams, enableStoneNoiseMaterial } from './stoneNoiseMaterial'
import {
  bodyCollisionRadius,
  colorForAbsorbed,
  pickSurvivor,
  worldToMeshLocal,
  type BodyCollision,
  type SystemBody,
} from './systemBodies'
import type { FossilHistoryEntry } from './history'

export type PlanetBody = {
  id: string
  pivot: THREE.Group
  holder: THREE.Group
  mesh: THREE.Mesh
  orbitLine: THREE.Line
  semiMajor: number
  eccentricity: number
  orbitSpeed: number
  spinSpeed: number
  nodeAngle: number
  phase: number
  material: THREE.MeshStandardMaterial
  atmosphere: AtmosphereSystem | null
  atmosphereSavedVisible: boolean
  /** Approximate unscaled mesh radius for collision. */
  meanRadius: number
  collisionRadius: number
}

export type SolarSystem = {
  root: THREE.Group
  star: THREE.Mesh
  starLight: THREE.PointLight
  planets: PlanetBody[]
}

const TAU = Math.PI * 2
const ORBIT_SEGS = 96
const _worldA = new THREE.Vector3()
const _worldB = new THREE.Vector3()
const _local = new THREE.Vector3()
const _dir = new THREE.Vector3()

function solarAtmosphereSizeMul(scale: number): number {
  return Math.min(3.8, Math.max(2.0, 0.5 / Math.max(0.08, scale)))
}

function orbitPoints(semiMajor: number, ecc: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= ORBIT_SEGS; i++) {
    const a = (i / ORBIT_SEGS) * TAU
    const r = orbitRadiusAt(semiMajor, ecc, a)
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
  }
  return pts
}

function makeOrbitLine(semiMajor: number, ecc: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(orbitPoints(semiMajor, ecc))
  const mat = new THREE.LineBasicMaterial({
    color: 0x9a9690,
    transparent: true,
    opacity: 0.45,
  })
  return new THREE.Line(geo, mat)
}

function setOrbitLine(line: THREE.Line, semiMajor: number, ecc: number) {
  const prev = line.geometry
  line.geometry = new THREE.BufferGeometry().setFromPoints(orbitPoints(semiMajor, ecc))
  prev.dispose()
}

function placePlanet(planet: PlanetBody) {
  const r = orbitRadiusAt(planet.semiMajor, planet.eccentricity, planet.phase)
  planet.holder.position.set(Math.cos(planet.phase) * r, 0, Math.sin(planet.phase) * r)
}

export function syncSolarOrbits(
  system: SolarSystem,
  bodies: SystemBody[],
  settings: OrbitSystemSettings,
) {
  for (let i = 0; i < system.planets.length; i++) {
    const planet = system.planets[i]!
    const body = bodies.find((item) => item.id === planet.id)
    if (!body) continue
    const semiMajor = resolveOrbitDistance(body.orbit, i, settings.spread)
    const eccentricity = resolveEccentricity(body.orbit, settings.shape)
    const scale = planetDisplayScale(body.orbit.size)
    planet.semiMajor = semiMajor
    planet.eccentricity = eccentricity
    planet.orbitSpeed = orbitSpeedWithPace(semiMajor, body.orbit.pace)
    planet.nodeAngle = body.nodeAngle
    planet.spinSpeed = body.spinSpeed
    planet.pivot.rotation.set(
      orbitTiltRadians(body.orbit.tilt),
      planet.nodeAngle + Math.PI * 0.5,
      0,
      'YXZ',
    )
    planet.mesh.scale.setScalar(scale)
    planet.collisionRadius = bodyCollisionRadius(body, planet.meanRadius)
    if (planet.atmosphere) setAtmosphereSizeMul(planet.atmosphere, solarAtmosphereSizeMul(scale))
    const label = planet.holder.children.find((child) => child instanceof CSS2DObject)
    if (label) label.position.set(0, scale * 1.35, 0)
    setOrbitLine(planet.orbitLine, semiMajor, eccentricity)
    placePlanet(planet)
  }
}

function addPlanetBody(
  root: THREE.Group,
  planets: PlanetBody[],
  body: SystemBody,
  index: number,
) {
  const built = buildFormedPlanetGeometry(body.planet)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  })
  enableStoneNoiseMaterial(material)
  applyStoneNoiseParams(material, {
    colors: built.params.stoneColors,
    colorAlts: built.params.colorAlts,
    seed: built.seed,
    normalStrength: built.params.normalStrength,
    noiseScale: 2.4,
    heightBlend: built.params.heightBlend,
    radiusMin: built.radiusMin,
    radiusMax: built.radiusMax,
    scars: built.scars,
  })

  const mesh = new THREE.Mesh(built.geometry, material)
  const orbitLine = makeOrbitLine(2.4, 0)

  const pivot = new THREE.Group()
  pivot.rotation.order = 'YXZ'

  const holder = new THREE.Group()
  holder.add(mesh)
  const scale = planetDisplayScale(body.orbit.size)
  const atmosphere = createAtmosphere(
    built.geometry,
    built.seed,
    { ...body.planet.atmosphere, height: Math.max(body.planet.atmosphere.height, 0.08) },
    {
      maxCount: 2800,
      sizeMul: solarAtmosphereSizeMul(scale),
      limb: 0.12,
    },
  )
  if (atmosphere) mesh.add(atmosphere.points)

  const labelEl = document.createElement('div')
  labelEl.className = 'fossil-planet-label'
  labelEl.textContent = body.label
  const label = new CSS2DObject(labelEl)
  holder.add(label)

  pivot.add(orbitLine)
  pivot.add(holder)
  root.add(pivot)

  planets.push({
    id: body.id,
    pivot,
    holder,
    mesh,
    orbitLine,
    semiMajor: 2.4,
    eccentricity: 0,
    orbitSpeed: 0.2,
    spinSpeed: body.spinSpeed,
    nodeAngle: body.nodeAngle,
    phase: body.phase,
    material,
    atmosphere,
    atmosphereSavedVisible: body.planet.atmosphere.visible,
    meanRadius: built.meanRadius,
    collisionRadius: bodyCollisionRadius(body, built.meanRadius),
  })

  // Silence unused index lint in case of future spacing logic.
  void index
}

export function createSolarSystem(
  bodies: SystemBody[],
  settings: OrbitSystemSettings,
): SolarSystem {
  const root = new THREE.Group()
  root.name = 'solarSystem'

  const starGeo = new THREE.SphereGeometry(0.55, 32, 24)
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a8,
    emissive: 0xc49a5a,
    emissiveIntensity: 1.15,
    roughness: 0.45,
    metalness: 0.05,
  })
  const star = new THREE.Mesh(starGeo, starMat)
  root.add(star)

  const starLight = new THREE.PointLight(0xffd9a0, 2.2, 40, 1.6)
  starLight.position.set(0, 0.2, 0)
  root.add(starLight)

  const planets: PlanetBody[] = []
  bodies.forEach((body, index) => addPlanetBody(root, planets, body, index))

  const system = { root, star, starLight, planets }
  syncSolarOrbits(system, bodies, settings)
  return system
}

export function disposeSolarSystem(system: SolarSystem | null | undefined) {
  if (!system) return
  for (const planet of system.planets) {
    if (planet.atmosphere) {
      planet.atmosphere.points.removeFromParent()
      disposeAtmosphere(planet.atmosphere)
    }
    planet.mesh.geometry.dispose()
    planet.material.dispose()
    planet.orbitLine.geometry.dispose()
    ;(planet.orbitLine.material as THREE.Material).dispose()
    planet.pivot.traverse((obj) => {
      const css = obj as CSS2DObject
      if (css.element?.parentNode) css.element.parentNode.removeChild(css.element)
    })
  }
  system.star.geometry.dispose()
  ;(system.star.material as THREE.Material).dispose()
  if (system.root.parent) system.root.parent.remove(system.root)
  system.root.clear()
}

export function captureSolarPhases(system: SolarSystem | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!system) return out
  for (const planet of system.planets) out[planet.id] = planet.phase
  return out
}

export function applySolarPhases(system: SolarSystem, phases: Record<string, number>) {
  for (const planet of system.planets) {
    if (typeof phases[planet.id] === 'number') {
      planet.phase = phases[planet.id]!
      placePlanet(planet)
    }
  }
}

/**
 * Advance orbits, then test pairwise contact in world space.
 * Orbit paths may cross visually without a hit until both bodies occupy nearby 3D positions.
 */
export function tickSolarSystem(
  system: SolarSystem,
  dt: number,
  playing = true,
  particlesPlaying = false,
  bodies?: SystemBody[],
  history?: FossilHistoryEntry[],
): BodyCollision | null {
  if (playing) {
    system.star.rotation.y += dt * 0.25
    for (const planet of system.planets) {
      planet.phase += dt * planet.orbitSpeed
      planet.mesh.rotation.y += dt * planet.spinSpeed
      placePlanet(planet)
    }
  } else {
    for (const planet of system.planets) placePlanet(planet)
  }

  if (particlesPlaying) {
    for (const planet of system.planets) {
      if (!planet.atmosphere || !planet.atmosphere.points.visible) continue
      stepAtmosphere(planet.atmosphere, dt, planet.mesh.geometry)
    }
  }

  if (!bodies || bodies.length < 2) return null

  // placePlanet only writes local transforms — refresh world matrices before contact tests.
  system.root.updateMatrixWorld(true)

  for (let i = 0; i < system.planets.length; i++) {
    const pa = system.planets[i]!
    pa.holder.getWorldPosition(_worldA)
    for (let j = i + 1; j < system.planets.length; j++) {
      const pb = system.planets[j]!
      pb.holder.getWorldPosition(_worldB)
      const dist = _worldA.distanceTo(_worldB)
      const reach = pa.collisionRadius + pb.collisionRadius
      // Same-track angular gate: catches near-miss tunneling when centers share a circle.
      const dSemi = Math.abs(pa.semiMajor - pb.semiMajor)
      const dPhase = Math.abs(Math.atan2(Math.sin(pa.phase - pb.phase), Math.cos(pa.phase - pb.phase)))
      const sameTrackHit = dSemi < 0.2 && dPhase < 0.28
      if (dist > reach && !sameTrackHit) continue

      const bodyA = bodies.find((b) => b.id === pa.id)
      const bodyB = bodies.find((b) => b.id === pb.id)
      if (!bodyA || !bodyB) continue

      const [survivorBody, absorbedBody] = pickSurvivor(bodyA, bodyB)
      const survivorPlanet = survivorBody.id === pa.id ? pa : pb
      const absorbedPlanet = absorbedBody.id === pa.id ? pa : pb

      const contact = new THREE.Vector3().lerpVectors(
        survivorPlanet.id === pa.id ? _worldA : _worldB,
        absorbedPlanet.id === pa.id ? _worldA : _worldB,
        0.5,
      )
      worldToMeshLocal(contact, survivorPlanet.mesh, _local)
      if (_local.lengthSq() < 1e-8) _local.set(0, 1, 0)
      else _local.normalize().multiplyScalar(survivorPlanet.meanRadius * 0.95)

      const absWorld = new THREE.Vector3()
      const surWorld = new THREE.Vector3()
      absorbedPlanet.holder.getWorldPosition(absWorld)
      survivorPlanet.holder.getWorldPosition(surWorld)
      _dir.copy(surWorld).sub(absWorld)
      if (_dir.lengthSq() < 1e-8) _dir.set(1, 0, 0)
      else _dir.normalize()
      const inv = new THREE.Matrix4().copy(survivorPlanet.mesh.matrixWorld).invert()
      _dir.transformDirection(inv).normalize()

      return {
        survivorId: survivorBody.id,
        absorbedId: absorbedBody.id,
        localPoint: [_local.x, _local.y, _local.z],
        direction: [_dir.x, _dir.y, _dir.z],
        color: colorForAbsorbed(absorbedBody, history ?? []),
        phase: survivorPlanet.phase,
        nodeAngle: survivorPlanet.nodeAngle,
        orbit: { ...survivorBody.orbit },
      }
    }
  }

  return null
}

export function setSolarAtmosphereState(
  system: SolarSystem | null | undefined,
  visible: boolean,
  wireframe: boolean,
) {
  if (!system) return
  for (const planet of system.planets) {
    if (!planet.atmosphere) continue
    planet.atmosphere.points.visible = !wireframe && (visible || planet.atmosphereSavedVisible)
  }
}

export function setSolarSystemWireframe(system: SolarSystem | null | undefined, wireframe: boolean) {
  if (!system) return
  for (const planet of system.planets) {
    planet.material.wireframe = wireframe
  }
}

export const ORBIT_HOME = {
  position: new THREE.Vector3(0, 9.5, 16),
  target: new THREE.Vector3(0, 0, 0),
}
