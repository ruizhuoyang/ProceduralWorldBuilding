import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { buildFossilGeometry } from './buildFossilGeometry'
import {
  createAtmosphere,
  disposeAtmosphere,
  setAtmosphereSizeMul,
  stepAtmosphere,
  type AtmosphereSystem,
} from './atmosphere'
import type { FossilHistoryEntry } from './history'
import {
  orbitRadiusAt,
  orbitSpeedWithPace,
  orbitTiltRadians,
  planetDisplayScale,
  resolveEccentricity,
  resolveOrbitDistance,
  type OrbitSystemSettings,
} from './orbit'
import { applyStoneNoiseParams, enableStoneNoiseMaterial } from './stoneNoiseMaterial'
import {
  DEFAULT_FOSSIL_PARAMS,
  MESH_RESOLUTION_PLANET_MAX,
  normalizeMeshResolution,
  normalizeOctaves,
  type FossilParams,
} from './types'

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
}

export type SolarSystem = {
  root: THREE.Group
  star: THREE.Mesh
  starLight: THREE.PointLight
  planets: PlanetBody[]
}

const TAU = Math.PI * 2
const ORBIT_SEGS = 96

function solarAtmosphereSizeMul(scale: number): number {
  return Math.min(3.8, Math.max(2.0, 0.5 / Math.max(0.08, scale)))
}

export function entryToPlanetParams(entry: FossilHistoryEntry): FossilParams {
  return {
    ...DEFAULT_FOSSIL_PARAMS,
    digits: entry.digits,
    noiseStrength: entry.params.noiseStrength,
    noiseScale: entry.params.noiseScale,
    digitStrength: entry.params.digitStrength,
    stoneColors: entry.params.stoneColors,
    colorAlts: entry.params.colorAlts,
    normalStrength: entry.params.normalStrength,
    heightBlend: entry.params.heightBlend,
    detail: Math.min(normalizeMeshResolution(entry.params.detail), MESH_RESOLUTION_PLANET_MAX),
    fbmOctaves: Math.min(normalizeOctaves(entry.params.fbmOctaves), 6),
    landformLayers: entry.params.landformLayers,
    baseRadius: 1,
  }
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
  entries: FossilHistoryEntry[],
  settings: OrbitSystemSettings,
) {
  for (let i = 0; i < system.planets.length; i++) {
    const planet = system.planets[i]!
    const entry = entries.find((item) => item.id === planet.id)
    if (!entry) continue
    const semiMajor = resolveOrbitDistance(entry.orbit, i, settings.spread)
    const eccentricity = resolveEccentricity(entry.orbit, settings.shape)
    const scale = planetDisplayScale(entry.orbit.size)
    planet.semiMajor = semiMajor
    planet.eccentricity = eccentricity
    planet.orbitSpeed = orbitSpeedWithPace(semiMajor, entry.orbit.pace)
    planet.pivot.rotation.set(
      orbitTiltRadians(entry.orbit.tilt),
      planet.nodeAngle + Math.PI * 0.5,
      0,
      'YXZ',
    )
    planet.mesh.scale.setScalar(scale)
    if (planet.atmosphere) setAtmosphereSizeMul(planet.atmosphere, solarAtmosphereSizeMul(scale))
    const label = planet.holder.children.find((child) => child instanceof CSS2DObject)
    if (label) label.position.set(0, scale * 1.35, 0)
    setOrbitLine(planet.orbitLine, semiMajor, eccentricity)
    placePlanet(planet)
  }
}

export function createSolarSystem(
  entries: FossilHistoryEntry[],
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

  entries.forEach((entry, index) => {
    const params = entryToPlanetParams(entry)
    const { geometry, seed, radiusMin, radiusMax } = buildFossilGeometry(params)
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    })
    enableStoneNoiseMaterial(material)
    applyStoneNoiseParams(material, {
      colors: params.stoneColors,
      colorAlts: params.colorAlts,
      seed,
      normalStrength: params.normalStrength,
      noiseScale: 2.4,
      heightBlend: params.heightBlend,
      radiusMin,
      radiusMax,
    })

    const mesh = new THREE.Mesh(geometry, material)
    const orbitLine = makeOrbitLine(2.4, 0)

    const pivot = new THREE.Group()
    pivot.rotation.order = 'YXZ'
    const nodeAngle = (((seed >>> 16) & 0xffff) / 65535) * Math.PI * 2

    const holder = new THREE.Group()
    holder.add(mesh)
    const scale = planetDisplayScale(entry.orbit.size)
    const atmosphere = createAtmosphere(
      geometry,
      seed,
      { ...entry.atmosphere, height: Math.max(entry.atmosphere.height, 0.08) },
      {
        maxCount: 2800,
        sizeMul: solarAtmosphereSizeMul(scale),
        limb: 0.12,
      },
    )
    if (atmosphere) mesh.add(atmosphere.points)

    const labelEl = document.createElement('div')
    labelEl.className = 'fossil-planet-label'
    labelEl.textContent = entry.digits
    const label = new CSS2DObject(labelEl)
    holder.add(label)

    pivot.add(orbitLine)
    pivot.add(holder)
    root.add(pivot)

    const phase = (index / Math.max(1, entries.length)) * TAU + ((seed % 1000) / 1000) * 0.8
    planets.push({
      id: entry.id,
      pivot,
      holder,
      mesh,
      orbitLine,
      semiMajor: 2.4,
      eccentricity: 0,
      orbitSpeed: 0.2,
      spinSpeed: 0.55 + ((seed % 80) / 80) * 0.9,
      nodeAngle,
      phase,
      material,
      atmosphere,
      atmosphereSavedVisible: entry.atmosphere.visible,
    })
  })

  const system = { root, star, starLight, planets }
  syncSolarOrbits(system, entries, settings)
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

export function tickSolarSystem(
  system: SolarSystem,
  dt: number,
  playing = true,
  particlesPlaying = false,
) {
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
  if (!particlesPlaying) return
  for (const planet of system.planets) {
    if (!planet.atmosphere || !planet.atmosphere.points.visible) continue
    stepAtmosphere(planet.atmosphere, dt, planet.mesh.geometry)
  }
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
