import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { buildFossilGeometry } from '../lib/buildFossilGeometry'
import type { FossilHistoryEntry } from '../lib/history'
import { DEFAULT_ORBIT_SYSTEM, type OrbitSystemSettings } from '../lib/orbit'
import {
  buildFormedPlanetGeometry,
  isImpactScar,
  pickScarMemoryAt,
  type PlanetScar,
  type SurfaceMemoryInfo,
} from '../lib/planetFormation'
import {
  applySolarPhases,
  captureSolarPhases,
  createSolarSystem,
  disposeSolarSystem,
  ORBIT_HOME,
  setSolarAtmosphereState,
  setSolarSystemWireframe,
  syncPlanetLabelHints,
  syncSolarOrbits,
  tickSolarSystem,
  type SolarSystem,
} from '../lib/solarSystem'
import {
  applyAtmosphereLook,
  createAtmosphere,
  disposeAtmosphere,
  stepAtmosphere,
  type AtmosphereSystem,
} from '../lib/atmosphere'
import { applyStoneNoiseParams, enableStoneNoiseMaterial } from '../lib/stoneNoiseMaterial'
import {
  disposeAccretionAnim,
  startAccretionAnim,
  tickAccretionAnim,
  type AccretionAnim,
} from '../lib/accretionAnim'
import {
  clearFxParticles,
  createFxParticleSystem,
  disposeFxParticleSystem,
  FX_KIND,
  spawnImprintCascade,
  stepFxParticles,
  syncSurfaceDust,
  type FxParticleSystem,
} from '../lib/fxParticles'
import { systemMeshKey, type BodyCollision, type SystemBody } from '../lib/systemBodies'
import type {
  AtmosphereParams,
  DigitRegion,
  FossilParams,
  LightingParams,
  ViewportMode,
} from '../lib/types'
import './FossilCanvas.css'

export type FossilCanvasHandle = {
  resetView: () => void
  captureThumbnail: () => string | null
  exportSTL: (filename?: string) => void
  /** Live orbital phases for session bodies (for demo-friendly inserts). */
  getSolarPhases: () => Record<string, number>
  /** Drop an in-flight accretion so a removed body cannot reappear on finish. */
  cancelAccretion: () => void
  /** After the surface memory card closes — advance the imprint guide arrow. */
  notifySurfaceMemoryClosed: () => void
}

type FossilCanvasProps = {
  params: FossilParams
  lighting: LightingParams
  atmosphere: AtmosphereParams
  /** Bumps when Generate / param commits — drives mesh rebuild. */
  revision: number
  wireframe: boolean
  showMapping: boolean
  viewportMode: ViewportMode
  /** View-mode stellar system of saved fossils */
  orbitSystem: boolean
  /** View-mode camera inside the current stone */
  interiorView: boolean
  /** View-mode camera standing on the stone surface */
  surfaceView: boolean
  /** Bodies currently in the stellar system (session). */
  systemBodies: SystemBody[]
  /** System body for Surface / Interior when set; otherwise studio rock. */
  surfaceBody: SystemBody | null
  historyEntries: FossilHistoryEntry[]
  orbitSettings?: OrbitSystemSettings
  onSeedChange: (seed: number) => void
  onBodiesCollide: (collision: BodyCollision) => void
  onSurfaceMemoryPick?: (memory: SurfaceMemoryInfo | null) => void
  /** Body waiting for a collide-target click in the stellar scene. */
  collideSelectMoverId?: string | null
  /** Active chase pair after Collide with… is confirmed. */
  approachPair?: { moverId: string; targetId: string } | null
  onPickCollideTarget?: (targetId: string) => void
}

type SceneBag = {
  renderer: THREE.WebGLRenderer
  labelRenderer: CSS2DRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  rock: THREE.Mesh
  material: THREE.MeshStandardMaterial
  mappingGroup: THREE.Group
  worldGroup: THREE.Group
  axesCorner: {
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    axes: THREE.AxesHelper
  }
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  interiorLight: THREE.PointLight
  viewportMode: ViewportMode
  orbitSystem: boolean
  interiorView: boolean
  surfaceView: boolean
  surfaceFps: SurfaceFpsState | null
  solar: SolarSystem | null
  solarMeshKey: string
  atmosphere: AtmosphereSystem | null
  atmosphereOn: boolean
  atmospherePlaying: boolean
  seed: number
  clock: THREE.Clock
  collisionLockUntil: number
  surfaceBodyId: string | null
  accretion: AccretionAnim | null
  surfaceGuide: SurfaceGuideState | null
  fx: FxParticleSystem | null
  _fxFoot: THREE.Vector3
  _fxClick: THREE.Vector3
}

type SurfaceFpsState = {
  yaw: number
  pitch: number
  keys: Set<string>
  dragging: boolean
  dragMoved: boolean
  downX: number
  downY: number
  lastX: number
  lastY: number
  hoverMemory: boolean
  pickRaycaster: THREE.Raycaster
  raycaster: THREE.Raycaster
  up: THREE.Vector3
  foot: THREE.Vector3
}

type SurfaceGuideState = {
  el: HTMLDivElement
  arrow: HTMLDivElement
  viewed: Set<string>
  /** Scar opened in the memory card, waiting for close. */
  pendingKey: string | null
  _proj: THREE.Vector3
  _world: THREE.Vector3
  _camFwd: THREE.Vector3
}

const SURFACE_CLICK_SLOP = 6

const HOME = {
  position: new THREE.Vector3(2.55, 1.35, 2.95),
  target: new THREE.Vector3(0, 0, 0),
}

const INTERIOR_HOME = {
  position: new THREE.Vector3(0, 0, 0.08),
  target: new THREE.Vector3(0, 0, 0),
}

/** Prefer a front foothold so the first look faces open space. */
const SURFACE_SEEK = new THREE.Vector3(0.35, 0.28, 0.9).normalize()
const _surfaceV = new THREE.Vector3()
const _surfaceF = new THREE.Vector3()
const _surfaceR = new THREE.Vector3()
const _surfaceMove = new THREE.Vector3()
const _surfaceFrom = new THREE.Vector3()
const _surfaceDir = new THREE.Vector3()
const _surfaceUp = new THREE.Vector3(0, 1, 0)

const STUDIO_FOV = 40
const INTERIOR_FOV = 80
const SURFACE_FOV = 100
/** Stand close to the crust without sinking into local noise / imprint relief. */
const SURFACE_EYE_HEIGHT = 0.036
/** Near must stay well below eye height so looking down does not slice the mesh. */
const SURFACE_NEAR = 0.0012
/** ~50% of the previous 0.7 pace — slow approach to imprints; still dt-scaled. */
const SURFACE_MOVE_SPEED = 0.34
const SURFACE_LOOK_SENS = 0.0028
const SURFACE_PITCH_MIN = -0.98
const SURFACE_PITCH_MAX = 1.05
const VIEW_SPIN_RAD_PER_SEC = 0.35
const SURFACE_GUIDE_MARGIN = 28
const SURFACE_GUIDE_ABOVE = 42

function clearMapping(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0]!
    group.remove(child)
    child.traverse((obj) => {
      const css = obj as CSS2DObject
      if (css.element?.parentNode) css.element.parentNode.removeChild(css.element)
    })
  }
  disposeMappingShared(group)
}

function buildMappingMarkers(regions: DigitRegion[], group: THREE.Group, radiusHint: number) {
  clearMapping(group)
  const markerGeo = new THREE.SphereGeometry(0.035, 12, 12)
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xc49a5a })

  for (const region of regions) {
    const [cx, cy, cz] = region.center
    const lift = radiusHint + 0.18
    const marker = new THREE.Mesh(markerGeo, markerMat)
    marker.position.set(cx * lift, cy * lift, cz * lift)
    group.add(marker)

    const el = document.createElement('div')
    el.className = 'fossil-map-label'
    el.textContent = `${region.index + 1}:${region.digit}`
    const label = new CSS2DObject(el)
    label.position.copy(marker.position).multiplyScalar(1.08)
    group.add(label)
  }

  group.userData.sharedGeo = markerGeo
  group.userData.sharedMat = markerMat
}

function disposeMappingShared(group: THREE.Group) {
  const geo = group.userData.sharedGeo as THREE.BufferGeometry | undefined
  const mat = group.userData.sharedMat as THREE.Material | undefined
  geo?.dispose()
  mat?.dispose()
  group.userData.sharedGeo = undefined
  group.userData.sharedMat = undefined
}

function buildWorldHelpers(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0]!
    group.remove(child)
    child.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
      const css = obj as CSS2DObject
      if (css.element?.parentNode) css.element.parentNode.removeChild(css.element)
    })
  }

  const grid = new THREE.GridHelper(6, 12, 0x9a9690, 0xc4c1bb)
  grid.position.y = -1.35
  group.add(grid)

  const axes = new THREE.AxesHelper(1.35)
  group.add(axes)

  const tips: { text: string; color: string; pos: [number, number, number] }[] = [
    { text: 'X', color: '#e05050', pos: [1.45, 0, 0] },
    { text: 'Y', color: '#50b050', pos: [0, 1.45, 0] },
    { text: 'Z', color: '#5080e0', pos: [0, 0, 1.45] },
  ]
  for (const tip of tips) {
    const el = document.createElement('div')
    el.className = 'fossil-axis-label'
    el.style.color = tip.color
    el.textContent = tip.text
    const label = new CSS2DObject(el)
    label.position.set(...tip.pos)
    group.add(label)
  }

  const worldEl = document.createElement('div')
  worldEl.className = 'fossil-world-label'
  worldEl.textContent = 'World'
  const worldLabel = new CSS2DObject(worldEl)
  worldLabel.position.set(0, -1.35, 2.85)
  group.add(worldLabel)
}

const TONE_MAPPING_EXPOSURE = 1.15

function applyStudioLighting(bag: SceneBag, lighting: LightingParams) {
  const k = lighting.key
  bag.ambient.intensity = k * 0.82
  bag.hemi.intensity = k * 0.58
  bag.key.intensity = k * 0.32
  bag.fill.intensity = k * 0.16
  bag.rim.intensity = k * 0.05
  bag.interiorLight.intensity = 0
  bag.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE
}

function applyInteriorLighting(bag: SceneBag) {
  bag.ambient.intensity = 1.05
  bag.hemi.intensity = 0.4
  bag.key.intensity = 0.1
  bag.fill.intensity = 0.06
  bag.rim.intensity = 0.04
  bag.interiorLight.intensity = 0.72
  bag.renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE
}

function applyLighting(bag: SceneBag, lighting: LightingParams) {
  if (bag.interiorView) applyInteriorLighting(bag)
  else applyStudioLighting(bag, lighting)
}

function syncAtmosphere(bag: SceneBag, wireframe: boolean) {
  if (bag.atmosphere) {
    bag.atmosphere.points.visible =
      bag.atmosphereOn &&
      !bag.orbitSystem &&
      !bag.interiorView &&
      !wireframe
  }
}

function isLookAroundView(bag: SceneBag) {
  return bag.interiorView || bag.surfaceView
}

function applyAtmosphereState(bag: SceneBag, params: AtmosphereParams, wireframe: boolean) {
  bag.atmosphereOn = params.visible
  bag.atmospherePlaying = params.playing
  syncAtmosphere(bag, wireframe)
}

function disposeStudioAtmosphere(bag: SceneBag) {
  if (!bag.atmosphere) return
  bag.atmosphere.points.removeFromParent()
  disposeAtmosphere(bag.atmosphere)
  bag.atmosphere = null
}

function rebuildStudioAtmosphere(
  bag: SceneBag,
  seed: number,
  params: AtmosphereParams,
  wireframe: boolean,
) {
  disposeStudioAtmosphere(bag)
  applyAtmosphereState(bag, params, wireframe)
  const atmo = createAtmosphere(bag.rock.geometry, seed, params)
  if (atmo) {
    bag.rock.add(atmo.points)
    bag.atmosphere = atmo
  }
  syncAtmosphere(bag, wireframe)
}

function applyViewportMode(bag: SceneBag, mode: ViewportMode) {
  bag.viewportMode = mode
  bag.worldGroup.visible =
    mode === 'edit' && !bag.orbitSystem && !bag.interiorView && !bag.surfaceView
  syncAtmosphere(bag, bag.material.wireframe)
}

function clearSolar(bag: SceneBag) {
  if (!bag.solar) return
  bag.scene.remove(bag.solar.root)
  disposeSolarSystem(bag.solar)
  bag.solar = null
}

function applyStudioLens(bag: SceneBag) {
  bag.camera.fov = STUDIO_FOV
  bag.camera.near = 0.1
  bag.controls.enablePan = true
  bag.camera.updateProjectionMatrix()
}

/** Snap OrbitControls hard — damping otherwise keeps dragging the view after Reset. */
function snapOrbitControls(
  bag: SceneBag,
  position: THREE.Vector3,
  target: THREE.Vector3,
  distances?: { min: number; max: number },
) {
  const { controls, camera } = bag
  const hadDamping = controls.enableDamping
  controls.enableDamping = false
  if (distances) {
    controls.minDistance = distances.min
    controls.maxDistance = distances.max
  }
  controls.target.copy(target)
  camera.position.copy(position)
  camera.up.set(0, 1, 0)
  controls.update()
  controls.saveState()
  controls.enableDamping = hadDamping
}

function setOrbitCamera(bag: SceneBag, on: boolean) {
  applyStudioLens(bag)
  if (on) {
    snapOrbitControls(bag, ORBIT_HOME.position, ORBIT_HOME.target, { min: 3, max: 48 })
  } else {
    snapOrbitControls(bag, HOME.position, HOME.target, { min: 1.2, max: 12 })
  }
}

function setInteriorCamera(bag: SceneBag) {
  bag.rock.rotation.set(0, 0, 0)
  bag.camera.fov = INTERIOR_FOV
  bag.camera.near = 0.02
  bag.controls.enablePan = false
  bag.camera.updateProjectionMatrix()
  snapOrbitControls(bag, INTERIOR_HOME.position, INTERIOR_HOME.target, {
    min: 0.001,
    max: 0.15,
  })
}

function pickSurfaceFoot(geometry: THREE.BufferGeometry, outFoot: THREE.Vector3, outNormal: THREE.Vector3) {
  const pos = geometry.getAttribute('position')
  let best = 0
  let bestScore = -Infinity
  for (let i = 0; i < pos.count; i++) {
    _surfaceV.fromBufferAttribute(pos, i)
    const score = _surfaceV.dot(SURFACE_SEEK)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  outFoot.fromBufferAttribute(pos, best)
  outNormal.copy(outFoot).normalize()
}

function raycastSurface(
  bag: SceneBag,
  direction: THREE.Vector3,
  outFoot: THREE.Vector3,
  outNormal: THREE.Vector3,
): boolean {
  const fps = bag.surfaceFps
  if (!fps) return false
  _surfaceDir.copy(direction).normalize()
  if (_surfaceDir.lengthSq() < 1e-10) return false
  _surfaceFrom.copy(_surfaceDir).multiplyScalar(6)
  fps.raycaster.set(_surfaceFrom, _surfaceDir.negate())
  const hits = fps.raycaster.intersectObject(bag.rock, false)
  if (hits.length === 0) return false
  const hit = hits[0]!
  outFoot.copy(hit.point)
  if (hit.normal) outNormal.copy(hit.normal).normalize()
  else outNormal.copy(outFoot).normalize()
  return true
}

function surfaceLookBasis(
  up: THREE.Vector3,
  yaw: number,
  pitch: number,
  outForward: THREE.Vector3,
  outRight: THREE.Vector3,
) {
  outRight.crossVectors(_surfaceUp, up)
  if (outRight.lengthSq() < 1e-8) outRight.set(1, 0, 0).cross(up)
  outRight.normalize()
  outForward.crossVectors(up, outRight).normalize()
  outForward.applyAxisAngle(up, yaw)
  outRight.crossVectors(outForward, up).normalize()
  outForward.applyAxisAngle(outRight, pitch).normalize()
  outRight.crossVectors(outForward, up).normalize()
}

function applySurfacePose(bag: SceneBag) {
  const fps = bag.surfaceFps
  if (!fps) return
  surfaceLookBasis(fps.up, fps.yaw, fps.pitch, _surfaceF, _surfaceR)

  // Re-seat the foot with a short normal cast so steep imprint relief cannot
  // leave the FrontSide lens underground (near-clip "破面").
  _surfaceFrom.copy(fps.foot).addScaledVector(fps.up, 0.5)
  fps.raycaster.set(_surfaceFrom, _surfaceDir.copy(fps.up).negate())
  const clearanceHits = fps.raycaster.intersectObject(bag.rock, false)
  if (clearanceHits.length > 0) {
    const hit = clearanceHits[0]!
    // Ignore distant wrong hits (e.g. far side of the rock through a cave).
    if (hit.distance < 0.65) {
      fps.foot.copy(hit.point)
      if (hit.normal) fps.up.copy(hit.normal).normalize()
    }
  }

  bag.camera.position.copy(fps.foot).addScaledVector(fps.up, SURFACE_EYE_HEIGHT)
  bag.camera.up.copy(fps.up)
  bag.camera.lookAt(_surfaceV.copy(bag.camera.position).add(_surfaceF))
  bag.camera.updateMatrixWorld()
}

function initSurfaceFps(bag: SceneBag, seekDir?: THREE.Vector3 | null) {
  if (!bag.surfaceFps) {
    bag.surfaceFps = {
      yaw: 0,
      pitch: -0.12,
      keys: new Set(),
      dragging: false,
      dragMoved: false,
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      hoverMemory: false,
      pickRaycaster: new THREE.Raycaster(),
      raycaster: new THREE.Raycaster(),
      up: new THREE.Vector3(0, 1, 0),
      foot: new THREE.Vector3(),
    }
  }
  const fps = bag.surfaceFps
  fps.keys.clear()
  fps.dragging = false
  // Look down enough that a landmark underfoot / nearby stain sits in the view.
  fps.pitch = seekDir && seekDir.lengthSq() > 1e-8 ? -0.48 : -0.18
  const seek = seekDir && seekDir.lengthSq() > 1e-8 ? seekDir.clone().normalize() : SURFACE_SEEK
  pickSurfaceFoot(bag.rock.geometry, fps.foot, fps.up)
  if (!raycastSurface(bag, seek, fps.foot, fps.up)) {
    pickSurfaceFoot(bag.rock.geometry, fps.foot, fps.up)
  }
  // Face roughly outward / horizon
  surfaceLookBasis(fps.up, 0, 0, _surfaceF, _surfaceR)
  const desired = _surfaceV.copy(_surfaceF)
  desired.addScaledVector(fps.up, -desired.dot(fps.up))
  if (desired.lengthSq() > 1e-8) {
    const ref = _surfaceR.crossVectors(_surfaceUp, fps.up)
    if (ref.lengthSq() < 1e-8) ref.set(1, 0, 0).cross(fps.up)
    ref.normalize()
    const north = _surfaceF.crossVectors(fps.up, ref).normalize()
    fps.yaw = Math.atan2(desired.dot(ref), desired.dot(north))
  } else {
    fps.yaw = 0
  }
}

function setSurfaceCamera(bag: SceneBag, seekDir?: THREE.Vector3 | null) {
  bag.rock.rotation.set(0, 0, 0)
  bag.controls.enabled = false
  bag.camera.fov = SURFACE_FOV
  bag.camera.near = SURFACE_NEAR
  bag.camera.updateProjectionMatrix()
  initSurfaceFps(bag, seekDir)
  applySurfacePose(bag)
}

function stepSurfaceFps(bag: SceneBag, dt: number) {
  const fps = bag.surfaceFps
  if (!fps || !bag.surfaceView) return
  // Cap hitch spikes so a long pause does not teleport across the crust.
  const stepDt = Math.min(Math.max(dt, 0), 0.05)

  let forward = 0
  let strafe = 0
  if (fps.keys.has('KeyW') || fps.keys.has('KeyZ')) forward += 1
  if (fps.keys.has('KeyS')) forward -= 1
  if (fps.keys.has('KeyD')) strafe += 1
  if (fps.keys.has('KeyA') || fps.keys.has('KeyQ')) strafe -= 1

  if (forward !== 0 || strafe !== 0) {
    surfaceLookBasis(fps.up, fps.yaw, fps.pitch, _surfaceF, _surfaceR)
    _surfaceMove.copy(_surfaceF).addScaledVector(fps.up, -_surfaceF.dot(fps.up))
    if (_surfaceMove.lengthSq() > 1e-8) _surfaceMove.normalize()
    else _surfaceMove.set(0, 0, 0)
    _surfaceMove.multiplyScalar(forward)
    _surfaceMove.addScaledVector(_surfaceR, strafe)
    if (_surfaceMove.lengthSq() > 1e-8) {
      _surfaceMove.normalize().multiplyScalar(SURFACE_MOVE_SPEED * stepDt)
      _surfaceV.copy(fps.foot).add(_surfaceMove)
      if (raycastSurface(bag, _surfaceV, fps.foot, fps.up)) {
        applySurfacePose(bag)
      }
    }
  } else {
    applySurfacePose(bag)
  }
}

function leaveSurfaceCamera(bag: SceneBag) {
  if (bag.surfaceFps) {
    bag.surfaceFps.keys.clear()
    bag.surfaceFps.hoverMemory = false
  }
  hideSurfaceGuide(bag)
  if (bag.fx) {
    clearFxParticles(
      bag.fx,
      (i) => bag.fx!.kind[i] === FX_KIND.DUST || bag.fx!.kind[i] === FX_KIND.IMPRINT,
    )
    bag.fx.dustScarKey = null
    bag.fx.dustFade = 0
    bag.fx.imprintPlaying = false
  }
  bag.controls.enabled = true
  bag.renderer.domElement.style.cursor = ''
}

function scarGuideKey(scar: Pick<PlanetScar, 'fossilId' | 'localPoint'> | SurfaceMemoryInfo) {
  const [x, y, z] = scar.localPoint
  return `${scar.fossilId}|${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`
}

/** Latest impact first, then older impacts, then native landmarks. */
function surfaceGuideOrder(scars: PlanetScar[]): PlanetScar[] {
  const impacts: PlanetScar[] = []
  const natives: PlanetScar[] = []
  for (const scar of scars) {
    if (isImpactScar(scar)) impacts.push(scar)
    else natives.push(scar)
  }
  return [...impacts].reverse().concat([...natives].reverse())
}

function currentGuideScar(bag: SceneBag, body: SystemBody | null): PlanetScar | null {
  const guide = bag.surfaceGuide
  if (!guide || !body) return null
  for (const scar of surfaceGuideOrder(body.planet.scars)) {
    if (!guide.viewed.has(scarGuideKey(scar))) return scar
  }
  return null
}

function ensureSurfaceGuide(bag: SceneBag, host: HTMLElement) {
  if (bag.surfaceGuide) return bag.surfaceGuide
  const el = document.createElement('div')
  el.className = 'fossil-surface-guide'
  el.hidden = true
  el.setAttribute('aria-hidden', 'true')
  const arrow = document.createElement('div')
  arrow.className = 'fossil-surface-guide__arrow'
  el.appendChild(arrow)
  host.appendChild(el)
  bag.surfaceGuide = {
    el,
    arrow,
    viewed: new Set(),
    pendingKey: null,
    _proj: new THREE.Vector3(),
    _world: new THREE.Vector3(),
    _camFwd: new THREE.Vector3(),
  }
  return bag.surfaceGuide
}

function resetSurfaceGuide(bag: SceneBag) {
  if (!bag.surfaceGuide) return
  bag.surfaceGuide.viewed.clear()
  bag.surfaceGuide.pendingKey = null
  hideSurfaceGuide(bag)
}

function hideSurfaceGuide(bag: SceneBag) {
  const guide = bag.surfaceGuide
  if (!guide) return
  guide.el.hidden = true
}

function clampGuideToEdge(
  sx: number,
  sy: number,
  width: number,
  height: number,
  margin: number,
): { x: number; y: number; angle: number } {
  const cx = width * 0.5
  const cy = height * 0.5
  let dx = sx - cx
  let dy = sy - cy
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1
  const len = Math.hypot(dx, dy) || 1
  dx /= len
  dy /= len

  const left = margin
  const right = width - margin
  const top = margin
  const bottom = height - margin
  const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Number.POSITIVE_INFINITY
  const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Number.POSITIVE_INFINITY
  const t = Math.min(Math.abs(tx), Math.abs(ty))
  return {
    x: cx + dx * t,
    y: cy + dy * t,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
  }
}

function updateSurfaceGuideArrow(bag: SceneBag, body: SystemBody | null) {
  const guide = bag.surfaceGuide
  const fps = bag.surfaceFps
  if (!guide || !fps || !bag.surfaceView || !body) {
    hideSurfaceGuide(bag)
    return
  }
  const scar = currentGuideScar(bag, body)
  if (!scar) {
    hideSurfaceGuide(bag)
    return
  }

  const canvas = bag.renderer.domElement
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) {
    hideSurfaceGuide(bag)
    return
  }

  guide._world.set(...scar.localPoint)
  if (guide._world.lengthSq() < 1e-10) {
    guide._world.set(...scar.direction).negate()
  }
  if (guide._world.lengthSq() < 1e-10) {
    hideSurfaceGuide(bag)
    return
  }
  guide._world.normalize()
  const lift = 0.045
  guide._world.multiplyScalar(1 + lift)
  bag.rock.localToWorld(guide._world)

  bag.camera.getWorldDirection(guide._camFwd)
  const toTarget = guide._proj.copy(guide._world).sub(bag.camera.position)
  const inFront = toTarget.dot(guide._camFwd) > 0.02

  guide._proj.copy(guide._world).project(bag.camera)
  let sx = (guide._proj.x * 0.5 + 0.5) * width
  let sy = (-guide._proj.y * 0.5 + 0.5) * height
  if (!inFront) {
    // Project behind the camera → push toward the opposite screen edge.
    sx = width * 0.5 - guide._proj.x * width
    sy = height * 0.5 + guide._proj.y * height
  }

  const onScreen =
    inFront &&
    sx >= SURFACE_GUIDE_MARGIN &&
    sx <= width - SURFACE_GUIDE_MARGIN &&
    sy >= SURFACE_GUIDE_MARGIN &&
    sy <= height - SURFACE_GUIDE_MARGIN

  guide.el.hidden = false
  if (onScreen) {
    guide.el.style.left = `${sx}px`
    guide.el.style.top = `${sy - SURFACE_GUIDE_ABOVE}px`
    guide.el.style.transform = 'translate(-50%, -50%) rotate(180deg)'
    guide.el.dataset.mode = 'over'
  } else {
    const edge = clampGuideToEdge(sx, sy, width, height, SURFACE_GUIDE_MARGIN)
    guide.el.style.left = `${edge.x}px`
    guide.el.style.top = `${edge.y}px`
    guide.el.style.transform = `translate(-50%, -50%) rotate(${edge.angle}deg)`
    guide.el.dataset.mode = 'edge'
  }
}

function noteSurfaceMemoryOpened(bag: SceneBag, memory: SurfaceMemoryInfo | null) {
  if (!bag.surfaceGuide || !memory) return
  bag.surfaceGuide.pendingKey = scarGuideKey(memory)
}

function updateSurfaceDustFx(bag: SceneBag, body: SystemBody | null) {
  const fx = bag.fx
  const fps = bag.surfaceFps
  if (!fx || !fps || !bag.surfaceView) return
  const scar = currentGuideScar(bag, body)
  bag.rock.localToWorld(bag._fxFoot.copy(fps.foot))
  syncSurfaceDust(fx, {
    rock: bag.rock,
    scar,
    footWorld: bag._fxFoot,
    camera: bag.camera,
    forceHide: !scar,
  })
}

function resolveScarFromMemory(body: SystemBody | null, memory: SurfaceMemoryInfo): PlanetScar | null {
  if (!body) return null
  const key = scarGuideKey(memory)
  return body.planet.scars.find((s) => scarGuideKey(s) === key) ?? null
}

function triggerImprintCascadeFx(
  bag: SceneBag,
  body: SystemBody | null,
  memory: SurfaceMemoryInfo,
  clientX: number,
  clientY: number,
) {
  const fx = bag.fx
  if (!fx) return
  const scar = resolveScarFromMemory(body, memory)
  if (!scar) return

  const canvas = bag.renderer.domElement
  const rect = canvas.getBoundingClientRect()
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
  const fps = bag.surfaceFps
  let clickWorld = bag._fxClick
  if (fps) {
    fps.pickRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), bag.camera)
    const hits = fps.pickRaycaster.intersectObject(bag.rock, false)
    if (hits[0]) clickWorld.copy(hits[0].point)
    else bag.rock.localToWorld(clickWorld.copy(fps.foot))
  } else {
    bag.rock.localToWorld(clickWorld.set(...scar.localPoint).normalize().multiplyScalar(1.03))
  }

  spawnImprintCascade(fx, {
    rock: bag.rock,
    scar,
    clickWorld,
  })
}

function advanceSurfaceGuideAfterClose(bag: SceneBag, body: SystemBody | null) {
  const guide = bag.surfaceGuide
  if (!guide) return
  if (guide.pendingKey) {
    guide.viewed.add(guide.pendingKey)
    guide.pendingKey = null
  }
  // Seat the player near the next unviewed mark so WASD can finish the approach.
  const next = currentGuideScar(bag, body)
  if (next && bag.surfaceView) {
    setSurfaceCamera(bag, new THREE.Vector3(...next.localPoint))
  }
}

function pickSurfaceMemoryFromClient(
  bag: SceneBag,
  body: SystemBody | null,
  clientX: number,
  clientY: number,
): SurfaceMemoryInfo | null {
  const fps = bag.surfaceFps
  if (!body || !fps || body.planet.scars.length === 0) return null
  const canvas = bag.renderer.domElement
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
  fps.pickRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), bag.camera)
  const hits = fps.pickRaycaster.intersectObject(bag.rock, false)
  if (hits.length === 0) {
    // Standing on a mark: still allow a click when the ray grazes past the mesh.
    return pickScarMemoryAt(body.planet.scars, fps.foot)
  }
  const local = bag.rock.worldToLocal(hits[0]!.point.clone())
  const fromHit = pickScarMemoryAt(body.planet.scars, local)
  if (fromHit) return fromHit
  // Near-foot clicks while standing on a vein / band.
  if (local.distanceTo(fps.foot) < 0.28) {
    return pickScarMemoryAt(body.planet.scars, fps.foot)
  }
  return null
}

function applyCameraRig(bag: SceneBag) {
  if (bag.orbitSystem) setOrbitCamera(bag, true)
  else if (bag.interiorView) setInteriorCamera(bag)
  else if (bag.surfaceView) setSurfaceCamera(bag)
  else setOrbitCamera(bag, false)
}

const FossilCanvas = forwardRef<FossilCanvasHandle, FossilCanvasProps>(function FossilCanvas(
  {
    params,
    lighting,
    atmosphere,
    revision,
    wireframe,
    showMapping,
    viewportMode,
    orbitSystem,
    interiorView,
    surfaceView,
    systemBodies,
    surfaceBody,
    historyEntries,
    orbitSettings = DEFAULT_ORBIT_SYSTEM,
    onSeedChange,
    onBodiesCollide,
    onSurfaceMemoryPick,
    collideSelectMoverId = null,
    approachPair = null,
    onPickCollideTarget,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bagRef = useRef<SceneBag | null>(null)
  const paramsRef = useRef(params)
  const lightingRef = useRef(lighting)
  const atmosphereRef = useRef(atmosphere)
  const showMappingRef = useRef(showMapping)
  const viewportModeRef = useRef(viewportMode)
  const orbitSystemRef = useRef(orbitSystem)
  const interiorViewRef = useRef(interiorView)
  const surfaceViewRef = useRef(surfaceView)
  const systemBodiesRef = useRef(systemBodies)
  const surfaceBodyRef = useRef(surfaceBody)
  const historyRef = useRef(historyEntries)
  const orbitSettingsRef = useRef(orbitSettings)
  const wireframeRef = useRef(wireframe)
  const onSeedChangeRef = useRef(onSeedChange)
  const onBodiesCollideRef = useRef(onBodiesCollide)
  const onSurfaceMemoryPickRef = useRef(onSurfaceMemoryPick)
  const collideSelectMoverIdRef = useRef(collideSelectMoverId)
  const approachPairRef = useRef(approachPair)
  const onPickCollideTargetRef = useRef(onPickCollideTarget)
  const orbitPickRaycaster = useRef(new THREE.Raycaster())
  const orbitPickNdc = useRef(new THREE.Vector2())

  useEffect(() => {
    paramsRef.current = params
  }, [params])
  useEffect(() => {
    lightingRef.current = lighting
    const bag = bagRef.current
    if (bag) applyLighting(bag, lighting)
  }, [lighting])
  useEffect(() => {
    const prev = atmosphereRef.current
    atmosphereRef.current = atmosphere
    const bag = bagRef.current
    if (!bag) return
    applyAtmosphereState(bag, atmosphere, wireframeRef.current)
    if (bag.orbitSystem) {
      setSolarAtmosphereState(bag.solar, atmosphere.visible, wireframeRef.current)
      return
    }
    const countChanged = prev.amount !== atmosphere.amount || prev.height !== atmosphere.height
    if (countChanged || !bag.atmosphere) {
      rebuildStudioAtmosphere(bag, bag.seed, atmosphere, wireframeRef.current)
    } else if (bag.atmosphere) {
      applyAtmosphereLook(bag.atmosphere, atmosphere)
    }
  }, [atmosphere])
  useEffect(() => {
    showMappingRef.current = showMapping
  }, [showMapping])
  useEffect(() => {
    viewportModeRef.current = viewportMode
    const bag = bagRef.current
    if (bag) applyViewportMode(bag, viewportMode)
  }, [viewportMode])
  useEffect(() => {
    onSeedChangeRef.current = onSeedChange
  }, [onSeedChange])
  useEffect(() => {
    onBodiesCollideRef.current = onBodiesCollide
  }, [onBodiesCollide])
  useEffect(() => {
    onSurfaceMemoryPickRef.current = onSurfaceMemoryPick
  }, [onSurfaceMemoryPick])
  useEffect(() => {
    collideSelectMoverIdRef.current = collideSelectMoverId
    const bag = bagRef.current
    if (!bag) return
    bag.renderer.domElement.style.cursor = collideSelectMoverId ? 'crosshair' : ''
  }, [collideSelectMoverId])
  useEffect(() => {
    approachPairRef.current = approachPair
  }, [approachPair])
  useEffect(() => {
    onPickCollideTargetRef.current = onPickCollideTarget
  }, [onPickCollideTarget])
  useEffect(() => {
    historyRef.current = historyEntries
  }, [historyEntries])
  useEffect(() => {
    systemBodiesRef.current = systemBodies
  }, [systemBodies])
  useEffect(() => {
    surfaceBodyRef.current = surfaceBody
  }, [surfaceBody])
  useEffect(() => {
    orbitSettingsRef.current = orbitSettings
  }, [orbitSettings])
  useEffect(() => {
    wireframeRef.current = wireframe
  }, [wireframe])

  useImperativeHandle(ref, () => ({
    resetView: () => {
      const bag = bagRef.current
      if (!bag) return
      if (bag.orbitSystem) {
        setOrbitCamera(bag, true)
        return
      }
      if (bag.interiorView) {
        setInteriorCamera(bag)
        return
      }
      if (bag.surfaceView) {
        setSurfaceCamera(bag)
        return
      }
      // Studio rock: upright mesh + home camera (clear orbit damping so it sticks).
      bag.rock.rotation.set(0, 0, 0)
      applyStudioLens(bag)
      snapOrbitControls(bag, HOME.position, HOME.target, { min: 1.2, max: 12 })
    },
    captureThumbnail: () => {
      const bag = bagRef.current
      if (!bag) return null
      // Prefer solo rock for library thumbs even if orbit is visible
      const wasOrbit = bag.orbitSystem
      const solarVisible = bag.solar?.root.visible ?? false
      const atmoWas = bag.atmosphere?.points.visible ?? false
      if (bag.atmosphere) bag.atmosphere.points.visible = false
      if (wasOrbit && bag.solar) {
        bag.solar.root.visible = false
        bag.rock.visible = true
      }
      bag.controls.update()
      bag.renderer.render(bag.scene, bag.camera)
      let data: string | null = null
      try {
        data = bag.renderer.domElement.toDataURL('image/jpeg', 0.72)
      } catch {
        data = null
      }
      if (bag.atmosphere) bag.atmosphere.points.visible = atmoWas
      if (wasOrbit && bag.solar) {
        bag.solar.root.visible = solarVisible
        bag.rock.visible = false
      }
      return data
    },
    exportSTL: (filename = 'data-fossil.stl') => {
      const bag = bagRef.current
      if (!bag) return
      const exporter = new STLExporter()
      const result = exporter.parse(bag.rock, { binary: true })
      const blob =
        result instanceof DataView
          ? new Blob([result], { type: 'application/octet-stream' })
          : new Blob([result], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    getSolarPhases: () => captureSolarPhases(bagRef.current?.solar ?? null),
    cancelAccretion: () => {
      const bag = bagRef.current
      if (!bag?.accretion) return
      disposeAccretionAnim(bag.accretion)
      bag.accretion = null
      bag.collisionLockUntil = performance.now() + 400
    },
    notifySurfaceMemoryClosed: () => {
      const bag = bagRef.current
      if (!bag) return
      advanceSurfaceGuideAfterClose(bag, surfaceBodyRef.current)
      updateSurfaceGuideArrow(bag, surfaceBodyRef.current)
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe4e2de)

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.copy(HOME.position)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE
    renderer.autoClear = false
    container.appendChild(renderer.domElement)

    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(container.clientWidth, container.clientHeight)
    labelRenderer.domElement.className = 'fossil-label-layer'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(HOME.target)
    controls.minDistance = 1.2
    controls.maxDistance = 12

    const k0 = lightingRef.current.key
    const ambient = new THREE.AmbientLight(0xd4d1cb, k0 * 0.82)
    const hemi = new THREE.HemisphereLight(0xe8e4de, 0xa8a49c, k0 * 0.58)
    const key = new THREE.DirectionalLight(0xf0ece6, k0 * 0.32)
    key.position.set(2.8, 4.2, 3)
    const fill = new THREE.DirectionalLight(0xc8c5bf, k0 * 0.16)
    fill.position.set(-3.2, 1.6, 2.4)
    const rim = new THREE.DirectionalLight(0xcfcbc4, k0 * 0.05)
    rim.position.set(-1.6, 2.8, -3.4)
    const interiorLight = new THREE.PointLight(0xf2eee8, 0, 4.2, 1.35)
    scene.add(ambient, hemi, key, fill, rim, interiorLight)

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      emissive: 0x000000,
      emissiveIntensity: 0,
      flatShading: false,
    })
    enableStoneNoiseMaterial(material)

    const rock = new THREE.Mesh(new THREE.BufferGeometry(), material)
    scene.add(rock)

    const mappingGroup = new THREE.Group()
    mappingGroup.visible = false
    scene.add(mappingGroup)

    const worldGroup = new THREE.Group()
    buildWorldHelpers(worldGroup)
    worldGroup.visible = viewportModeRef.current === 'edit'
    scene.add(worldGroup)

    const axesScene = new THREE.Scene()
    const axesCam = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 10)
    axesCam.position.set(0, 0, 4)
    const cornerAxes = new THREE.AxesHelper(1)
    axesScene.add(cornerAxes)

    const bag: SceneBag = {
      renderer,
      labelRenderer,
      scene,
      camera,
      controls,
      rock,
      material,
      mappingGroup,
      worldGroup,
      axesCorner: { scene: axesScene, camera: axesCam, axes: cornerAxes },
      ambient,
      hemi,
      key,
      fill,
      rim,
      interiorLight,
      viewportMode: viewportModeRef.current,
      orbitSystem: false,
      interiorView: false,
      surfaceView: false,
      surfaceFps: null,
      solar: null,
      solarMeshKey: '',
      atmosphere: null,
      atmosphereOn: false,
      atmospherePlaying: false,
      seed: 0,
      clock: new THREE.Clock(),
      collisionLockUntil: 0,
      surfaceBodyId: null,
      surfaceGuide: null,
      accretion: null,
      fx: null,
      _fxFoot: new THREE.Vector3(),
      _fxClick: new THREE.Vector3(),
    }
    bag.fx = createFxParticleSystem()
    bag.scene.add(bag.fx.root)
    bagRef.current = bag
    applyLighting(bag, lightingRef.current)
    applyAtmosphereState(bag, atmosphereRef.current, wireframeRef.current)
    applyViewportMode(bag, viewportModeRef.current)

    const applyStoneAppearance = (
      seed: number,
      p: FossilParams,
      radiusMin: number,
      radiusMax: number,
    ) => {
      applyStoneNoiseParams(bag.material, {
        colors: p.stoneColors,
        colorAlts: p.colorAlts,
        seed,
        normalStrength: p.normalStrength,
        noiseScale: 2.4,
        heightBlend: p.heightBlend,
        radiusMin,
        radiusMax,
      })
    }

    const rebuild = () => {
      // Surface / Interior of a system body uses that planet's formed mesh + scars.
      const focus =
        bag.surfaceView || bag.interiorView ? surfaceBodyRef.current : null
      if (focus) {
        const built = buildFormedPlanetGeometry(focus.planet)
        const prev = bag.rock.geometry
        bag.rock.geometry = built.geometry
        prev.dispose()
        applyStoneNoiseParams(bag.material, {
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
        bag.seed = built.seed
        bag.surfaceBodyId = focus.id
        disposeStudioAtmosphere(bag)
        bag.mappingGroup.visible = false
        if (bag.surfaceView) {
          const latest = focus.planet.scars[focus.planet.scars.length - 1]
          const seek = latest
            ? new THREE.Vector3(...latest.localPoint)
            : null
          setSurfaceCamera(bag, seek)
        }
        return
      }

      bag.surfaceBodyId = null
      const p = paramsRef.current
      const prev = bag.rock.geometry
      const { geometry, seed, regions, radiusMin, radiusMax } = buildFossilGeometry(p)
      bag.rock.geometry = geometry
      prev.dispose()
      applyStoneAppearance(seed, p, radiusMin, radiusMax)
      onSeedChangeRef.current(seed)
      bag.seed = seed
      rebuildStudioAtmosphere(bag, seed, atmosphereRef.current, wireframeRef.current)

      clearMapping(bag.mappingGroup)
      if (showMappingRef.current && !bag.orbitSystem && !isLookAroundView(bag)) {
        const radiusHint = p.baseRadius + p.noiseStrength * 0.5 + p.digitStrength * 0.5
        buildMappingMarkers(regions, bag.mappingGroup, radiusHint)
        bag.mappingGroup.visible = true
      } else {
        bag.mappingGroup.visible = false
      }
      if (bag.surfaceView) setSurfaceCamera(bag)
    }

    const rebuildSolar = () => {
      if (bag.accretion) {
        disposeAccretionAnim(bag.accretion)
        bag.accretion = null
      }
      const phases = captureSolarPhases(bag.solar)
      clearSolar(bag)
      bag.solarMeshKey = ''
      if (!bag.orbitSystem) return
      const bodies = systemBodiesRef.current.map((body) =>
        typeof phases[body.id] === 'number' ? { ...body, phase: phases[body.id]! } : body,
      )
      const solar = createSolarSystem(bodies, orbitSettingsRef.current)
      applySolarPhases(solar, phases)
      bag.solar = solar
      bag.solarMeshKey = systemMeshKey(bodies)
      bag.scene.add(solar.root)
      setSolarSystemWireframe(solar, wireframeRef.current)
      setSolarAtmosphereState(solar, atmosphereRef.current.visible, wireframeRef.current)
      bag.collisionLockUntil = performance.now() + 700
    }

    const applyOrbitSystem = (on: boolean) => {
      bag.orbitSystem = on
      if (on) {
        bag.interiorView = false
        bag.surfaceView = false
        leaveSurfaceCamera(bag)
        bag.material.side = THREE.FrontSide
        bag.material.needsUpdate = true
        bag.rock.visible = false
        bag.mappingGroup.visible = false
        bag.worldGroup.visible = false
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        rebuildSolar()
        applyCameraRig(bag)
      } else {
        if (bag.accretion) {
          disposeAccretionAnim(bag.accretion)
          bag.accretion = null
        }
        if (bag.fx) {
          clearFxParticles(
            bag.fx,
            (i) =>
              bag.fx!.kind[i] === FX_KIND.RETURN ||
              bag.fx!.kind[i] === FX_KIND.SCATTER ||
              bag.fx!.kind[i] === FX_KIND.TRAIL,
          )
        }
        clearSolar(bag)
        bag.rock.visible = true
        bag.worldGroup.visible =
          bag.viewportMode === 'edit' && !bag.interiorView && !bag.surfaceView
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        applyCameraRig(bag)
        if (showMappingRef.current && !isLookAroundView(bag)) rebuild()
      }
    }

    const applyInteriorView = (on: boolean) => {
      bag.interiorView = on
      if (on) {
        bag.surfaceView = false
        leaveSurfaceCamera(bag)
      }
      bag.material.side = on ? THREE.BackSide : THREE.FrontSide
      bag.material.needsUpdate = true
      if (on) {
        bag.rock.visible = true
        bag.mappingGroup.visible = false
        bag.worldGroup.visible = false
        rebuild()
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        applyCameraRig(bag)
      } else {
        bag.worldGroup.visible =
          bag.viewportMode === 'edit' && !bag.orbitSystem && !bag.surfaceView
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        if (!bag.orbitSystem) applyCameraRig(bag)
        if (showMappingRef.current && !bag.orbitSystem && !bag.surfaceView) rebuild()
        else if (!bag.orbitSystem && !bag.surfaceView && !surfaceBodyRef.current) rebuild()
      }
    }

    const applySurfaceView = (on: boolean) => {
      bag.surfaceView = on
      if (on) {
        bag.interiorView = false
        bag.material.side = THREE.FrontSide
        bag.material.needsUpdate = true
        bag.rock.visible = true
        bag.mappingGroup.visible = false
        bag.worldGroup.visible = false
        ensureSurfaceGuide(bag, container)
        resetSurfaceGuide(bag)
        rebuild()
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        applyCameraRig(bag)
        updateSurfaceGuideArrow(bag, surfaceBodyRef.current)
      } else {
        leaveSurfaceCamera(bag)
        bag.worldGroup.visible =
          bag.viewportMode === 'edit' && !bag.orbitSystem && !bag.interiorView
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        if (!bag.orbitSystem) applyCameraRig(bag)
        if (showMappingRef.current && !bag.orbitSystem && !bag.interiorView) rebuild()
        else if (!bag.orbitSystem && !surfaceBodyRef.current) rebuild()
      }
    }

    rebuild()
    if (orbitSystemRef.current) applyOrbitSystem(true)
    else if (interiorViewRef.current) applyInteriorView(true)
    else if (surfaceViewRef.current) applySurfaceView(true)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const dt = bag.clock.getDelta()

      if (bag.orbitSystem && bag.solar) {
        if (bag.accretion) {
          const done = tickAccretionAnim(
            bag.accretion,
            bag.solar,
            dt,
            orbitSettingsRef.current.playing,
            bag.fx,
          )
          if (done) {
            const collision = bag.accretion.collision
            disposeAccretionAnim(bag.accretion)
            bag.accretion = null
            bag.collisionLockUntil = performance.now() + 900
            const phases = captureSolarPhases(bag.solar)
            systemBodiesRef.current = systemBodiesRef.current.map((body) =>
              typeof phases[body.id] === 'number' ? { ...body, phase: phases[body.id]! } : body,
            )
            onBodiesCollideRef.current(collision)
          }
        } else {
          const collision = tickSolarSystem(
            bag.solar,
            dt,
            orbitSettingsRef.current.playing,
            bag.atmospherePlaying,
            systemBodiesRef.current,
            historyRef.current,
          )
          if (collision && performance.now() >= bag.collisionLockUntil) {
            const survivorBody = systemBodiesRef.current.find((b) => b.id === collision.survivorId)
            const absorbedBody = systemBodiesRef.current.find((b) => b.id === collision.absorbedId)
            const survivorPlanet = bag.solar.planets.find((p) => p.id === collision.survivorId)
            const absorbedPlanet = bag.solar.planets.find((p) => p.id === collision.absorbedId)
            if (survivorBody && absorbedBody && survivorPlanet && absorbedPlanet) {
              // Freeze React list until the visible merge finishes.
              bag.collisionLockUntil = Number.POSITIVE_INFINITY
              bag.accretion = startAccretionAnim(
                bag.solar,
                survivorPlanet,
                absorbedPlanet,
                collision,
                survivorBody,
                absorbedBody,
                bag.fx,
              )
            }
          }
        }
      } else {
        if (bag.viewportMode === 'view' && !isLookAroundView(bag)) {
          bag.rock.rotation.y += dt * VIEW_SPIN_RAD_PER_SEC
        }
        if (bag.interiorView) {
          bag.interiorLight.position.copy(bag.camera.position)
        }
        if (bag.surfaceView) {
          stepSurfaceFps(bag, dt)
          updateSurfaceGuideArrow(bag, surfaceBodyRef.current)
          updateSurfaceDustFx(bag, surfaceBodyRef.current)
        }
        if (bag.atmosphere && bag.atmosphereOn && bag.atmospherePlaying) {
          stepAtmosphere(bag.atmosphere, dt, bag.rock.geometry)
        }
      }

      if (bag.fx) {
        if (bag.surfaceView) bag.rock.getWorldPosition(bag.fx.anchor)
        stepFxParticles(bag.fx, dt)
      }

      if (!bag.surfaceView) bag.controls.update()

      bag.renderer.clear()
      bag.renderer.render(bag.scene, bag.camera)
      bag.labelRenderer.render(bag.scene, bag.camera)

      if (bag.viewportMode === 'edit' && !bag.orbitSystem && !isLookAroundView(bag)) {
        const w = container.clientWidth
        const h = container.clientHeight
        const size = Math.min(88, Math.floor(Math.min(w, h) * 0.16))
        const margin = 14
        const topChrome = 52
        const vx = w - size - margin
        const vy = h - size - margin - topChrome
        bag.axesCorner.camera.position
          .copy(bag.camera.position)
          .sub(bag.controls.target)
          .normalize()
          .multiplyScalar(4)
        bag.axesCorner.camera.lookAt(0, 0, 0)
        bag.renderer.clearDepth()
        bag.renderer.setViewport(vx, vy, size, size)
        bag.renderer.setScissor(vx, vy, size, size)
        bag.renderer.setScissorTest(true)
        bag.renderer.render(bag.axesCorner.scene, bag.axesCorner.camera)
        bag.renderer.setScissorTest(false)
        bag.renderer.setViewport(0, 0, w, h)
      }
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      bag.camera.aspect = w / h
      bag.camera.updateProjectionMatrix()
      bag.renderer.setSize(w, h)
      bag.labelRenderer.setSize(w, h)
    })
    ro.observe(container)

    const bagApi = bag as SceneBag & {
      rebuild: () => void
      rebuildSolar: () => void
      applyOrbitSystem: (on: boolean) => void
      applyInteriorView: (on: boolean) => void
      applySurfaceView: (on: boolean) => void
    }
    bagApi.rebuild = rebuild
    bagApi.rebuildSolar = rebuildSolar
    bagApi.applyOrbitSystem = applyOrbitSystem
    bagApi.applyInteriorView = applyInteriorView
    bagApi.applySurfaceView = applySurfaceView

    const canvasEl = bag.renderer.domElement
    const onKeyDown = (e: KeyboardEvent) => {
      if (!bag.surfaceView || !bag.surfaceFps) return
      if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'KeyQ' || e.code === 'KeyZ') {
        bag.surfaceFps.keys.add(e.code)
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      bag.surfaceFps?.keys.delete(e.code)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!bag.surfaceView || !bag.surfaceFps || e.button !== 0) return
      bag.surfaceFps.dragging = true
      bag.surfaceFps.dragMoved = false
      bag.surfaceFps.downX = e.clientX
      bag.surfaceFps.downY = e.clientY
      bag.surfaceFps.lastX = e.clientX
      bag.surfaceFps.lastY = e.clientY
      canvasEl.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      const fps = bag.surfaceFps
      if (!bag.surfaceView || !fps) return
      if (fps.dragging) {
        const totalDx = e.clientX - fps.downX
        const totalDy = e.clientY - fps.downY
        if (Math.hypot(totalDx, totalDy) > SURFACE_CLICK_SLOP) fps.dragMoved = true
        const dx = e.clientX - fps.lastX
        const dy = e.clientY - fps.lastY
        fps.lastX = e.clientX
        fps.lastY = e.clientY
        fps.yaw -= dx * SURFACE_LOOK_SENS
        fps.pitch = Math.min(
          SURFACE_PITCH_MAX,
          Math.max(SURFACE_PITCH_MIN, fps.pitch - dy * SURFACE_LOOK_SENS),
        )
        applySurfacePose(bag)
        return
      }
      const memory = pickSurfaceMemoryFromClient(bag, surfaceBodyRef.current, e.clientX, e.clientY)
      const hovering = memory !== null
      if (hovering !== fps.hoverMemory) {
        fps.hoverMemory = hovering
        canvasEl.style.cursor = hovering ? 'pointer' : ''
      }
    }
    const finishSurfaceClick = (clientX: number, clientY: number) => {
      const memory = pickSurfaceMemoryFromClient(bag, surfaceBodyRef.current, clientX, clientY)
      noteSurfaceMemoryOpened(bag, memory)
      if (memory && bag.fx && bag.surfaceView) {
        triggerImprintCascadeFx(bag, surfaceBodyRef.current, memory, clientX, clientY)
      }
      onSurfaceMemoryPickRef.current?.(memory)
    }
    const onPointerUp = (e: PointerEvent) => {
      const fps = bag.surfaceFps
      if (!fps) return
      // Treat as a click unless the look-drag clearly moved (ignore button quirks on synthetic events).
      const wasClick = bag.surfaceView && fps.dragging && !fps.dragMoved
      fps.dragging = false
      try {
        canvasEl.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (wasClick) finishSurfaceClick(e.clientX, e.clientY)
    }
    const onClick = (e: MouseEvent) => {
      // Fallback for environments that collapse pointer sequences oddly.
      if (!bag.surfaceView || !bag.surfaceFps || bag.surfaceFps.dragMoved) return
      finishSurfaceClick(e.clientX, e.clientY)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    canvasEl.addEventListener('pointerdown', onPointerDown)
    canvasEl.addEventListener('pointermove', onPointerMove)
    canvasEl.addEventListener('pointerup', onPointerUp)
    canvasEl.addEventListener('pointercancel', onPointerUp)
    canvasEl.addEventListener('click', onClick)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvasEl.removeEventListener('pointerdown', onPointerDown)
      canvasEl.removeEventListener('pointermove', onPointerMove)
      canvasEl.removeEventListener('pointerup', onPointerUp)
      canvasEl.removeEventListener('pointercancel', onPointerUp)
      canvasEl.removeEventListener('click', onClick)
      bag.controls.dispose()
      disposeMappingShared(bag.mappingGroup)
      clearMapping(bag.mappingGroup)
      if (bag.accretion) {
        disposeAccretionAnim(bag.accretion)
        bag.accretion = null
      }
      disposeFxParticleSystem(bag.fx)
      bag.fx = null
      clearSolar(bag)
      disposeStudioAtmosphere(bag)
      while (bag.worldGroup.children.length > 0) {
        const child = bag.worldGroup.children[0]!
        bag.worldGroup.remove(child)
        child.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (mesh.geometry) mesh.geometry.dispose()
          const mat = mesh.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else if (mat) mat.dispose()
          const css = obj as CSS2DObject
          if (css.element?.parentNode) css.element.parentNode.removeChild(css.element)
        })
      }
      bag.axesCorner.axes.geometry.dispose()
      const axesMat = bag.axesCorner.axes.material
      if (Array.isArray(axesMat)) axesMat.forEach((m) => m.dispose())
      else axesMat.dispose()
      bag.rock.geometry.dispose()
      bag.material.dispose()
      if (bag.surfaceGuide?.el.parentNode) {
        bag.surfaceGuide.el.parentNode.removeChild(bag.surfaceGuide.el)
      }
      bag.surfaceGuide = null
      bag.renderer.dispose()
      if (bag.renderer.domElement.parentNode) {
        bag.renderer.domElement.parentNode.removeChild(bag.renderer.domElement)
      }
      if (bag.labelRenderer.domElement.parentNode) {
        bag.labelRenderer.domElement.parentNode.removeChild(bag.labelRenderer.domElement)
      }
      bagRef.current = null
    }
  }, [])

  useEffect(() => {
    const bag = bagRef.current as (SceneBag & { rebuild?: () => void }) | null
    if (!bag?.orbitSystem) bag?.rebuild?.()
  }, [revision])

  useEffect(() => {
    const bag = bagRef.current
    if (!bag) return
    bag.material.wireframe = wireframe
    setSolarSystemWireframe(bag.solar, wireframe)
    syncAtmosphere(bag, wireframe)
    if (bag.orbitSystem) {
      setSolarAtmosphereState(bag.solar, atmosphereRef.current.visible, wireframe)
    }
  }, [wireframe])

  useEffect(() => {
    const bag = bagRef.current as (SceneBag & { rebuild?: () => void }) | null
    if (!bag?.orbitSystem) bag?.rebuild?.()
  }, [showMapping])

  useEffect(() => {
    orbitSystemRef.current = orbitSystem
    const bag = bagRef.current as (SceneBag & { applyOrbitSystem?: (on: boolean) => void }) | null
    bag?.applyOrbitSystem?.(orbitSystem)
  }, [orbitSystem])

  useEffect(() => {
    interiorViewRef.current = interiorView
    const bag = bagRef.current as (SceneBag & { applyInteriorView?: (on: boolean) => void }) | null
    bag?.applyInteriorView?.(interiorView)
  }, [interiorView])

  useEffect(() => {
    surfaceViewRef.current = surfaceView
    const bag = bagRef.current as (SceneBag & { applySurfaceView?: (on: boolean) => void }) | null
    bag?.applySurfaceView?.(surfaceView)
  }, [surfaceView])

  useEffect(() => {
    const bag = bagRef.current as (SceneBag & { rebuildSolar?: () => void }) | null
    if (!bag?.orbitSystem) return
    const nextKey = systemMeshKey(systemBodies)
    if (bag.solarMeshKey !== nextKey || !bag.solar) {
      bag.rebuildSolar?.()
      return
    }
    syncSolarOrbits(bag.solar, systemBodies, orbitSettings)
  }, [systemBodies, orbitSettings])

  useEffect(() => {
    const bag = bagRef.current
    if (!bag?.orbitSystem || !bag.solar) return
    syncPlanetLabelHints(
      bag.solar,
      {
        pickMoverId: collideSelectMoverId,
        approach: approachPair,
      },
      (targetId) => onPickCollideTargetRef.current?.(targetId),
    )
  }, [collideSelectMoverId, approachPair, systemBodies, orbitSystem])

  useEffect(() => {
    const bag = bagRef.current
    if (!bag || !orbitSystem) return
    const canvasEl = bag.renderer.domElement
    let downX = 0
    let downY = 0
    let moved = false

    const planetFromObject = (obj: THREE.Object3D) => {
      if (!bag.solar) return undefined
      let cur: THREE.Object3D | null = obj
      while (cur) {
        const match = bag.solar.planets.find((p) => p.mesh === cur || p.holder === cur)
        if (match) return match
        cur = cur.parent
      }
      return undefined
    }

    const onDown = (e: PointerEvent) => {
      if (!collideSelectMoverIdRef.current || e.button !== 0) return
      downX = e.clientX
      downY = e.clientY
      moved = false
    }
    const onMove = (e: PointerEvent) => {
      if (!collideSelectMoverIdRef.current) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) moved = true
    }
    const onUp = (e: PointerEvent) => {
      const moverId = collideSelectMoverIdRef.current
      if (!moverId || moved || e.button !== 0 || !bag.solar) return
      const rect = canvasEl.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      orbitPickNdc.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      orbitPickRaycaster.current.setFromCamera(orbitPickNdc.current, bag.camera)
      const roots = bag.solar.planets.map((p) => p.holder)
      const hits = orbitPickRaycaster.current.intersectObjects(roots, true)
      if (hits.length === 0) return
      const planet = planetFromObject(hits[0]!.object)
      if (!planet || planet.id === moverId) return
      onPickCollideTargetRef.current?.(planet.id)
    }

    canvasEl.addEventListener('pointerdown', onDown)
    canvasEl.addEventListener('pointermove', onMove)
    canvasEl.addEventListener('pointerup', onUp)
    return () => {
      canvasEl.removeEventListener('pointerdown', onDown)
      canvasEl.removeEventListener('pointermove', onMove)
      canvasEl.removeEventListener('pointerup', onUp)
    }
  }, [orbitSystem])

  useEffect(() => {
    const bag = bagRef.current as (SceneBag & { rebuild?: () => void }) | null
    if (!bag || bag.orbitSystem) return
    if (bag.surfaceView || bag.interiorView) {
      if (bag.surfaceView) resetSurfaceGuide(bag)
      bag.rebuild?.()
      if (bag.surfaceView) updateSurfaceGuideArrow(bag, surfaceBody)
    }
  }, [surfaceBody, surfaceView, interiorView])

  return <div className="fossil-canvas" ref={containerRef} aria-label="Data Fossil viewport" />
})

export default FossilCanvas
