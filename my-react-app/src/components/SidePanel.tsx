import { useState, type ReactNode } from 'react'
import ParamSlider from './ParamSlider'
import type { ViewMode } from './ViewSwitcher'
import type { SceneParams, ViewportParams } from './ThreeCanvas'
import {
  BLEND_MODES,
  CELL_RETURNS,
  COLOR_MODES,
  DISTANCE_METRICS,
  NOISE_GROUPS,
  NOISE_TYPES,
  SHAPING_OPS,
  createLayer,
  usesCellular,
  usesFractal,
  type ColorMode,
  type NoiseLayer,
  type NoiseParams,
  type ShapingParams,
} from '../lib/noise'
import type { ErosionParams, ErosionState } from '../lib/erosion'
import {
  WEATHER_PRESETS,
  WEATHERS,
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
import './SidePanel.css'

export type SubTab = 'noise' | 'simulation'

type SectionId =
  // 3D World
  | 'display'
  | 'geometry'
  | 'environment'
  | 'camera'
  | 'world'
  // 2D Terrain — Noise tab
  | 'layers'
  | 'noiseOutput'
  // 2D Terrain — Simulation tab
  | 'simulation'
  // 2D Terrain — both tabs
  | 'analysis'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  display: true,
  geometry: true,
  environment: false,
  camera: false,
  world: false,
  layers: false,
  noiseOutput: true,
  simulation: true,
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
}: SidePanelProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN)

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

  const addLayer = () => {
    const layer = createLayer({
      name: `Layer ${layers.length + 1}`,
      blendMode: 'add',
      opacity: 0.5,
      params: {
        ...layers[0].params,
        type: 'worley',
        seed: Math.floor(Math.random() * 100000),
      },
    })
    onLayersChange([...layers, layer])
    setExpandedLayer(layer.id)
  }

  const removeLayer = (id: string) => {
    if (layers.length <= 1) return
    const next = layers.filter((l) => l.id !== id)
    onLayersChange(next)
    if (expandedLayer === id) setExpandedLayer(next[0]?.id ?? null)
  }

  const moveLayer = (id: string, dir: -1 | 1) => {
    const idx = layers.findIndex((l) => l.id === id)
    const target = idx + dir
    if (target < 0 || target >= layers.length) return
    const copy = [...layers]
    const tmp = copy[idx]
    copy[idx] = copy[target]
    copy[target] = tmp
    onLayersChange(copy)
  }

  // ═══════════════════════════════════════
  // 3D World — visualize, inspect, experience
  // ═══════════════════════════════════════
  if (view === '3d') {
    return (
      <aside className="side-panel" aria-label="3D world controls">
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

        {section('geometry', 'Geometry', (
          <>
            <div className="side-panel__field">
              <span className="side-panel__label">Terrain</span>
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
              Clicking Noise or Sim loads the latest map from 2D Terrain.
            </p>
            {erosionState && (
              <>
                <ToggleRow label="Live Sync to 3D" checked={liveSync} onChange={onLiveSyncChange} />
                <button
                  type="button"
                  className="side-panel__button side-panel__button--accent"
                  onClick={erosionRunning ? onStopErosion : onStartErosion}
                >
                  {erosionRunning ? '■ Stop Erosion' : '▶ Run Erosion'}
                </button>
              </>
            )}
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
              label="Displacement"
              value={sceneParams.displacementScale}
              min={0}
              max={6}
              step={0.1}
              format={(v) => v.toFixed(2)}
              onChange={(v) => updateScene('displacementScale', v)}
            />
            {heightfieldSize !== null && (
              <p className="side-panel__hint">
                {sceneParams.planeSegments < heightfieldSize
                  ? `Plane ${sceneParams.planeSegments} < map ${heightfieldSize}² — terrain detail is lost. Raise Plane Resolution to ${heightfieldSize}.`
                  : `Plane ${sceneParams.planeSegments} ≥ map ${heightfieldSize}² — every height sample is shown.`}
              </p>
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
        ))}

        {section('environment', 'Environment', (
          <>
            <ToggleRow label="Fog" checked={sceneParams.fog} onChange={(v) => updateScene('fog', v)} />

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

            <span className="side-panel__label">Weather</span>
            <nav className="sub-tabs" aria-label="Weather">
              {WEATHERS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`sub-tabs__button ${environment.weather === w ? 'sub-tabs__button--active' : ''}`}
                  aria-pressed={environment.weather === w}
                  onClick={() => onEnvironmentChange({ ...environment, weather: w, cloudCover: WEATHER_PRESETS[w].cloudCover })}
                >
                  {WEATHER_PRESETS[w].label}
                </button>
              ))}
            </nav>

            <ToggleRow label="Clouds" checked={environment.clouds} onChange={(v) => updateEnvironment('clouds', v)} />
            {environment.clouds && (
              <ParamSlider id="env-cloud-cover" label="Cloud Cover" value={environment.cloudCover} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => updateEnvironment('cloudCover', v)} />
            )}
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

        {section('world', 'World', (
          <>
            <PlannedRow label="Vegetation" />
            <PlannedRow label="Settlement" />
          </>
        ))}
      </aside>
    )
  }

  // ═══════════════════════════════════════
  // 2D Terrain — generate, simulate, edit
  // ═══════════════════════════════════════
  const simulationVisible = subTab === 'simulation'

  return (
    <aside className="side-panel" aria-label="2D terrain controls">
      <nav className="sub-tabs" aria-label="2D canvas">
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'noise' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onSubTabChange('noise')}
        >
          Noise
        </button>
        <button
          type="button"
          className={`sub-tabs__button ${subTab === 'simulation' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onSubTabChange('simulation')}
        >
          Simulation
        </button>
      </nav>

      {!simulationVisible && section('layers', 'Layers', (
        <>
          <div className="layer-list">
            {layers.map((layer, idx) => {
              const isExpanded = expandedLayer === layer.id
              const fractal = usesFractal(layer.params.type)
              const cellular = usesCellular(layer.params.type)
              const isDomainWarp = layer.params.type === 'domainWarp'
              const info = NOISE_TYPES.find((t) => t.value === layer.params.type)
              const shapingInfo = SHAPING_OPS.find((s) => s.value === layer.shaping.op)

              return (
                <div
                  key={layer.id}
                  className={`layer-card ${isExpanded ? 'layer-card--expanded' : ''}`}
                >
                  <div className="layer-card__header">
                    <label className="side-panel__toggle layer-card__vis">
                      <input
                        type="checkbox"
                        checked={layer.visible}
                        onChange={(e) => updateLayer(layer.id, { visible: e.target.checked })}
                      />
                      <span className="side-panel__toggle-track" />
                    </label>

                    <button
                      type="button"
                      className="layer-card__name"
                      onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                    >
                      {layer.name}
                    </button>

                    <span className="layer-card__type">{layer.params.type}</span>

                    <div className="layer-card__actions">
                      <button type="button" title="Move up" disabled={idx === 0} onClick={() => moveLayer(layer.id, -1)}>↑</button>
                      <button type="button" title="Move down" disabled={idx === layers.length - 1} onClick={() => moveLayer(layer.id, 1)}>↓</button>
                      <button type="button" title="Remove" disabled={layers.length <= 1} onClick={() => removeLayer(layer.id)}>×</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="layer-card__body">
                      {idx > 0 && (
                        <>
                          <div className="side-panel__section">Blend</div>
                          <div className="side-panel__field">
                            <label className="side-panel__label" htmlFor={`blend-${layer.id}`}>Mode</label>
                            <select id={`blend-${layer.id}`} className="side-panel__select" value={layer.blendMode} onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as NoiseLayer['blendMode'] })}>
                              {BLEND_MODES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                            </select>
                          </div>
                          <ParamSlider id={`opacity-${layer.id}`} label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateLayer(layer.id, { opacity: v })} />
                        </>
                      )}

                      <div className="side-panel__section">Type</div>
                      <div className="side-panel__field">
                        <label className="side-panel__label" htmlFor={`type-${layer.id}`}>Noise Type</label>
                        <select id={`type-${layer.id}`} className="side-panel__select" value={layer.params.type} onChange={(e) => updateLayerParams(layer.id, { type: e.target.value as NoiseParams['type'] })}>
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

                      <div className="side-panel__section">Shape</div>
                      <ParamSlider id={`scale-${layer.id}`} label="Scale" value={layer.params.scale} min={0.5} max={60} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { scale: v })} />
                      <ParamSlider id={`power-${layer.id}`} label="Power" value={layer.params.power} min={0.2} max={5} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { power: v })} />
                      <div className="side-panel__field">
                        <div className="side-panel__row">
                          <span className="side-panel__label">Invert</span>
                          <label className="side-panel__toggle">
                            <input type="checkbox" checked={layer.params.invert} onChange={(e) => updateLayerParams(layer.id, { invert: e.target.checked })} />
                            <span className="side-panel__toggle-track" />
                          </label>
                        </div>
                      </div>

                      <div className="side-panel__section">Shaping</div>
                      <div className="side-panel__field">
                        <label className="side-panel__label" htmlFor={`shaping-${layer.id}`}>Operation</label>
                        <select id={`shaping-${layer.id}`} className="side-panel__select" value={layer.shaping.op} onChange={(e) => updateLayerShaping(layer.id, { op: e.target.value as ShapingParams['op'] })}>
                          {SHAPING_OPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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

                      {fractal && (
                        <>
                          <div className="side-panel__section">Fractal</div>
                          <ParamSlider id={`oct-${layer.id}`} label="Octaves" value={layer.params.octaves} min={1} max={10} onChange={(v) => updateLayerParams(layer.id, { octaves: v })} />
                          <ParamSlider id={`per-${layer.id}`} label="Persistence" value={layer.params.persistence} min={0.05} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateLayerParams(layer.id, { persistence: v })} />
                          <ParamSlider id={`lac-${layer.id}`} label="Lacunarity" value={layer.params.lacunarity} min={1.2} max={4} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { lacunarity: v })} />
                        </>
                      )}

                      {isDomainWarp && (
                        <>
                          <div className="side-panel__section">Warp</div>
                          <ParamSlider id={`warp-${layer.id}`} label="Warp Strength" value={layer.params.warpStrength} min={0} max={12} step={0.2} format={(v) => v.toFixed(1)} onChange={(v) => updateLayerParams(layer.id, { warpStrength: v })} />
                        </>
                      )}

                      {cellular && (
                        <>
                          <div className="side-panel__section">Cellular</div>
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="side-panel__field">
            <button type="button" className="side-panel__button side-panel__button--accent" onClick={addLayer}>
              + Add Layer
            </button>
            <button type="button" className="side-panel__button" onClick={onLoadPreset}>
              Load Calibrated Terrain
            </button>
          </div>
        </>
      ))}

      {!simulationVisible && section('noiseOutput', 'Heightmap Output', (
        <>
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
          <p className="side-panel__hint">
            Pixel size of the noise heightmap sent to 3D.
            {hasAppliedMap && appliedSource === 'noise' ? ' Send again to update 3D.' : ''}
          </p>
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
          <div className="side-panel__field">
            <button type="button" className="side-panel__button side-panel__button--accent" onClick={onApply}>
              Send Noise to 3D
            </button>
          </div>
        </>
      ))}

      {simulationVisible && section('simulation', 'Hydraulic Erosion', (
        <>
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
      ))}

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
            <label className="side-panel__label" htmlFor="analysis-color">Height Color</label>
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
