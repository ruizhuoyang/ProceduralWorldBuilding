import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThreeCanvas, {
  type CameraView,
  type SceneParams,
  type ThreeCanvasHandle,
  type ViewportParams,
} from './components/ThreeCanvas'
import NoiseCanvas from './components/NoiseCanvas'
import MapReference from './components/MapReference'
import ErosionCanvas from './components/ErosionCanvas'
import SidePanel, { type SubTab } from './components/SidePanel'
import ViewSwitcher, { type ViewMode } from './components/ViewSwitcher'
import FirebaseControls from './components/FirebaseControls'
import VoxelCanvas, { type VoxelDisplay } from './components/VoxelCanvas'
import VoxelPanel from './components/VoxelPanel'
import { collectSurfaceVoxels, countSolid } from './lib/voxel/densityGrid'
import { marchingCubes } from './lib/voxel/marchingCubes'
import { buildVoxelGrid, composeDensity, createDefaultVoxelParams, type VoxelParams } from './lib/voxel/voxelField'
import {
  buildChunkDensities,
  chunkCount,
  createChunkLayout,
  DEFAULT_CHUNK_SIZE,
  meshChunks,
} from './lib/voxel/chunks'
import {
  addRain,
  buildWaterDensityGrid,
  createHydroState,
  DEFAULT_HYDRO_PARAMS,
  ensureHydroState,
  resetHydro,
  stepHydrology,
  type HydroParams,
  type HydroState,
} from './lib/voxel/hydrology'
import type { ColorMode, NoiseLayer } from './lib/noise'
import {
  generateHeightfield,
  heightmapToTexture,
  ZERO_OFFSET,
  type MapOffset,
} from './lib/generateNoiseTexture'
import { createCalibratedLayers } from './lib/terrainPresets'
import { DEFAULT_ENVIRONMENT, type EnvironmentParams } from './lib/environment'
import {
  createErosionState,
  stepErosion,
  DEFAULT_EROSION_PARAMS,
  type ErosionParams,
  type ErosionState,
} from './lib/erosion'
import {
  DEFAULT_GRADIENT,
  heightGradientTexture,
  type GradientStop,
  type TerrainColorMode,
} from './lib/heightGradient'
import './App.css'

// Plane segments match the heightmap size so 3D shows every sample (3D uses nearest-neighbour lookup).
const DEFAULT_SCENE: SceneParams = {
  planeSegments: 256,
  displacementScale: 1.8,
  noiseFieldSize: 256,
  fog: false,
}

/** Minimum time between live erosion pushes to 3D; each push re-displaces the mesh and re-uploads the texture. */
const LIVE_SYNC_INTERVAL_MS = 250

/** Arrow-key scroll speed in map widths per second (Shift multiplies it). */
const SCROLL_SPEED = 0.4
const SCROLL_FAST_MULTIPLIER = 4
/** Minimum time between 3D terrain regenerations while scrolling. */
const SCROLL_REGEN_INTERVAL_MS = 60
/** A single tap moves as far as this many seconds of held scrolling. */
const TAP_NUDGE_SECONDS = 0.05

const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

function buildNoiseTerrain(layers: NoiseLayer[], size: number, offset: MapOffset) {
  const heightfield = generateHeightfield(layers, size, offset)
  const colorMode = layers[0]?.params.colorMode ?? 'grayscale'
  return { heightfield, colorMap: heightmapToTexture(heightfield, size, colorMode) }
}

const DEFAULT_VIEWPORT: ViewportParams = {
  solid: true,
  wireframe: false,
  axes: false,
  grid: true,
}

function App() {
  const [view, setView] = useState<ViewMode>('3d')
  const [subTab, setSubTab] = useState<SubTab>('noise')
  const [layers, setLayers] = useState<NoiseLayer[]>(createCalibratedLayers)
  const [mapOffset, setMapOffset] = useState<MapOffset>(ZERO_OFFSET)
  const [sceneParams, setSceneParams] = useState<SceneParams>(DEFAULT_SCENE)
  const [environment, setEnvironment] = useState<EnvironmentParams>(DEFAULT_ENVIRONMENT)
  const handleTimeOfDayChange = useCallback(
    (timeOfDay: number) => setEnvironment((env) => ({ ...env, timeOfDay })),
    [],
  )
  const [viewport, setViewport] = useState<ViewportParams>(DEFAULT_VIEWPORT)
  const [showPreview, setShowPreview] = useState(true)

  const threeRef = useRef<ThreeCanvasHandle>(null)
  const [storedView, setStoredView] = useState<CameraView | null>(null)

  const [colorMap, setColorMap] = useState<HTMLCanvasElement | null>(null)
  const [heightfield, setHeightfield] = useState<Float32Array | null>(null)
  const [appliedSource, setAppliedSource] = useState<'noise' | 'erosion' | null>(null)
  const [terrainColorMode, setTerrainColorMode] = useState<TerrainColorMode>('default')
  const [gradientStops, setGradientStops] = useState<GradientStop[]>(DEFAULT_GRADIENT)

  const terrainColorMap = useMemo(() => {
    if (terrainColorMode === 'height' && heightfield) {
      return heightGradientTexture(heightfield, gradientStops)
    }
    return colorMap
  }, [terrainColorMode, heightfield, gradientStops, colorMap])

  // Voxel terrain
  const [voxelParams, setVoxelParams] = useState<VoxelParams>(createDefaultVoxelParams)
  const [voxelDisplay, setVoxelDisplay] = useState<VoxelDisplay>({
    mode: 'mesh',
    voxels: true,
    points: false,
    bounds: true,
    meshWireframe: false,
    chunked: true,
    chunkBounds: false,
    chunkTint: false,
    showWater: true,
  })
  const [voxelChunkSize, setVoxelChunkSize] = useState(DEFAULT_CHUNK_SIZE)
  const [hydroParams, setHydroParams] = useState<HydroParams>(DEFAULT_HYDRO_PARAMS)
  const [hydroState, setHydroState] = useState<HydroState>(() =>
    createHydroState(createDefaultVoxelParams().resolution, createDefaultVoxelParams().extent),
  )
  const [hydroRunning, setHydroRunning] = useState(false)
  const voxelDebug = voxelDisplay.mode === 'debug'
  const voxelChunked = !voxelDebug && voxelDisplay.chunked
  // Full grid when debugging, unchunked mesh, or hydrology is visible/running.
  const needFullGrid = !voxelChunked || voxelDisplay.showWater || hydroRunning
  const voxelGrid = useMemo(
    () => (needFullGrid ? buildVoxelGrid(voxelParams) : null),
    [needFullGrid, voxelParams],
  )
  const voxelSurface = useMemo(
    () => (voxelDebug && voxelGrid ? collectSurfaceVoxels(voxelGrid, voxelParams.isoLevel) : null),
    [voxelDebug, voxelGrid, voxelParams.isoLevel],
  )
  const voxelMesh = useMemo(
    () => (voxelDebug || voxelChunked || !voxelGrid ? null : marchingCubes(voxelGrid, voxelParams.isoLevel)),
    [voxelDebug, voxelChunked, voxelGrid, voxelParams.isoLevel],
  )

  // Chunked path: densities ignore the iso level, so moving the iso slider only re-meshes.
  const {
    resolution: voxelResolution,
    extent: voxelExtent,
    operations: voxelOperations,
    isoLevel: voxelIso,
  } = voxelParams
  const chunkLayout = useMemo(
    () => createChunkLayout(voxelResolution, voxelExtent, voxelChunkSize),
    [voxelResolution, voxelExtent, voxelChunkSize],
  )
  const chunkDensities = useMemo(
    () => (voxelChunked ? buildChunkDensities(chunkLayout, composeDensity(voxelOperations)) : null),
    [voxelChunked, chunkLayout, voxelOperations],
  )
  const chunkMeshes = useMemo(
    () => (chunkDensities ? meshChunks(chunkLayout, chunkDensities, voxelIso) : null),
    [chunkLayout, chunkDensities, voxelIso],
  )

  const handleVoxelParamsChange = useCallback((params: VoxelParams) => {
    setVoxelParams(params)
    setHydroState(createHydroState(params.resolution, params.extent))
    setHydroRunning(false)
  }, [])

  const waterMeshData = useMemo(() => {
    if (!voxelDisplay.showWater || !voxelGrid || hydroState.totalWater <= 1e-4) return null
    const waterGrid = buildWaterDensityGrid(hydroState, voxelGrid, voxelIso, hydroParams.fillThreshold)
    return marchingCubes(waterGrid, 0)
  }, [voxelDisplay.showWater, voxelGrid, hydroState, voxelIso, hydroParams.fillThreshold])

  const hydroTerrainRef = useRef(voxelGrid)
  const hydroParamsRef = useRef(hydroParams)
  const hydroIsoRef = useRef(voxelIso)
  useEffect(() => { hydroTerrainRef.current = voxelGrid }, [voxelGrid])
  useEffect(() => { hydroParamsRef.current = hydroParams }, [hydroParams])
  useEffect(() => { hydroIsoRef.current = voxelIso }, [voxelIso])

  const handleHydroRain = useCallback(() => {
    const grid = hydroTerrainRef.current
    if (!grid) return
    setHydroState((s) => {
      const state = ensureHydroState(s, grid.resolution, grid.extent)
      addRain(state, grid, hydroIsoRef.current, hydroParamsRef.current)
      stepHydrology(state, grid, hydroIsoRef.current, hydroParamsRef.current)
      return { ...state, water: state.water, totalWater: state.totalWater, steps: state.steps }
    })
    setVoxelDisplay((d) => (d.showWater ? d : { ...d, showWater: true }))
  }, [])

  const handleHydroStep = useCallback(() => {
    const grid = hydroTerrainRef.current
    if (!grid) return
    setHydroState((s) => {
      const state = ensureHydroState(s, grid.resolution, grid.extent)
      stepHydrology(state, grid, hydroIsoRef.current, hydroParamsRef.current)
      return { ...state, water: state.water, totalWater: state.totalWater, steps: state.steps }
    })
  }, [])

  const handleHydroReset = useCallback(() => {
    setHydroState((s) => resetHydro({ ...s, water: s.water }))
    setHydroRunning(false)
  }, [])

  useEffect(() => {
    if (!hydroRunning || view !== 'voxel') return
    let frameId = 0
    let last = performance.now()
    const tick = (now: number) => {
      // ~20 Hz so MC rebuilds stay responsive
      if (now - last >= 50) {
        last = now
        const grid = hydroTerrainRef.current
        if (grid) {
          setHydroState((s) => {
            const state = ensureHydroState(s, grid.resolution, grid.extent)
            addRain(state, grid, hydroIsoRef.current, hydroParamsRef.current)
            stepHydrology(state, grid, hydroIsoRef.current, hydroParamsRef.current)
            return { ...state, water: state.water, totalWater: state.totalWater, steps: state.steps }
          })
        }
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [hydroRunning, view])

  const voxelStats = useMemo(() => {
    let triangles: number | null = voxelMesh ? voxelMesh.indices.length / 3 : null
    let vertices: number | null = voxelMesh ? voxelMesh.positions.length / 3 : null
    let activeChunks: number | null = null
    if (chunkMeshes) {
      triangles = vertices = activeChunks = 0
      for (const { mesh } of chunkMeshes) {
        triangles += mesh.indices.length / 3
        vertices += mesh.positions.length / 3
        if (mesh.indices.length > 0) activeChunks++
      }
    }
    return {
      samples: voxelResolution ** 3,
      solid: voxelGrid ? countSolid(voxelGrid, voxelIso) : null,
      surface: voxelSurface?.length ?? null,
      triangles,
      vertices,
      chunks: chunkMeshes ? chunkCount(chunkLayout) : null,
      activeChunks,
    }
  }, [voxelResolution, voxelGrid, voxelIso, voxelSurface, voxelMesh, chunkMeshes, chunkLayout])

  // Erosion state
  const [erosionParams, setErosionParams] = useState<ErosionParams>(DEFAULT_EROSION_PARAMS)
  const [erosionState, setErosionState] = useState<ErosionState | null>(null)
  const [erosionRunning, setErosionRunning] = useState(false)
  const [erosionColorMode, setErosionColorMode] = useState<ColorMode>('terrain')

  const handleApply = useCallback(() => {
    const terrain = buildNoiseTerrain(layers, sceneParams.noiseFieldSize, mapOffset)
    setColorMap(terrain.colorMap)
    setHeightfield(terrain.heightfield)
    setAppliedSource('noise')
  }, [layers, sceneParams.noiseFieldSize, mapOffset])

  const handleLoadPreset = useCallback(() => {
    setLayers(createCalibratedLayers())
    setMapOffset(ZERO_OFFSET)
    setSceneParams((p) => ({
      ...p,
      planeSegments: DEFAULT_SCENE.planeSegments,
      displacementScale: DEFAULT_SCENE.displacementScale,
      noiseFieldSize: DEFAULT_SCENE.noiseFieldSize,
    }))
  }, [])

  const handleClear = useCallback(() => {
    setColorMap(null)
    setHeightfield(null)
    setAppliedSource(null)
  }, [])

  // Erosion callbacks
  const handleGenerateBase = useCallback(() => {
    const size = erosionParams.mapSize
    const hf = generateHeightfield(layers, size, mapOffset)
    setErosionState(createErosionState(hf))
    setErosionRunning(false)
  }, [layers, erosionParams.mapSize, mapOffset])

  const handleStartErosion = useCallback(() => setErosionRunning(true), [])
  const handleStopErosion = useCallback(() => setErosionRunning(false), [])
  const handleResetErosion = useCallback(() => {
    setErosionRunning(false)
    setErosionState(null)
  }, [])

  /** Copies the erosion heightmap into the 3D terrain; the simulation keeps its own buffer. */
  const pushErosionTo3D = useCallback((state: ErosionState, colorMode: ColorMode) => {
    const size = Math.round(Math.sqrt(state.heightmap.length))
    setColorMap(heightmapToTexture(state.heightmap, size, colorMode))
    setHeightfield(new Float32Array(state.heightmap))
    setAppliedSource('erosion')
  }, [])

  const handleApplyErosion = useCallback(() => {
    if (erosionState) pushErosionTo3D(erosionState, erosionColorMode)
  }, [erosionState, erosionColorMode, pushErosionTo3D])

  const [liveSync, setLiveSync] = useState(false)
  const handleLiveSyncChange = useCallback((enabled: boolean) => {
    setLiveSync(enabled)
    if (enabled && erosionState) pushErosionTo3D(erosionState, erosionColorMode)
  }, [erosionState, erosionColorMode, pushErosionTo3D])

  // The loop lives here rather than in ErosionCanvas so it keeps running in 3D view.
  const erosionStateRef = useRef(erosionState)
  const erosionParamsRef = useRef(erosionParams)
  const erosionColorRef = useRef(erosionColorMode)
  const liveSyncRef = useRef(liveSync)
  useEffect(() => { erosionStateRef.current = erosionState }, [erosionState])
  useEffect(() => { erosionParamsRef.current = erosionParams }, [erosionParams])
  useEffect(() => { erosionColorRef.current = erosionColorMode }, [erosionColorMode])
  useEffect(() => { liveSyncRef.current = liveSync }, [liveSync])

  useEffect(() => {
    if (!erosionRunning) return
    let frameId = 0
    let lastSync = -Infinity

    const tick = (now: number) => {
      const state = erosionStateRef.current
      if (!state) return
      const next = { ...stepErosion(state, erosionParamsRef.current) }
      erosionStateRef.current = next
      setErosionState(next)
      if (liveSyncRef.current && now - lastSync >= LIVE_SYNC_INTERVAL_MS) {
        lastSync = now
        pushErosionTo3D(next, erosionColorRef.current)
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameId)
      // Final push so 3D matches the exact state the simulation stopped at.
      const state = erosionStateRef.current
      if (liveSyncRef.current && state) pushErosionTo3D(state, erosionColorRef.current)
    }
  }, [erosionRunning, pushErosionTo3D])

  const handleResetCamera = useCallback(() => threeRef.current?.resetView(), [])
  const handleStoreView = useCallback(() => {
    const current = threeRef.current?.getView()
    if (current) setStoredView(current)
  }, [])
  const handleRecallView = useCallback(() => {
    if (storedView) threeRef.current?.setView(storedView)
  }, [storedView])

  const handleResetOffset = useCallback(() => {
    setMapOffset(ZERO_OFFSET)
    if (view === '3d' && appliedSource === 'noise') {
      const terrain = buildNoiseTerrain(layers, sceneParams.noiseFieldSize, ZERO_OFFSET)
      setColorMap(terrain.colorMap)
      setHeightfield(terrain.heightfield)
    }
  }, [view, appliedSource, layers, sceneParams.noiseFieldSize])

  // ── Keyboard: arrow keys scroll the noise map, W toggles wireframe in 3D ──
  const keyStateRef = useRef({ view, subTab, appliedSource, layers, fieldSize: sceneParams.noiseFieldSize, offset: mapOffset })
  useEffect(() => {
    keyStateRef.current = { view, subTab, appliedSource, layers, fieldSize: sceneParams.noiseFieldSize, offset: mapOffset }
  }, [view, subTab, appliedSource, layers, sceneParams.noiseFieldSize, mapOffset])

  useEffect(() => {
    const held = new Set<string>()
    let fast = false
    let frameId = 0
    let lastTime = 0
    let lastRegen = -Infinity

    // 2D scrolls the Noise preview; 3D scrolls only when the terrain comes from noise (erosion results are fixed maps).
    const canScroll = () => {
      const s = keyStateRef.current
      return (s.view === '2d' && s.subTab === 'noise') || (s.view === '3d' && s.appliedSource === 'noise')
    }

    let regenOffset: MapOffset | null = null
    const regenerate3D = (offset: MapOffset) => {
      regenOffset = offset
      const s = keyStateRef.current
      const terrain = buildNoiseTerrain(s.layers, s.fieldSize, offset)
      setColorMap(terrain.colorMap)
      setHeightfield(terrain.heightfield)
    }

    const move = (dx: number, dy: number, seconds: number, now: number) => {
      const step = SCROLL_SPEED * (fast ? SCROLL_FAST_MULTIPLIER : 1) * seconds
      const prev = keyStateRef.current.offset
      const next = { x: prev.x + dx * step, y: prev.y + dy * step }
      keyStateRef.current.offset = next
      setMapOffset(next)
      if (keyStateRef.current.view === '3d' && now - lastRegen >= SCROLL_REGEN_INTERVAL_MS) {
        lastRegen = now
        regenerate3D(next)
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - lastTime) / 1000)
      lastTime = now
      if (held.size === 0 || !canScroll()) {
        frameId = 0
        return
      }
      let dx = 0
      let dy = 0
      for (const key of held) {
        dx += ARROW_DIRECTIONS[key][0]
        dy += ARROW_DIRECTIONS[key][1]
      }
      move(dx, dy, dt, now)
      frameId = requestAnimationFrame(tick)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      fast = e.shiftKey

      if ((e.key === 'w' || e.key === 'W') && keyStateRef.current.view === '3d') {
        e.preventDefault()
        if (!e.repeat) setViewport((v) => ({ ...v, wireframe: !v.wireframe }))
        return
      }

      if (e.key in ARROW_DIRECTIONS && canScroll()) {
        e.preventDefault()
        if (!held.has(e.key)) {
          // Tap nudge, so a quick press moves even if released before the next frame.
          const [dx, dy] = ARROW_DIRECTIONS[e.key]
          move(dx, dy, TAP_NUDGE_SECONDS, performance.now())
        }
        held.add(e.key)
        if (!frameId) {
          lastTime = performance.now()
          frameId = requestAnimationFrame(tick)
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      fast = e.shiftKey
      if (!held.delete(e.key)) return
      // Land exactly on the final offset once scrolling stops.
      const s = keyStateRef.current
      if (held.size === 0 && s.view === '3d' && s.appliedSource === 'noise' && regenOffset !== s.offset) {
        regenerate3D(s.offset)
      }
    }

    const onBlur = () => held.clear()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const subtitle =
    view === '3d'
      ? 'Visualize · Inspect · Experience'
      : view === 'voxel'
        ? 'Density · Shapes · Surfaces'
        : 'Generate · Simulate · Edit'

  // In 2D view, show erosion canvas when simulation sub-tab is active
  const showErosion = view === '2d' && subTab === 'simulation'

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <h1 className="app-title">Procedural World Building</h1>
          <p className="app-subtitle">{subtitle}</p>
        </div>
        <FirebaseControls scene={sceneParams} onLoadScene={setSceneParams} />
        <ViewSwitcher view={view} onChange={setView} />
      </header>

      <main className="app-main">
        <section
          className="canvas-section"
          aria-label={view === '3d' ? '3D viewport' : view === 'voxel' ? 'Voxel viewport' : '2D viewport'}
        >
          {view === 'voxel' && (
            <VoxelCanvas
              grid={voxelGrid}
              extent={voxelExtent}
              isoLevel={voxelParams.isoLevel}
              surface={voxelSurface}
              mesh={voxelMesh}
              chunks={chunkMeshes}
              waterMesh={waterMeshData}
              display={voxelDisplay}
            />
          )}
          {view === '3d' && (
            <>
              <ThreeCanvas
                ref={threeRef}
                sceneParams={sceneParams}
                viewport={viewport}
                colorMap={terrainColorMap}
                heightfield={heightfield}
                environment={environment}
                onTimeOfDayChange={handleTimeOfDayChange}
              />
              {showPreview && (
                <MapReference
                  colorMap={colorMap}
                  source={appliedSource}
                  onClose={() => setShowPreview(false)}
                />
              )}
            </>
          )}
          {view === '2d' && !showErosion && <NoiseCanvas layers={layers} offset={mapOffset} />}
          {showErosion && (
            <ErosionCanvas erosionState={erosionState} colorMode={erosionColorMode} />
          )}
        </section>
        {view === 'voxel' ? (
          <VoxelPanel
            params={voxelParams}
            onParamsChange={handleVoxelParamsChange}
            display={voxelDisplay}
            onDisplayChange={setVoxelDisplay}
            chunkSize={voxelChunkSize}
            onChunkSizeChange={setVoxelChunkSize}
            hydro={hydroParams}
            onHydroChange={setHydroParams}
            hydroRunning={hydroRunning}
            onHydroRunningChange={setHydroRunning}
            onHydroRain={handleHydroRain}
            onHydroStep={handleHydroStep}
            onHydroReset={handleHydroReset}
            totalWater={hydroState.totalWater}
            stats={voxelStats}
          />
        ) : (
        <SidePanel
          view={view}
          subTab={subTab}
          onSubTabChange={setSubTab}
          layers={layers}
          onLayersChange={setLayers}
          sceneParams={sceneParams}
          onSceneParamsChange={setSceneParams}
          environment={environment}
          onEnvironmentChange={setEnvironment}
          viewport={viewport}
          onViewportChange={setViewport}
          onResetCamera={handleResetCamera}
          onStoreView={handleStoreView}
          onRecallView={handleRecallView}
          hasStoredView={storedView !== null}
          hasAppliedMap={colorMap !== null}
          appliedSource={appliedSource}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((p) => !p)}
          terrainColorMode={terrainColorMode}
          onTerrainColorModeChange={setTerrainColorMode}
          gradientStops={gradientStops}
          onGradientStopsChange={setGradientStops}
          hasHeightfield={heightfield !== null}
          heightfieldSize={heightfield ? Math.round(Math.sqrt(heightfield.length)) : null}
          mapOffset={mapOffset}
          onResetOffset={handleResetOffset}
          onLoadPreset={handleLoadPreset}
          onApply={handleApply}
          onClearMap={handleClear}
          erosionParams={erosionParams}
          onErosionParamsChange={setErosionParams}
          erosionState={erosionState}
          erosionRunning={erosionRunning}
          erosionColorMode={erosionColorMode}
          onErosionColorModeChange={setErosionColorMode}
          onGenerateBase={handleGenerateBase}
          onStartErosion={handleStartErosion}
          onStopErosion={handleStopErosion}
          onResetErosion={handleResetErosion}
          onApplyErosion={handleApplyErosion}
          liveSync={liveSync}
          onLiveSyncChange={handleLiveSyncChange}
        />
        )}
      </main>
    </div>
  )
}

export default App
