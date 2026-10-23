import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { buildFossilGeometry } from '../lib/buildFossilGeometry'
import type { FossilHistoryEntry } from '../lib/history'
import {
  DEFAULT_ORBIT_SYSTEM,
  planetMeshSignature,
  type OrbitSystemSettings,
} from '../lib/orbit'
import {
  createSolarSystem,
  disposeSolarSystem,
  ORBIT_HOME,
  setSolarAtmosphereState,
  setSolarSystemWireframe,
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
  historyEntries: FossilHistoryEntry[]
  orbitSettings?: OrbitSystemSettings
  onSeedChange: (seed: number) => void
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
  solar: SolarSystem | null
  solarMeshKey: string
  atmosphere: AtmosphereSystem | null
  atmosphereOn: boolean
  atmospherePlaying: boolean
  seed: number
  clock: THREE.Clock
}

const HOME = {
  position: new THREE.Vector3(2.55, 1.35, 2.95),
  target: new THREE.Vector3(0, 0, 0),
}

const INTERIOR_HOME = {
  position: new THREE.Vector3(0, 0, 0.08),
  target: new THREE.Vector3(0, 0, 0),
}

const STUDIO_FOV = 40
const INTERIOR_FOV = 80
const VIEW_SPIN_RAD_PER_SEC = 0.35

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
      bag.atmosphereOn && !bag.orbitSystem && !bag.interiorView && !wireframe
  }
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
  bag.worldGroup.visible = mode === 'edit' && !bag.orbitSystem && !bag.interiorView
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

function setOrbitCamera(bag: SceneBag, on: boolean) {
  applyStudioLens(bag)
  if (on) {
    bag.camera.position.copy(ORBIT_HOME.position)
    bag.controls.target.copy(ORBIT_HOME.target)
    bag.controls.minDistance = 3
    bag.controls.maxDistance = 48
  } else {
    bag.camera.position.copy(HOME.position)
    bag.controls.target.copy(HOME.target)
    bag.controls.minDistance = 1.2
    bag.controls.maxDistance = 12
  }
  bag.controls.update()
}

function setInteriorCamera(bag: SceneBag) {
  bag.rock.rotation.set(0, 0, 0)
  bag.camera.fov = INTERIOR_FOV
  bag.camera.near = 0.02
  bag.camera.position.copy(INTERIOR_HOME.position)
  bag.controls.target.copy(INTERIOR_HOME.target)
  bag.controls.minDistance = 0.001
  bag.controls.maxDistance = 0.15
  bag.controls.enablePan = false
  bag.camera.updateProjectionMatrix()
  bag.controls.update()
}

function applyCameraRig(bag: SceneBag) {
  if (bag.orbitSystem) setOrbitCamera(bag, true)
  else if (bag.interiorView) setInteriorCamera(bag)
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
    historyEntries,
    orbitSettings = DEFAULT_ORBIT_SYSTEM,
    onSeedChange,
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
  const historyRef = useRef(historyEntries)
  const orbitSettingsRef = useRef(orbitSettings)
  const wireframeRef = useRef(wireframe)
  const onSeedChangeRef = useRef(onSeedChange)

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
    historyRef.current = historyEntries
  }, [historyEntries])
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
      } else if (bag.interiorView) {
        setInteriorCamera(bag)
      } else {
        bag.camera.position.copy(HOME.position)
        bag.controls.target.copy(HOME.target)
        bag.rock.rotation.set(0, 0, 0)
        bag.controls.update()
      }
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
      solar: null,
      solarMeshKey: '',
      atmosphere: null,
      atmosphereOn: false,
      atmospherePlaying: false,
      seed: 0,
      clock: new THREE.Clock(),
    }
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
      if (showMappingRef.current && !bag.orbitSystem && !bag.interiorView) {
        const radiusHint = p.baseRadius + p.noiseStrength * 0.5 + p.digitStrength * 0.5
        buildMappingMarkers(regions, bag.mappingGroup, radiusHint)
        bag.mappingGroup.visible = true
      } else {
        bag.mappingGroup.visible = false
      }
    }

    const rebuildSolar = () => {
      clearSolar(bag)
      bag.solarMeshKey = ''
      if (!bag.orbitSystem) return
      const entries = historyRef.current
      const solar = createSolarSystem(entries, orbitSettingsRef.current)
      bag.solar = solar
      bag.solarMeshKey = entries.map(planetMeshSignature).join('||')
      bag.scene.add(solar.root)
      setSolarSystemWireframe(solar, wireframeRef.current)
      setSolarAtmosphereState(solar, atmosphereRef.current.visible, wireframeRef.current)
    }

    const applyOrbitSystem = (on: boolean) => {
      bag.orbitSystem = on
      if (on) {
        bag.interiorView = false
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
        clearSolar(bag)
        bag.rock.visible = true
        bag.worldGroup.visible = bag.viewportMode === 'edit' && !bag.interiorView
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        applyCameraRig(bag)
        if (showMappingRef.current && !bag.interiorView) rebuild()
      }
    }

    const applyInteriorView = (on: boolean) => {
      bag.interiorView = on
      bag.material.side = on ? THREE.BackSide : THREE.FrontSide
      bag.material.needsUpdate = true
      if (on) {
        bag.rock.visible = true
        bag.mappingGroup.visible = false
        bag.worldGroup.visible = false
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        applyCameraRig(bag)
      } else {
        bag.worldGroup.visible = bag.viewportMode === 'edit' && !bag.orbitSystem
        syncAtmosphere(bag, wireframeRef.current)
        applyLighting(bag, lightingRef.current)
        if (!bag.orbitSystem) applyCameraRig(bag)
        if (showMappingRef.current && !bag.orbitSystem) rebuild()
      }
    }

    rebuild()
    if (orbitSystemRef.current) applyOrbitSystem(true)
    else if (interiorViewRef.current) applyInteriorView(true)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const dt = bag.clock.getDelta()

      if (bag.orbitSystem && bag.solar) {
        tickSolarSystem(
          bag.solar,
          dt,
          orbitSettingsRef.current.playing,
          bag.atmospherePlaying,
        )
      } else {
        if (bag.viewportMode === 'view' && !bag.interiorView) {
          bag.rock.rotation.y += dt * VIEW_SPIN_RAD_PER_SEC
        }
        if (bag.interiorView) {
          bag.interiorLight.position.copy(bag.camera.position)
        }
        if (bag.atmosphere && bag.atmosphereOn && bag.atmospherePlaying) {
          stepAtmosphere(bag.atmosphere, dt, bag.rock.geometry)
        }
      }

      bag.controls.update()

      bag.renderer.clear()
      bag.renderer.render(bag.scene, bag.camera)
      bag.labelRenderer.render(bag.scene, bag.camera)

      if (bag.viewportMode === 'edit' && !bag.orbitSystem && !bag.interiorView) {
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
    }
    bagApi.rebuild = rebuild
    bagApi.rebuildSolar = rebuildSolar
    bagApi.applyOrbitSystem = applyOrbitSystem
    bagApi.applyInteriorView = applyInteriorView

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      bag.controls.dispose()
      disposeMappingShared(bag.mappingGroup)
      clearMapping(bag.mappingGroup)
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
    const bag = bagRef.current as (SceneBag & { rebuildSolar?: () => void }) | null
    if (!bag?.orbitSystem) return
    const nextKey = historyEntries.map(planetMeshSignature).join('||')
    if (bag.solarMeshKey !== nextKey || !bag.solar) {
      bag.rebuildSolar?.()
      return
    }
    syncSolarOrbits(bag.solar, historyEntries, orbitSettings)
  }, [historyEntries, orbitSettings])

  return <div className="fossil-canvas" ref={containerRef} aria-label="Data Fossil viewport" />
})

export default FossilCanvas
