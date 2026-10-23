import { useState, type ReactNode } from 'react'
import ParamSlider from './ParamSlider'
import type { ViewMode } from './ViewSwitcher'
import type { SceneParams, ViewportParams } from './ThreeCanvas'
import {
  CELL_RETURNS,
  COLOR_MODES,
  DISTANCE_METRICS,
  NOISE_GROUPS,
  NOISE_TYPES,
  SHAPING_OPS,
  usesCellular,
  usesFractalControls,
  usesWarpControls,
  type ColorMode,
  type NoiseLayer,
  type NoiseParams,
  type ShapingParams,
} from '../lib/noise'
import type { ErosionParams, ErosionState } from '../lib/erosion'
import {
  formatTimeOfDay,
  type EnvironmentParams,
} from '../lib/environment'
import type { MapOffset } from '../lib/generateNoiseTexture'
import {
  DEFAULT_GRADIENT,
  gradientCss,
  type GradientStop,
  type TerrainColorMode,
} from '../lib/heightGradient'
import {
  PLANT_KINDS,
  createScatterLayer,
  type PlantKind,
  type ScatterLayer,
} from '../lib/scatter/types'
import {
  CONVERT_TO_OPTIONS,
  type ConvertTo,
  type SplinePCGParams,
} from '../lib/spline/types'
import {
  applyPhenomenonPreset,
  FIELD_MODES,
  PHENOMENA,
  type FieldMode,
  type ParticleWeatherParams,
  type WeatherPhenomenon,
} from '../lib/particles/types'
import './SidePanel.css'

export type SubTab = 'noise' | 'simulation'

/** Class 06 workspace under 3D World. */
export type WorldTab = 'terrain' | 'scatter' | 'splines' | 'particles'

const WORLD_TABS: { id: WorldTab; label: string }[] = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'splines', label: 'Splines' },
  { id: 'particles', label: 'Particles' },
]

type SectionId =
  // 3D World — always visible
  | 'display'
  | 'mesh'
  // Below Class 06 tabs module (order: Environment, then Camera last)
  | 'environment'
  | 'camera'
  // 2D Terrain — below Noise / Simulation tabs
  | 'analysis'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  display: true,
  mesh: true,
  environment: true,
  camera: true,
  analysis: false,
}

type SidePanelProps = {
  view: ViewMode
  subTab: SubTab
  onSubTabChange: (tab: SubTab) => void
  layers: NoiseLayer[]
  onLayersChange: (layers: NoiseLayer[]) => void
  sceneParams: SceneParams
  onSceneParamsChange: (params: SceneParams) => void
  environment: EnvironmentParams
  onEnvironmentChange: (params: EnvironmentParams) => void
  viewport: ViewportParams
  onViewportChange: (params: ViewportParams) => void
  onResetCamera: () => void
  onStoreView: () => void
  onRecallView: () => void
  hasStoredView: boolean
  hasAppliedMap: boolean
  appliedSource: 'noise' | 'erosion' | null
  onTogglePreview: () => void
  showPreview: boolean
  terrainColorMode: TerrainColorMode
  onTerrainColorModeChange: (mode: TerrainColorMode) => void
  gradientStops: GradientStop[]
  onGradientStopsChange: (stops: GradientStop[]) => void
  hasHeightfield: boolean
  heightfieldSize: number | null
  mapOffset: MapOffset
  onResetOffset: () => void
  onLoadPreset: () => void
  onApply: () => void
  onClearMap: () => void
  // Simulation props
  erosionParams: ErosionParams
  onErosionParamsChange: (params: ErosionParams) => void
  erosionState: ErosionState | null
  erosionRunning: boolean
  erosionColorMode: ColorMode
  onErosionColorModeChange: (mode: ColorMode) => void
  onGenerateBase: () => void
  onStartErosion: () => void
  onStopErosion: () => void
  onResetErosion: () => void
  onApplyErosion: () => void
  liveSync: boolean
  onLiveSyncChange: (enabled: boolean) => void
  /** Class 06 plant scatter layers (3D World). */
  scatterLayers: ScatterLayer[]
  onScatterLayersChange: (layers: ScatterLayer[]) => void
  /** Plants only show in the viewport after Distribute is pressed. */
  scatterPlaced: boolean
  onDistributeScatter: () => void
  onClearScatter: () => void
  /** Class 06 PCG splines (Bevy-style). */
  splinePCG: SplinePCGParams
  onSplinePCGChange: (params: SplinePCGParams) => void
  onRegenerateSplines: () => void
  onClearSplines: () => void
  /** Class 06 weather particles. */
  particleWeather: ParticleWeatherParams
  onParticleWeatherChange: (params: ParticleWeatherParams) => void
}

type AccordionSectionProps = {
  id: SectionId
  label: string
  open: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}

function AccordionSection({ id, label, open, onToggle, children }: AccordionSectionProps) {
  return (
    <section className={`accordion ${open ? 'accordion--open' : ''}`}>
      <button
        type="button"
        className="accordion__header"
        aria-expanded={open}
        aria-controls={`panel-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <span className="accordion__chevron" aria-hidden="true">▸</span>
        <span className="accordion__label">{label}</span>
      </button>
      {open && (
        <div id={`panel-section-${id}`} className="accordion__body">
          {children}
        </div>
      )}
    </section>
  )
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="side-panel__row">
      <span className="side-panel__label">{label}</span>
      <label className="side-panel__toggle">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="side-panel__toggle-track" />
      </label>
    </div>
  )
}

function PlannedRow({ label }: { label: string }) {
  return (
    <div className="side-panel__row side-panel__planned">
      <span className="side-panel__label">{label}</span>
      <span className="side-panel__badge">planned</span>
    </div>
  )
}

export default function SidePanel({
  view,
  subTab,
  onSubTabChange,
  layers,
  onLayersChange,
  sceneParams,
  onSceneParamsChange,
  environment,
  onEnvironmentChange,
  viewport,
  onViewportChange,
  onResetCamera,
  onStoreView,
  onRecallView,
  hasStoredView,
  hasAppliedMap,
  appliedSource,
  onTogglePreview,
  showPreview,
  terrainColorMode,
  onTerrainColorModeChange,
  gradientStops,
  onGradientStopsChange,
  hasHeightfield,
  heightfieldSize,
  mapOffset,
  onResetOffset,
  onLoadPreset,
  onApply,
  onClearMap,
  erosionParams,
  onErosionParamsChange,
  erosionState,
  erosionRunning,
  erosionColorMode,
  onErosionColorModeChange,
  onGenerateBase,
  onStartErosion,
  onStopErosion,
  onResetErosion,
  onApplyErosion,
  liveSync,
  onLiveSyncChange,
  scatterLayers,
  onScatterLayersChange,
  scatterPlaced,
  onDistributeScatter,
  onClearScatter,
  splinePCG,
  onSplinePCGChange,
  onRegenerateSplines,
  onClearSplines,
  particleWeather,
  onParticleWeatherChange,
}: SidePanelProps) {
  const patchParticles = (patch: Partial<ParticleWeatherParams>) => {
    onParticleWeatherChange({ ...particleWeather, ...patch })
  }

  const patchSpline = (patch: Partial<SplinePCGParams>) => {
    onSplinePCGChange({ ...splinePCG, ...patch })
  }
  const [selectedNoiseId, setSelectedNoiseId] = useState<string | null>(null)
  const [worldTab, setWorldTab] = useState<WorldTab>('terrain')
  const [expandedScatterId, setExpandedScatterId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN)

  const activeNoiseId = selectedNoiseId && layers.some((l) => l.id === selectedNoiseId)
    ? selectedNoiseId
    : layers[0]?.id ?? null
  const activeNoise = layers.find((l) => l.id === activeNoiseId) ?? layers[0] ?? null
  const activeNoiseIndex = activeNoise ? layers.findIndex((l) => l.id === activeNoise.id) : -1

  const toggleSection = (id: SectionId) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const section = (id: SectionId, label: string, children: ReactNode) => (
    <AccordionSection id={id} label={label} open={openSections[id]} onToggle={toggleSection}>
      {children}
    </AccordionSection>
  )

  const updateScene = <Key extends keyof SceneParams>(
    key: Key,
    value: SceneParams[Key],
  ) => onSceneParamsChange({ ...sceneParams, [key]: value })

  const updateEnvironment = <Key extends keyof EnvironmentParams>(
    key: Key,
    value: EnvironmentParams[Key],
  ) => onEnvironmentChange({ ...environment, [key]: value })

  const updateViewport = <Key extends keyof ViewportParams>(
    key: Key,
    value: ViewportParams[Key],
  ) => onViewportChange({ ...viewport, [key]: value })

  const updateStop = (index: number, patch: Partial<GradientStop>) =>
    onGradientStopsChange(gradientStops.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const updateErosion = <Key extends keyof ErosionParams>(
    key: Key,
    value: ErosionParams[Key],
  ) => onErosionParamsChange({ ...erosionParams, [key]: value })

  const updateLayer = (id: string, patch: Partial<NoiseLayer>) => {
    onLayersChange(
      layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    )
  }

  const updateLayerParams = (id: string, patch: Partial<NoiseParams>) => {
    onLayersChange(
      layers.map((l) =>
        l.id === id ? { ...l, params: { ...l.params, ...patch } } : l,
      ),
    )
  }

  const updateLayerShaping = (id: string, patch: Partial<ShapingParams>) => {
    onLayersChange(
      layers.map((l) =>
        l.id === id ? { ...l, shaping: { ...l.shaping, ...patch } } : l,
      ),
    )
  }

  // ═══════════════════════════════════════
  // 3D World — Class 06: Terrain → Scatter → Splines → Particles
  // ═══════════════════════════════════════
  if (view === '3d') {
    return (
      <aside className="side-panel" aria-label="3D world controls">
        {/* Always visible — original 3D viewport controls */}
        {section('display', 'Display', (
          <>
            <ToggleRow label="Solid" checked={viewport.solid} onChange={(v) => updateViewport('solid', v)} />
            <ToggleRow label="Wireframe (W)" checked={viewport.wireframe} onChange={(v) => updateViewport('wireframe', v)} />
            <ToggleRow label="Axis" checked={viewport.axes} onChange={(v) => updateViewport('axes', v)} />
            <ToggleRow label="Grid" checked={viewport.grid} onChange={(v) => updateViewport('grid', v)} />
            <ToggleRow label="Map Reference" checked={showPreview} onChange={onTogglePreview} />
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor="terrain-color-mode">Color Mode</label>
              <select
                id="terrain-color-mode"
                className="side-panel__select"
                value={terrainColorMode}
                onChange={(e) => onTerrainColorModeChange(e.target.value as TerrainColorMode)}
              >
                <option value="default">Default</option>
                <option value="height">Height Gradient</option>
              </select>
            </div>
            {terrainColorMode === 'height' && (
              <div className="gradient-editor">
                <div className="gradient-editor__bar" style={{ background: gradientCss(gradientStops) }} />
                {gradientStops.map((stop, i) => (
                  <div key={i} className="gradient-editor__stop">
                    <input
                      type="color"
                      className="gradient-editor__color"
                      aria-label={`Stop ${i + 1} color`}
                      value={stop.color}
                      onChange={(e) => updateStop(i, { color: e.target.value })}
                    />
                    <input
                      type="range"
                      className="gradient-editor__range"
                      aria-label={`Stop ${i + 1} position`}
                      min={0}
                      max={1}
                      step={0.01}
                      value={stop.position}
                      onChange={(e) => updateStop(i, { position: Number(e.target.value) })}
                    />
                    <span className="side-panel__value gradient-editor__value">{stop.position.toFixed(2)}</span>
                  </div>
                ))}
                <button type="button" className="side-panel__button" onClick={() => onGradientStopsChange(DEFAULT_GRADIENT)}>
                  Reset Gradient
                </button>
                {!hasHeightfield && (
                  <p className="side-panel__hint">Load a Noise or Sim terrain to see the gradient.</p>
                )}
              </div>
            )}
          </>
        ))}

        {/* Always visible — mesh shape (not tied to Scatter) */}
        {section('mesh', 'Mesh', (
          <>
            <ParamSlider
              id="plane-segments"
              label="Plane Resolution"
              value={sceneParams.planeSegments}
              min={4}
              max={1024}
              step={4}
              onChange={(v) => updateScene('planeSegments', v)}
            />
            <ParamSlider
              id="displacement-scale"
              label="Terrain Height"
              value={sceneParams.displacementScale}
              min={0}
              max={6}
              step={0.1}
              format={(v) => v.toFixed(2)}
              onChange={(v) => updateScene('displacementScale', v)}
            />
            <p className="side-panel__hint">
              Scales the terrain mesh only. Plants stick to the surface after you Distribute in Scatter.
            </p>
            {heightfieldSize !== null && (
              <p className="side-panel__hint">
                {sceneParams.planeSegments < heightfieldSize
                  ? `Plane ${sceneParams.planeSegments} < map ${heightfieldSize}² — raise Plane Resolution to ${heightfieldSize}.`
                  : `Plane ${sceneParams.planeSegments} ≥ map ${heightfieldSize}².`}
              </p>
            )}
          </>
        ))}

        <nav className="sub-tabs sub-tabs--world" aria-label="Class 06 distributions">
          {WORLD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sub-tabs__button ${worldTab === tab.id ? 'sub-tabs__button--active' : ''}`}
              aria-pressed={worldTab === tab.id}
              onClick={() => setWorldTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {worldTab === 'terrain' && (
          <>
            <div className="side-panel__section">Terrain Source</div>
            <div className="side-panel__field">
              <span className="side-panel__label">Heightmap</span>
              <nav className="sub-tabs" aria-label="Terrain source">
                <button
                  type="button"
                  className={`sub-tabs__button ${!hasAppliedMap ? 'sub-tabs__button--active' : ''}`}
                  onClick={onClearMap}
                >
                  Flat
                </button>
                <button
                  type="button"
                  className={`sub-tabs__button ${hasAppliedMap && appliedSource === 'noise' ? 'sub-tabs__button--active' : ''}`}
                  onClick={onApply}
                >
                  Noise
                </button>
                <button
                  type="button"
                  className={`sub-tabs__button ${hasAppliedMap && appliedSource === 'erosion' ? 'sub-tabs__button--active' : ''}`}
                  onClick={onApplyErosion}
                  disabled={!erosionState}
                  title={erosionState ? undefined : 'Run a simulation in 2D Terrain first'}
                >
                  Sim
                </button>
              </nav>
            </div>
            <p className="side-panel__hint">
              Load a heightmap from 2D. To run erosion, use 2D Terrain → Simulation (Start / Stop there).
            </p>
            {hasAppliedMap && appliedSource === 'erosion' && (
              <>
                <ToggleRow
                  label="Live Sync from Sim"
                  checked={liveSync}
                  onChange={onLiveSyncChange}
                />
                <p className="side-panel__hint">
                  When on, the 3D heightmap updates while 2D Simulation is running — it does not place plants.
                </p>
              </>
            )}
            {hasAppliedMap && appliedSource === 'noise' && (
              <div className="side-panel__row">
                <span className="side-panel__hint">Arrow keys scroll · Shift = fast</span>
                <button type="button" className="side-panel__button" onClick={onResetOffset}>
                  Recenter
                </button>
              </div>
            )}
          </>
        )}

        {worldTab === 'scatter' && (
          <>
            <p className="side-panel__hint">
              Class 06 · A1 — set up layers, then press Distribute to place plants on the current terrain. Nothing grows until you distribute.
            </p>
            {!hasHeightfield && (
              <div className="side-panel__field">
                <p className="side-panel__hint">No heightmap yet — open Terrain tab or:</p>
                <button type="button" className="side-panel__button side-panel__button--accent" onClick={onApply}>
                  Use Noise map
                </button>
              </div>
            )}
            <div className="side-panel__field side-panel__row">
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                disabled={!hasHeightfield}
                title={hasHeightfield ? undefined : 'Load a heightmap first'}
                onClick={onDistributeScatter}
              >
                {scatterPlaced ? '↻ Re-distribute' : '▶ Distribute plants'}
              </button>
              <button
                type="button"
                className="side-panel__button"
                style={{ flex: 1 }}
                disabled={!scatterPlaced}
                onClick={onClearScatter}
              >
                Clear plants
              </button>
            </div>
            <p className="side-panel__hint">
              {scatterPlaced
                ? 'Plants are placed. Edit layers then Re-distribute to refresh.'
                : 'Viewport has no plant layer yet.'}
            </p>
            <div className="layer-list">
              {scatterLayers.map((layer, idx) => {
                const isExpanded = expandedScatterId === layer.id
                return (
                  <div
                    key={layer.id}
                    className={`layer-card ${isExpanded ? 'layer-card--expanded' : ''}`}
                  >
                    <div className="layer-card__header">
                      <label className="side-panel__toggle layer-card__vis">
                        <input
                          type="checkbox"
                          checked={layer.enabled}
                          aria-label={`Enable ${layer.name}`}
                          onChange={(e) => {
                            const enabled = e.target.checked
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, enabled } : l)),
                            )
                          }}
                        />
                        <span className="side-panel__toggle-track" />
                      </label>
                      <button
                        type="button"
                        className="layer-card__name"
                        onClick={() => setExpandedScatterId(isExpanded ? null : layer.id)}
                      >
                        {layer.name}
                      </button>
                      <span className="layer-card__type">{layer.plant}</span>
                      <div className="layer-card__actions">
                        <button
                          type="button"
                          title="Remove"
                          aria-label={`Remove ${layer.name}`}
                          onClick={() => {
                            onScatterLayersChange(scatterLayers.filter((l) => l.id !== layer.id))
                            if (expandedScatterId === layer.id) setExpandedScatterId(null)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="layer-card__body">
                        <div className="side-panel__field">
                          <label className="side-panel__label" htmlFor={`scatter-plant-${layer.id}`}>Plant</label>
                          <select
                            id={`scatter-plant-${layer.id}`}
                            className="side-panel__select"
                            value={layer.plant}
                            onChange={(e) => {
                              const plant = e.target.value as PlantKind
                              onScatterLayersChange(
                                scatterLayers.map((l) =>
                                  l.id === layer.id
                                    ? {
                                        ...l,
                                        plant,
                                        name: `Layer ${idx + 1} — ${plant[0].toUpperCase()}${plant.slice(1)}s`,
                                      }
                                    : l,
                                ),
                              )
                            }}
                          >
                            {PLANT_KINDS.map((p) => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <ParamSlider
                          id={`scatter-density-${layer.id}`}
                          label="Density (how many)"
                          value={layer.density}
                          min={8}
                          max={64}
                          step={1}
                          format={(v) => String(Math.round(v))}
                          onChange={(density) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, density } : l)),
                            )
                          }
                        />
                        <ParamSlider
                          id={`scatter-noise-${layer.id}`}
                          label="Sparseness (noise gate)"
                          value={layer.noiseThreshold}
                          min={0}
                          max={0.9}
                          step={0.01}
                          format={(v) => v.toFixed(2)}
                          onChange={(noiseThreshold) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, noiseThreshold } : l)),
                            )
                          }
                        />
                        <ParamSlider
                          id={`scatter-slope-${layer.id}`}
                          label="Max Slope"
                          value={layer.maxSlopeDeg}
                          min={10}
                          max={60}
                          step={1}
                          format={(v) => `${Math.round(v)}°`}
                          onChange={(maxSlopeDeg) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, maxSlopeDeg } : l)),
                            )
                          }
                        />
                        <ParamSlider
                          id={`scatter-hmin-${layer.id}`}
                          label="Map Height Min"
                          value={layer.heightMin}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(v) => v.toFixed(2)}
                          onChange={(heightMin) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, heightMin } : l)),
                            )
                          }
                        />
                        <ParamSlider
                          id={`scatter-hmax-${layer.id}`}
                          label="Map Height Max"
                          value={layer.heightMax}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(v) => v.toFixed(2)}
                          onChange={(heightMax) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, heightMax } : l)),
                            )
                          }
                        />
                        <ToggleRow
                          label="Prefer low valleys"
                          checked={layer.nearWater}
                          onChange={(nearWater) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, nearWater } : l)),
                            )
                          }
                        />
                        <ToggleRow
                          label="Align to Slope"
                          checked={layer.alignToNormal}
                          onChange={(alignToNormal) =>
                            onScatterLayersChange(
                              scatterLayers.map((l) => (l.id === layer.id ? { ...l, alignToNormal } : l)),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              className="side-panel__button side-panel__button--accent"
              onClick={() => {
                const cycle: PlantKind[] = ['tree', 'bush', 'grass']
                const plant = cycle[scatterLayers.length % 3]
                const created = createScatterLayer(scatterLayers.length + 1, plant)
                onScatterLayersChange([...scatterLayers, created])
                setExpandedScatterId(created.id)
              }}
            >
              + Add Layer {scatterLayers.length + 1}
            </button>
          </>
        )}

        {worldTab === 'splines' && (
          <>
            <p className="side-panel__hint">
              Class 06 · A2 — PCG splines like the Bevy demo: convert to lines, rivers, or roads; tune count / meander / width.
            </p>
            {!hasHeightfield && (
              <div className="side-panel__field">
                <p className="side-panel__hint">Need a heightmap first:</p>
                <button type="button" className="side-panel__button side-panel__button--accent" onClick={onApply}>
                  Use Noise map
                </button>
              </div>
            )}

            <div className="side-panel__section">Convert to</div>
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor="spline-convert">Mode</label>
              <select
                id="spline-convert"
                className="side-panel__select"
                value={splinePCG.convertTo}
                onChange={(e) => patchSpline({ convertTo: e.target.value as ConvertTo })}
              >
                {CONVERT_TO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <p className="side-panel__hint">
              {splinePCG.convertTo === 'splineOnly' && 'Cyan polylines + control rings only (no road/river mesh).'}
              {splinePCG.convertTo === 'roads' && 'Grey road ribbons; flattens a corridor on the heightmap.'}
              {splinePCG.convertTo === 'river' && 'Blue river ribbons; carves a trench along the path.'}
            </p>

            <div className="side-panel__section">Parameters</div>
            <ParamSlider
              id="spline-count"
              label="Count"
              value={splinePCG.count}
              min={1}
              max={8}
              step={1}
              onChange={(count) => patchSpline({ count })}
            />
            <ParamSlider
              id="spline-controls"
              label="Control points"
              value={splinePCG.controlPoints}
              min={3}
              max={24}
              step={1}
              onChange={(controlPoints) => patchSpline({ controlPoints })}
            />
            <ParamSlider
              id="spline-meander"
              label="Meander"
              value={splinePCG.meander}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(meander) => patchSpline({ meander })}
            />
            <ParamSlider
              id="spline-width"
              label="Width"
              value={splinePCG.width}
              min={0.1}
              max={1.2}
              step={0.05}
              format={(v) => `${(v * 10).toFixed(1)} m`}
              onChange={(width) => patchSpline({ width })}
            />

            <div className="side-panel__field side-panel__row">
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                disabled={!hasHeightfield}
                onClick={onRegenerateSplines}
              >
                Regenerate
              </button>
              <button
                type="button"
                className="side-panel__button"
                style={{ flex: 1 }}
                disabled={splinePCG.paths.length === 0}
                onClick={onClearSplines}
              >
                Clear
              </button>
            </div>
            <p className="side-panel__hint">
              {splinePCG.paths.length > 0
                ? `${splinePCG.paths.length} path(s) · ${splinePCG.paths.reduce((n, p) => n + p.controls.length, 0)} control points`
                : 'Press Regenerate to place splines on the current terrain.'}
            </p>
          </>
        )}

        {worldTab === 'particles' && (
          <>
            <p className="side-panel__hint">
              Class 06 · A3 — weather particles driven by forces + a 2D vector field over the terrain. Fluid solver later.
            </p>
            {!hasHeightfield && (
              <div className="side-panel__field">
                <p className="side-panel__hint">Heightmap optional but recommended (valley spawn / downhill field):</p>
                <button type="button" className="side-panel__button side-panel__button--accent" onClick={onApply}>
                  Use Noise map
                </button>
              </div>
            )}

            <ToggleRow
              label="Run particles"
              checked={particleWeather.enabled}
              onChange={(enabled) => patchParticles({ enabled })}
            />

            <div className="side-panel__section">Phenomenon</div>
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor="particle-phenomenon">Look</label>
              <select
                id="particle-phenomenon"
                className="side-panel__select"
                value={particleWeather.phenomenon}
                onChange={(e) => {
                  const phenomenon = e.target.value as WeatherPhenomenon
                  onParticleWeatherChange(applyPhenomenonPreset(particleWeather, phenomenon))
                }}
              >
                {PHENOMENA.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <p className="side-panel__hint">
              {PHENOMENA.find((p) => p.value === particleWeather.phenomenon)?.hint}
            </p>

            <div className="side-panel__section">Emitter</div>
            <ParamSlider
              id="particle-count"
              label="Max particles"
              value={particleWeather.count}
              min={100}
              max={2500}
              step={50}
              onChange={(count) => patchParticles({ count })}
            />
            <ParamSlider
              id="particle-spawn"
              label="Spawn / sec"
              value={particleWeather.spawnRate}
              min={10}
              max={400}
              step={10}
              onChange={(spawnRate) => patchParticles({ spawnRate })}
            />
            <ParamSlider
              id="particle-life"
              label="Lifetime (s)"
              value={particleWeather.lifetime}
              min={0.8}
              max={10}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(lifetime) => patchParticles({ lifetime })}
            />
            <ParamSlider
              id="particle-size"
              label="Point size"
              value={particleWeather.size}
              min={0.8}
              max={6}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(size) => patchParticles({ size })}
            />
            <ToggleRow
              label="Prefer valleys"
              checked={particleWeather.valleyBias}
              onChange={(valleyBias) => patchParticles({ valleyBias })}
            />

            <div className="side-panel__section">Vector field</div>
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor="particle-field">Field</label>
              <select
                id="particle-field"
                className="side-panel__select"
                value={particleWeather.fieldMode}
                onChange={(e) => patchParticles({ fieldMode: e.target.value as FieldMode })}
              >
                {FIELD_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <p className="side-panel__hint">
              Downhill uses −∇height from the heightmap. Curl noise is procedural wind. Vortex spins around the origin.
            </p>
            <ParamSlider
              id="particle-field-str"
              label="Field strength"
              value={particleWeather.fieldStrength}
              min={0}
              max={4}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(fieldStrength) => patchParticles({ fieldStrength })}
            />
            <ParamSlider
              id="particle-wind-x"
              label="Wind X"
              value={particleWeather.windX}
              min={-2}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(windX) => patchParticles({ windX })}
            />
            <ParamSlider
              id="particle-wind-z"
              label="Wind Z"
              value={particleWeather.windZ}
              min={-2}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(windZ) => patchParticles({ windZ })}
            />
            <ToggleRow
              label="Show field arrows"
              checked={particleWeather.showField}
              onChange={(showField) => patchParticles({ showField })}
            />

            <div className="side-panel__section">Forces</div>
            <ParamSlider
              id="particle-gravity"
              label="Gravity"
              value={particleWeather.gravity}
              min={0}
              max={2.5}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(gravity) => patchParticles({ gravity })}
            />
            <ParamSlider
              id="particle-drag"
              label="Drag"
              value={particleWeather.drag}
              min={0}
              max={0.4}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(drag) => patchParticles({ drag })}
            />

            <div className="side-panel__section">Trails</div>
            <ToggleRow
              label="Draw trails"
              checked={particleWeather.showTrails}
              onChange={(showTrails) => patchParticles({ showTrails })}
            />
            {particleWeather.showTrails && (
              <ParamSlider
                id="particle-trail-len"
                label="Trail length"
                value={particleWeather.trailLength}
                min={3}
                max={16}
                step={1}
                onChange={(trailLength) => patchParticles({ trailLength })}
              />
            )}
          </>
        )}

        {/* Below Class 06 module: Environment (2nd last), Camera (last) */}
        {section('environment', 'Environment', (
          <>
            <ParamSlider
              id="env-time"
              label="Time of Day"
              value={environment.timeOfDay}
              min={0}
              max={24}
              step={0.25}
              format={formatTimeOfDay}
              onChange={(v) => updateEnvironment('timeOfDay', v % 24)}
            />
            <button
              type="button"
              className={`side-panel__button ${environment.dayCycle ? '' : 'side-panel__button--accent'}`}
              onClick={() => updateEnvironment('dayCycle', !environment.dayCycle)}
            >
              {environment.dayCycle ? '■ Pause Day Cycle' : '▶ Play Day Cycle'}
            </button>
            <ParamSlider id="env-sun-azimuth" label="Sun Direction" value={environment.sunAzimuth} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => updateEnvironment('sunAzimuth', v)} />
            <ParamSlider id="env-sun-intensity" label="Sun Intensity" value={environment.sunIntensity} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateEnvironment('sunIntensity', v)} />
          </>
        ))}

        {section('camera', 'Camera', (
          <>
            <div className="side-panel__field side-panel__row">
              <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onResetCamera}>
                Reset
              </button>
              <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onStoreView}>
                Store View
              </button>
            </div>
            <div className="side-panel__field">
              <button type="button" className="side-panel__button" onClick={onRecallView} disabled={!hasStoredView}>
                Go to Stored View
              </button>
            </div>
            <PlannedRow label="Journey" />
          </>
        ))}
      </aside>
    )
  }

  // ═══════════════════════════════════════
  // 2D Terrain — generate, simulate, edit
  // Flat tabs like 3D World (Terrain / Scatter / …): content swaps below, no accordion.
  // ═══════════════════════════════════════
  const simulationVisible = subTab === 'simulation'

  return (
    <aside className="side-panel" aria-label="2D terrain controls">
      <nav className="sub-tabs sub-tabs--world" aria-label="2D canvas">
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'noise' ? 'sub-tabs__button--active' : ''}`}
          aria-pressed={subTab === 'noise'}
          onClick={() => onSubTabChange('noise')}
        >
          Noise
        </button>
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'simulation' ? 'sub-tabs__button--active' : ''}`}
          aria-pressed={subTab === 'simulation'}
          onClick={() => onSubTabChange('simulation')}
        >
          Simulation
        </button>
      </nav>

      {!simulationVisible && activeNoise && (() => {
        const layer = activeNoise
        const idx = activeNoiseIndex
        const fractal = usesFractalControls(layer.params.type)
        const cellular = usesCellular(layer.params.type)
        const showWarp = usesWarpControls(layer.shaping)
        const info = NOISE_TYPES.find((t) => t.value === layer.params.type)
        const shapingInfo = SHAPING_OPS.find((s) => s.value === layer.shaping.op)
        const class03Shaping = SHAPING_OPS.filter((s) => s.group === 'class03')
        const extraShaping = SHAPING_OPS.filter((s) => s.group === 'extra')

        return (
          <>
            <p className="side-panel__hint">
              Class 03: pick a noise equation, then a shaping modifier. Layers blend into one heightmap.
            </p>

            {layers.length > 1 && (
              <div className="side-panel__field">
                <label className="side-panel__label" htmlFor="noise-active-layer">Edit layer</label>
                <select
                  id="noise-active-layer"
                  className="side-panel__select"
                  value={layer.id}
                  onChange={(e) => setSelectedNoiseId(e.target.value)}
                >
                  {layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {idx > 0 && (
              <ParamSlider
                id={`opacity-${layer.id}`}
                label="Mix strength"
                value={layer.opacity}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => updateLayer(layer.id, { opacity: v })}
              />
            )}

            <div className="side-panel__section">Noise equation</div>
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor={`type-${layer.id}`}>Equation</label>
              <select
                id={`type-${layer.id}`}
                className="side-panel__select"
                value={layer.params.type}
                onChange={(e) => updateLayerParams(layer.id, { type: e.target.value as NoiseParams['type'] })}
              >
                {NOISE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {NOISE_TYPES.filter((t) => t.group === g).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {info && <p className="side-panel__hint">{info.description}</p>}

            <div className="side-panel__section">Shaping</div>
            <div className="side-panel__field">
              <label className="side-panel__label" htmlFor={`shaping-${layer.id}`}>Modifier</label>
              <select
                id={`shaping-${layer.id}`}
                className="side-panel__select"
                value={layer.shaping.op}
                onChange={(e) => updateLayerShaping(layer.id, { op: e.target.value as ShapingParams['op'] })}
              >
                <optgroup label="Class 03">
                  {class03Shaping.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Extra">
                  {extraShaping.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            {shapingInfo && layer.shaping.op !== 'none' && (
              <p className="side-panel__hint">{shapingInfo.description}</p>
            )}
            {layer.shaping.op === 'power' && (
              <ParamSlider id={`shp-pow-${layer.id}`} label="Exponent" value={layer.shaping.power} min={0.1} max={6} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerShaping(layer.id, { power: v })} />
            )}
            {layer.shaping.op === 'smoothstep' && (
              <>
                <ParamSlider id={`shp-ssmin-${layer.id}`} label="Edge Min" value={layer.shaping.smoothstepMin} min={0} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { smoothstepMin: v })} />
                <ParamSlider id={`shp-ssmax-${layer.id}`} label="Edge Max" value={layer.shaping.smoothstepMax} min={0.1} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { smoothstepMax: v })} />
              </>
            )}
            {layer.shaping.op === 'terrace' && (
              <ParamSlider id={`shp-ter-${layer.id}`} label="Steps" value={layer.shaping.terraceSteps} min={2} max={20} onChange={(v) => updateLayerShaping(layer.id, { terraceSteps: v })} />
            )}
            {layer.shaping.op === 'clamp' && (
              <>
                <ParamSlider id={`shp-clmin-${layer.id}`} label="Clamp Min" value={layer.shaping.clampMin} min={0} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { clampMin: v })} />
                <ParamSlider id={`shp-clmax-${layer.id}`} label="Clamp Max" value={layer.shaping.clampMax} min={0.1} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerShaping(layer.id, { clampMax: v })} />
              </>
            )}
            {layer.shaping.op === 'quantize' && (
              <ParamSlider id={`shp-qnt-${layer.id}`} label="Levels" value={layer.shaping.quantizeLevels} min={2} max={16} onChange={(v) => updateLayerShaping(layer.id, { quantizeLevels: v })} />
            )}

            <div className="side-panel__section">Parameters</div>
            <ParamSlider id={`scale-${layer.id}`} label="Scale" value={layer.params.scale} min={0.5} max={60} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { scale: v })} />
            <ToggleRow label="Invert" checked={layer.params.invert} onChange={(invert) => updateLayerParams(layer.id, { invert })} />

            {fractal && (
              <>
                <ParamSlider id={`oct-${layer.id}`} label="Octaves" value={layer.params.octaves} min={1} max={10} onChange={(v) => updateLayerParams(layer.id, { octaves: v })} />
                <ParamSlider id={`per-${layer.id}`} label="Persistence" value={layer.params.persistence} min={0.05} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerParams(layer.id, { persistence: v })} />
                <ParamSlider id={`lac-${layer.id}`} label="Lacunarity" value={layer.params.lacunarity} min={1.2} max={4} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { lacunarity: v })} />
              </>
            )}

            {showWarp && (
              <ParamSlider id={`warp-${layer.id}`} label="Warp Strength" value={layer.params.warpStrength} min={0} max={12} step={0.2} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { warpStrength: v })} />
            )}

            {cellular && (
              <>
                <div className="side-panel__field">
                  <label className="side-panel__label" htmlFor={`dist-${layer.id}`}>Distance</label>
                  <select id={`dist-${layer.id}`} className="side-panel__select" value={layer.params.distanceMetric} onChange={(e) => updateLayerParams(layer.id, { distanceMetric: e.target.value as NoiseParams['distanceMetric'] })}>
                    {DISTANCE_METRICS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {layer.params.type === 'worley' && (
                  <div className="side-panel__field">
                    <label className="side-panel__label" htmlFor={`cell-${layer.id}`}>Return</label>
                    <select id={`cell-${layer.id}`} className="side-panel__select" value={layer.params.cellReturn} onChange={(e) => updateLayerParams(layer.id, { cellReturn: e.target.value as NoiseParams['cellReturn'] })}>
                      {CELL_RETURNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="side-panel__section">Seed</div>
            <div className="side-panel__field">
              <div className="side-panel__row">
                <span className="side-panel__label">Value</span>
                <span className="side-panel__value">{layer.params.seed}</span>
              </div>
              <button type="button" className="side-panel__button" onClick={() => updateLayerParams(layer.id, { seed: Math.floor(Math.random() * 100000) })}>
                Randomize
              </button>
            </div>

            <div className="side-panel__section">Output</div>
            <ParamSlider
              id="noise-field-size"
              label="Heightmap Resolution"
              value={sceneParams.noiseFieldSize}
              min={32}
              max={1024}
              step={32}
              format={(v) => `${v}²`}
              onChange={(v) => updateScene('noiseFieldSize', v)}
            />
            <div className="side-panel__row">
              <span className="side-panel__label">Map Offset</span>
              <span className="side-panel__value">
                {mapOffset.x.toFixed(2)}, {mapOffset.y.toFixed(2)}
              </span>
            </div>
            <div className="side-panel__row">
              <span className="side-panel__hint">Arrow keys scroll · Shift = fast</span>
              <button
                type="button"
                className="side-panel__button"
                onClick={onResetOffset}
                disabled={mapOffset.x === 0 && mapOffset.y === 0}
              >
                Recenter
              </button>
            </div>

            <div className="side-panel__field side-panel__row">
              <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onLoadPreset}>
                Reset Preset
              </button>
              <button type="button" className="side-panel__button side-panel__button--accent" style={{ flex: 1 }} onClick={onApply}>
                Send to 3D
              </button>
            </div>
          </>
        )
      })()}

      {simulationVisible && (
        <>
          <div className="side-panel__section">Hydraulic Erosion</div>
          <p className="side-panel__hint">
            Erodes the current noise layers. Progress is kept when you switch views.
          </p>

          <div className="side-panel__field side-panel__row">
            {!erosionRunning ? (
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                onClick={erosionState ? onStartErosion : onGenerateBase}
              >
                {erosionState ? '▶ Start' : 'Generate'}
              </button>
            ) : (
              <button
                type="button"
                className="side-panel__button side-panel__button--accent"
                style={{ flex: 1 }}
                onClick={onStopErosion}
              >
                ■ Stop
              </button>
            )}
            <button
              type="button"
              className="side-panel__button"
              style={{ flex: 1 }}
              onClick={onResetErosion}
              disabled={erosionRunning}
            >
              Reset
            </button>
          </div>

          {erosionState && (
            <div className="side-panel__field">
              <div className="side-panel__row">
                <span className="side-panel__label">Drops</span>
                <span className="side-panel__value">
                  {erosionState.totalDroplets.toLocaleString()}
                </span>
                <span className="side-panel__value">
                  {erosionParams.mapSize}²
                </span>
                <span className="side-panel__value" style={{ color: erosionRunning ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {erosionRunning ? 'running' : 'paused'}
                </span>
              </div>
            </div>
          )}

          <div className="side-panel__field">
            <button
              type="button"
              className="side-panel__button side-panel__button--accent"
              onClick={onApplyErosion}
              disabled={!erosionState}
            >
              Send Simulation to 3D
            </button>
          </div>
          <ToggleRow label="Live Sync to 3D" checked={liveSync} onChange={onLiveSyncChange} />

          <div className="side-panel__section">Rain</div>
          <ParamSlider id="ero-droplets" label="Drops / Frame" value={erosionParams.dropletsPerStep} min={50} max={2000} step={50} onChange={(v) => updateErosion('dropletsPerStep', v)} />
          <ParamSlider id="ero-lifetime" label="Lifetime" value={erosionParams.maxLifetime} min={8} max={128} step={4} onChange={(v) => updateErosion('maxLifetime', v)} />
          <ParamSlider id="ero-water" label="Water" value={erosionParams.initialWater} min={0.1} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('initialWater', v)} />
          <ParamSlider id="ero-evaporation" label="Evaporation" value={erosionParams.evaporationRate} min={0} max={0.1} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => updateErosion('evaporationRate', v)} />

          <div className="side-panel__section">Sediment</div>
          <ParamSlider id="ero-capacity" label="Capacity" value={erosionParams.sedimentCapacity} min={0.5} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('sedimentCapacity', v)} />
          <ParamSlider id="ero-deposit" label="Deposition" value={erosionParams.depositRate} min={0.01} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('depositRate', v)} />
          <ParamSlider id="ero-erode" label="Erosion" value={erosionParams.erodeRate} min={0.01} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('erodeRate', v)} />
          <ParamSlider id="ero-brush" label="Brush Radius" value={erosionParams.brushRadius} min={1} max={8} step={1} onChange={(v) => updateErosion('brushRadius', v)} />

          <div className="side-panel__section">Flow</div>
          <ParamSlider id="ero-friction" label="Inertia" value={1 - erosionParams.friction} min={0.7} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => updateErosion('friction', 1 - v)} />
          <ParamSlider id="ero-gravity" label="Gravity" value={erosionParams.gravity} min={1} max={20} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateErosion('gravity', v)} />
          <ParamSlider id="ero-minspeed" label="Min Slope" value={erosionParams.minSpeed} min={0.001} max={0.1} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => updateErosion('minSpeed', v)} />
          <ParamSlider id="ero-mapsize" label="Map Size" value={erosionParams.mapSize} min={64} max={1024} step={64} format={(v) => `${v}px`} onChange={(v) => updateErosion('mapSize', v)} />
        </>
      )}

      {section('analysis', 'Analysis', (
        <>
          <div className="side-panel__row">
            <span className="side-panel__label">Height</span>
            <span className="side-panel__badge side-panel__badge--active">active</span>
          </div>
          <PlannedRow label="Slope" />
          <PlannedRow label="Water" />
          <PlannedRow label="Sediment" />

          <div className="side-panel__field">
            <label className="side-panel__label" htmlFor="analysis-color">Preview tint</label>
            <p className="side-panel__hint">
              Display only — noise itself is always a 0…1 grayscale height. Gray matches Class 03.
            </p>
            {simulationVisible ? (
              <select id="analysis-color" className="side-panel__select" value={erosionColorMode} onChange={(e) => onErosionColorModeChange(e.target.value as ColorMode)}>
                {COLOR_MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <select
                id="analysis-color"
                className="side-panel__select"
                value={layers[0]?.params.colorMode ?? 'grayscale'}
                onChange={(e) => {
                  const mode = e.target.value as NoiseParams['colorMode']
                  onLayersChange(layers.map((l) => ({ ...l, params: { ...l.params, colorMode: mode } })))
                }}
              >
                {COLOR_MODES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {!simulationVisible && (
            <ParamSlider
              id="noise-resolution"
              label="Preview Resolution"
              value={layers[0]?.params.resolution ?? 512}
              min={64}
              max={1024}
              step={64}
              format={(v) => `${v}px`}
              onChange={(v) => onLayersChange(layers.map((l) => ({ ...l, params: { ...l.params, resolution: v } })))}
            />
          )}
        </>
      ))}
    </aside>
  )
}
