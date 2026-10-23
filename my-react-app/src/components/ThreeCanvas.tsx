import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DAY_CYCLE_HOURS_PER_SECOND, type EnvironmentParams } from '../lib/environment'
import { createEnvironmentScene } from '../lib/environmentScene'
import { createPlantMaterial, getPlantGeometry } from '../lib/scatter/plantMeshes'
import { scatterLayerInstances } from '../lib/scatter/scatterPlants'
import type { ScatterLayer } from '../lib/scatter/types'
import { createWeatherParticleMaterial } from '../lib/particles/material'
import {
  createWeatherParticleSystem,
  rebuildField,
  stepWeatherParticles,
  writeFieldArrows,
  writeTrailLinePositions,
  type WeatherParticleSystem,
} from '../lib/particles/system'
import {
  DEFAULT_PARTICLE_WEATHER,
  type ParticleWeatherParams,
} from '../lib/particles/types'
import { collectAvoidPaths } from '../lib/spline/influence'
import {
  buildRibbonGeometry,
  createCenterlineMaterial,
  createRibbonMaterial,
  projectControlMarkers,
  projectSplinePath,
} from '../lib/spline/ribbon'
import type { SplinePCGParams } from '../lib/spline/types'
import './ThreeCanvas.css'

/** How often the playing day cycle reports its time back to the UI. */
const TIME_REPORT_MS = 200

export type SceneParams = {
  planeSegments: number
  displacementScale: number
  noiseFieldSize: number
  fog: boolean
}

export type ViewportParams = {
  solid: boolean
  wireframe: boolean
  axes: boolean
  grid: boolean
}

export type CameraView = {
  position: [number, number, number]
  target: [number, number, number]
}

export type ThreeCanvasHandle = {
  resetView: () => void
  getView: () => CameraView | null
  setView: (view: CameraView) => void
}

const HOME_VIEW: CameraView = { position: [0, 6, 8], target: [0, 0, 0] }

type ThreeCanvasProps = {
  sceneParams: SceneParams
  viewport: ViewportParams
  /** Offscreen canvas painted with the color noise map. */
  colorMap: HTMLCanvasElement | null
  /** Raw 0..1 square heightfield; its size is derived from the array length. */
  heightfield: Float32Array | null
  environment: EnvironmentParams
  /** Class 06 plant scatter layers (InstancedMesh on the heightfield). */
  scatterLayers?: ScatterLayer[]
  /** Class 06 PCG splines (Bevy-style convert / count / meander). */
  splinePCG?: SplinePCGParams | null
  /** Class 06 weather particles + vector field. */
  particleWeather?: ParticleWeatherParams
  /** Called (throttled) while the day cycle advances the time. */
  onTimeOfDayChange: (hours: number) => void
  ref?: Ref<ThreeCanvasHandle>
}

type WeatherRuntime = {
  sys: WeatherParticleSystem
  points: THREE.Points
  pointMat: THREE.ShaderMaterial
  trails: THREE.LineSegments
  fieldLines: THREE.LineSegments
  trailBuf: Float32Array
  fieldBuf: Float32Array
  key: string
  fieldKey: string
}

export default function ThreeCanvas({
  sceneParams,
  viewport,
  colorMap,
  heightfield,
  environment,
  scatterLayers = [],
  splinePCG = null,
  particleWeather = DEFAULT_PARTICLE_WEATHER,
  onTimeOfDayChange,
  ref,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const scatterGroupRef = useRef<THREE.Group | null>(null)
  const splineGroupRef = useRef<THREE.Group | null>(null)
  const plantMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const weatherRuntimeRef = useRef<WeatherRuntime | null>(null)
  const particleWeatherRef = useRef(particleWeather)
  const viewportRef = useRef(viewport)

  useEffect(() => {
    particleWeatherRef.current = particleWeather
  }, [particleWeather])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useImperativeHandle(ref, () => {
    const applyView = (view: CameraView) => {
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      camera.position.set(...view.position)
      controls.target.set(...view.target)
      controls.update()
    }
    return {
      resetView: () => applyView(HOME_VIEW),
      setView: applyView,
      getView: () => {
        const camera = cameraRef.current
        const controls = controlsRef.current
        if (!camera || !controls) return null
        return {
          position: camera.position.toArray() as CameraView['position'],
          target: controls.target.toArray() as CameraView['target'],
        }
      },
    }
  }, [])

  // Keep mutable refs so the render loop can read latest values
  // without re-mounting the entire Three.js scene.
  const sceneRef = useRef(sceneParams)
  const colorMapRef = useRef(colorMap)
  const heightfieldRef = useRef(heightfield)

  // Track versions to detect changes inside the animation loop.
  // dispScaleRef is only advanced inside animate after applyHeightfield().
  const dispScaleRef = useRef(sceneParams.displacementScale)
  const fogEnabledRef = useRef(sceneParams.fog)
  const mapVersionRef = useRef(0)

  // Sync refs in effects (not during render) to satisfy lint rules.
  useEffect(() => {
    sceneRef.current = sceneParams
  }, [sceneParams])

  useEffect(() => {
    colorMapRef.current = colorMap
  }, [colorMap])

  useEffect(() => {
    heightfieldRef.current = heightfield
  }, [heightfield])

  const environmentRef = useRef(environment)
  const onTimeRef = useRef(onTimeOfDayChange)
  useEffect(() => {
    environmentRef.current = environment
  }, [environment])
  useEffect(() => {
    onTimeRef.current = onTimeOfDayChange
  }, [onTimeOfDayChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Renderer / scene / camera ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0b0d)

    const fog = new THREE.FogExp2(0x0a0b0d, 0.045)
    if (sceneRef.current.fog) scene.fog = fog

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    )
    camera.position.set(...HOME_VIEW.position)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(...HOME_VIEW.target)
    cameraRef.current = camera
    controlsRef.current = controls

    // ── Lights ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 8, 4)
    scene.add(dir)

    // ── Environment: drives the sun light, ambient, fog, sky, clouds and rain ──
    const environmentScene = createEnvironmentScene(scene, { sun: dir, ambient }, fog)
    let timeOfDay = environmentRef.current.timeOfDay
    let seenTime = timeOfDay
    let reportedTime = timeOfDay
    let lastReport = 0
    let wasPlaying = false
    let lastFrame = performance.now()

    // ── Grid ──
    const grid = new THREE.GridHelper(20, 20, 0x3a3f4b, 0x1e2228)
    grid.position.y = -0.01
    scene.add(grid)

    const axes = new THREE.AxesHelper(6)
    axes.position.y = 0.02
    scene.add(axes)

    // ── Plane mesh ──
    let segments = sceneRef.current.planeSegments
    let geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
    const material = new THREE.MeshStandardMaterial({
      color: 0x3ecf8e,
      metalness: 0.08,
      roughness: 0.6,
      flatShading: true,
      side: THREE.DoubleSide,
      // Pushes the solid surface back so the wireframe overlay doesn't z-fight.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x3ecf8e,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    })
    const wire = new THREE.Mesh(geometry, wireMaterial)
    wire.rotation.x = -Math.PI / 2
    scene.add(wire)

    const scatterGroup = new THREE.Group()
    scatterGroup.name = 'plant-scatter'
    scene.add(scatterGroup)
    scatterGroupRef.current = scatterGroup
    const plantMaterial = createPlantMaterial()
    plantMaterialRef.current = plantMaterial

    const splineGroup = new THREE.Group()
    splineGroup.name = 'spline-overlays'
    scene.add(splineGroup)
    splineGroupRef.current = splineGroup

    // Class 06 A3 — weather particles (soft points + trails + field debug)
    const weatherGroup = new THREE.Group()
    weatherGroup.name = 'weather-particles'
    scene.add(weatherGroup)

    const fieldKeyOf = (params: ParticleWeatherParams, hf: Float32Array | null) =>
      `${params.fieldMode}|${params.windX}|${params.windZ}|${hf ? hf.length : 0}|${mapVersionRef.current}`

    const ensureWeather = (params: ParticleWeatherParams, hf: Float32Array | null) => {
      const key = `${params.count}|${params.trailLength}|${params.phenomenon}`
      const existing = weatherRuntimeRef.current
      if (existing && existing.key === key) {
        const fk = fieldKeyOf(params, hf)
        if (existing.fieldKey !== fk) {
          rebuildField(existing.sys, params, hf)
          existing.fieldKey = fk
        }
        existing.pointMat.uniforms.uSize.value = params.size
        existing.pointMat.uniforms.uColor.value.setRGB(...existing.sys.color)
        return existing
      }
      if (existing) {
        weatherGroup.remove(existing.points, existing.trails, existing.fieldLines)
        existing.points.geometry.dispose()
        existing.trails.geometry.dispose()
        existing.fieldLines.geometry.dispose()
        existing.pointMat.dispose()
        ;(existing.trails.material as THREE.Material).dispose()
        ;(existing.fieldLines.material as THREE.Material).dispose()
      }

      const sys = createWeatherParticleSystem(params, hf)
      const posAttr = new THREE.BufferAttribute(sys.positions, 3)
      posAttr.setUsage(THREE.DynamicDrawUsage)
      const lifeAttr = new THREE.BufferAttribute(sys.life, 1)
      lifeAttr.setUsage(THREE.DynamicDrawUsage)
      const maxLifeAttr = new THREE.BufferAttribute(sys.maxLife, 1)
      maxLifeAttr.setUsage(THREE.DynamicDrawUsage)
      const pGeo = new THREE.BufferGeometry()
      pGeo.setAttribute('position', posAttr)
      pGeo.setAttribute('aLife', lifeAttr)
      pGeo.setAttribute('aMaxLife', maxLifeAttr)
      const pointMat = createWeatherParticleMaterial(params.size, sys.color)
      const points = new THREE.Points(pGeo, pointMat)
      points.frustumCulled = false
      points.visible = false

      const maxTrailVerts = sys.count * (sys.trailLen - 1) * 2
      const trailBuf = new Float32Array(maxTrailVerts * 3)
      const tGeo = new THREE.BufferGeometry()
      const tAttr = new THREE.BufferAttribute(trailBuf, 3)
      tAttr.setUsage(THREE.DynamicDrawUsage)
      tGeo.setAttribute('position', tAttr)
      tGeo.setDrawRange(0, 0)
      const trails = new THREE.LineSegments(
        tGeo,
        new THREE.LineBasicMaterial({
          color: 0x9ab4c8,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      )
      trails.frustumCulled = false
      trails.visible = false

      const fieldBuf = new Float32Array(16 * 16 * 2 * 3)
      const fGeo = new THREE.BufferGeometry()
      const fAttr = new THREE.BufferAttribute(fieldBuf, 3)
      fAttr.setUsage(THREE.DynamicDrawUsage)
      fGeo.setAttribute('position', fAttr)
      fGeo.setDrawRange(0, 0)
      const fieldLines = new THREE.LineSegments(
        fGeo,
        new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.55 }),
      )
      fieldLines.frustumCulled = false
      fieldLines.visible = false

      weatherGroup.add(points, trails, fieldLines)
      const runtime: WeatherRuntime = {
        sys,
        points,
        pointMat,
        trails,
        fieldLines,
        trailBuf,
        fieldBuf,
        key,
        fieldKey: fieldKeyOf(params, hf),
      }
      weatherRuntimeRef.current = runtime
      return runtime
    }

    // Seed once so animate always has a runtime handle
    ensureWeather(particleWeatherRef.current, heightfieldRef.current)

    let colorTexture: THREE.CanvasTexture | null = null
    let currentMapVersion = -1

    const rebuildGeometry = () => {
      const seg = sceneRef.current.planeSegments
      if (seg === segments && geometry) return
      segments = seg

      const old = geometry
      geometry = new THREE.PlaneGeometry(10, 10, segments, segments)
      plane.geometry = geometry
      wire.geometry = geometry
      old.dispose()

      // Re-apply heightfield to new geometry
      applyHeightfield()
    }

    const applyHeightfield = () => {
      const hf = heightfieldRef.current
      const scale = sceneRef.current.displacementScale
      const positions = geometry.attributes.position
      const count = positions.count
      const fieldSize = hf ? Math.round(Math.sqrt(hf.length)) : 0
      const segs = segments + 1

      for (let i = 0; i < count; i++) {
        let height = 0
        if (hf) {
          const col = i % segs
          const row = Math.floor(i / segs)
          const u = col / (segs - 1)
          const v = row / (segs - 1)
          const fx = Math.min(Math.floor(u * fieldSize), fieldSize - 1)
          const fy = Math.min(Math.floor(v * fieldSize), fieldSize - 1)
          height = hf[fy * fieldSize + fx] * scale
        }
        positions.setZ(i, height)
      }

      positions.needsUpdate = true
      geometry.computeVertexNormals()
    }

    const applyColorMap = () => {
      const src = colorMapRef.current
      if (!src) {
        if (colorTexture) {
          material.map = null
          colorTexture.dispose()
          colorTexture = null
          material.color.set(0x3ecf8e)
          material.needsUpdate = true
        }
        return
      }

      if (colorTexture) colorTexture.dispose()
      colorTexture = new THREE.CanvasTexture(src)
      colorTexture.minFilter = THREE.LinearFilter
      colorTexture.magFilter = THREE.LinearFilter
      material.map = colorTexture
      material.color.set(0xffffff)
      material.needsUpdate = true
    }

    // ── Animate ──
    let frameId = 0

    const animate = () => {
      frameId = requestAnimationFrame(animate)

      // Detect param changes and update incrementally.
      if (sceneRef.current.planeSegments !== segments) {
        rebuildGeometry()
      }

      if (sceneRef.current.displacementScale !== dispScaleRef.current) {
        dispScaleRef.current = sceneRef.current.displacementScale
        applyHeightfield()
      }

      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now

      // Time comes from the UI, except while the day cycle plays: then the canvas
      // advances it and reports back. A UI value we didn't report is a user edit.
      const env = environmentRef.current
      if (env.timeOfDay !== seenTime) {
        seenTime = env.timeOfDay
        if (seenTime !== reportedTime) timeOfDay = seenTime
      }
      if (env.dayCycle) timeOfDay = (timeOfDay + dt * DAY_CYCLE_HOURS_PER_SECOND) % 24
      const stopped = wasPlaying && !env.dayCycle
      if ((env.dayCycle && now - lastReport > TIME_REPORT_MS) || stopped) {
        lastReport = now
        reportedTime = timeOfDay
        onTimeRef.current(timeOfDay)
      }
      wasPlaying = env.dayCycle
      // Fog toggle and weather fog are combined by the environment.
      environmentScene.update({ ...env, timeOfDay }, dt, fogEnabledRef.current, camera.position)

      if (mapVersionRef.current !== currentMapVersion) {
        currentMapVersion = mapVersionRef.current
        applyColorMap()
        applyHeightfield()
      }

      const vp = viewportRef.current
      plane.visible = vp.solid
      wire.visible = vp.wireframe
      wireMaterial.opacity = vp.solid ? 0.35 : 0.9
      axes.visible = vp.axes
      grid.visible = vp.grid

      // Class 06 A3 weather particles
      const wp = particleWeatherRef.current
      const weather = ensureWeather(wp, heightfieldRef.current)
      weather.points.visible = wp.enabled
      weather.trails.visible = wp.enabled && wp.showTrails
      weather.fieldLines.visible = wp.enabled && wp.showField
      if (wp.enabled) {
        weather.pointMat.uniforms.uSize.value = wp.size
        weather.pointMat.uniforms.uColor.value.setRGB(...weather.sys.color)
        stepWeatherParticles(
          weather.sys,
          wp,
          heightfieldRef.current,
          sceneRef.current.displacementScale,
          dt,
        )
        const pos = weather.points.geometry.getAttribute('position') as THREE.BufferAttribute
        const life = weather.points.geometry.getAttribute('aLife') as THREE.BufferAttribute
        const maxLife = weather.points.geometry.getAttribute('aMaxLife') as THREE.BufferAttribute
        pos.needsUpdate = true
        life.needsUpdate = true
        maxLife.needsUpdate = true

        if (wp.showTrails) {
          const nVerts = writeTrailLinePositions(weather.sys, weather.trailBuf)
          const tPos = weather.trails.geometry.getAttribute('position') as THREE.BufferAttribute
          tPos.needsUpdate = true
          weather.trails.geometry.setDrawRange(0, nVerts)
          ;(weather.trails.material as THREE.LineBasicMaterial).color.setRGB(...weather.sys.color)
        }
        if (wp.showField) {
          const nVerts = writeFieldArrows(weather.sys.field, 0.15, weather.fieldBuf)
          const fPos = weather.fieldLines.geometry.getAttribute('position') as THREE.BufferAttribute
          fPos.needsUpdate = true
          weather.fieldLines.geometry.setDrawRange(0, nVerts)
        }
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // ── Resize ──
    const handleResize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      controls.dispose()
      cameraRef.current = null
      controlsRef.current = null
      scatterGroupRef.current = null
      splineGroupRef.current = null
      const wr = weatherRuntimeRef.current
      if (wr) {
        wr.points.geometry.dispose()
        wr.trails.geometry.dispose()
        wr.fieldLines.geometry.dispose()
        wr.pointMat.dispose()
        ;(wr.trails.material as THREE.Material).dispose()
        ;(wr.fieldLines.material as THREE.Material).dispose()
        weatherRuntimeRef.current = null
      }
      clearScatterGroup(scatterGroup)
      clearSplineGroup(splineGroup)
      plantMaterial.dispose()
      plantMaterialRef.current = null
      environmentScene.dispose()
      geometry.dispose()
      material.dispose()
      wireMaterial.dispose()
      axes.dispose()
      colorTexture?.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Rebuild plant instances whenever layers, terrain, or spline bans change.
  useEffect(() => {
    const group = scatterGroupRef.current
    const material = plantMaterialRef.current
    if (!group || !material) return

    const avoid = collectAvoidPaths(splinePCG, heightfield, sceneParams.displacementScale)
    clearScatterGroup(group)
    for (const layer of scatterLayers) {
      const batch = scatterLayerInstances(
        layer,
        heightfield,
        sceneParams.displacementScale,
        avoid,
      )
      if (batch.matrices.length === 0) continue
      const geo = getPlantGeometry(batch.plant)
      const mesh = new THREE.InstancedMesh(geo, material, batch.matrices.length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.castShadow = false
      mesh.receiveShadow = false
      for (let i = 0; i < batch.matrices.length; i++) {
        mesh.setMatrixAt(i, batch.matrices[i])
        mesh.setColorAt(i, batch.colors[i])
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
      group.add(mesh)
    }
  }, [scatterLayers, splinePCG, heightfield, sceneParams.displacementScale])

  // Bevy-style splines: ribbon (roads/rivers) or centerline only + control markers.
  useEffect(() => {
    const group = splineGroupRef.current
    if (!group) return
    clearSplineGroup(group)
    if (!splinePCG || !heightfield || heightfield.length < 4) return
    if (splinePCG.paths.length === 0) return

    const mode = splinePCG.convertTo
    const showRibbon = mode === 'roads' || mode === 'river'

    for (const path of splinePCG.paths) {
      if (path.controls.length < 2) continue
      const world = projectSplinePath(path, splinePCG, heightfield, sceneParams.displacementScale)

      if (showRibbon) {
        const geo = buildRibbonGeometry(world, splinePCG.width)
        if (geo) {
          const mesh = new THREE.Mesh(geo, createRibbonMaterial(mode))
          mesh.name = `spline-ribbon-${path.id}`
          mesh.frustumCulled = false
          group.add(mesh)
        }
      }

      // Cyan centerline (always — Bevy screenshots show it on roads & spline-only)
      const linePts = world.map((p) => new THREE.Vector3(p.x, p.y + 0.02, p.z))
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts)
      const line = new THREE.Line(lineGeo, createCenterlineMaterial())
      line.frustumCulled = false
      group.add(line)

      // Control-point rings (Bevy-style nodes)
      const markers = projectControlMarkers(
        path,
        heightfield,
        sceneParams.displacementScale,
        0.1,
      )
      for (const m of markers) {
        const ringGeo = new THREE.RingGeometry(0.06, 0.1, 20)
        ringGeo.rotateX(-Math.PI / 2)
        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: 0x7ad0ff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        )
        ring.position.set(m.x, m.y, m.z)
        ring.frustumCulled = false
        group.add(ring)
      }
    }
  }, [splinePCG, heightfield, sceneParams.displacementScale])

  // Bump map version whenever colorMap or heightfield reference changes.
  useEffect(() => {
    mapVersionRef.current += 1
  }, [colorMap, heightfield])

  // Sync fog ref.
  useEffect(() => {
    fogEnabledRef.current = sceneParams.fog
  }, [sceneParams.fog])

  // Do NOT mirror displacementScale into dispScaleRef here — the animate loop
  // compares sceneRef vs dispScaleRef and calls applyHeightfield() on change.
  // Syncing early would skip the mesh update until planeSegments rebuilds.

  return (
    <div
      ref={containerRef}
      className="three-canvas"
      aria-label="Interactive 3D canvas"
    />
  )
}

function clearScatterGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof THREE.InstancedMesh) {
      // Geometry is shared via plant cache — do not dispose it.
      child.dispose()
    }
  }
}

function clearSplineGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        for (const m of child.material) m.dispose()
      } else {
        child.material.dispose()
      }
    }
  }
}
