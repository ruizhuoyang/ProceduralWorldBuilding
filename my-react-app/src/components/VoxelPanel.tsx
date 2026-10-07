import { useState } from 'react'
import ParamSlider from './ParamSlider'
import { ToggleRow } from './SidePanel'
import type { VoxelDisplay } from './VoxelCanvas'
import type { Vec3 } from '../lib/voxel/densityGrid'
import { CHUNK_SIZES } from '../lib/voxel/chunks'
import { CSG_OPS, type CsgOp } from '../lib/voxel/csg'
import { createShape, SHAPE_TYPES, type DensityShape, type DensityShapeType } from '../lib/voxel/densityShapes'
import {
  createDefaultVoxelParams,
  createOperation,
  type VoxelOperation,
  type VoxelParams,
  type VoxelSource,
} from '../lib/voxel/voxelField'
import type { HydroParams } from '../lib/voxel/hydrology'
import type { ShaderStudyMode, ShaderStudyParams } from '../lib/shaders/types'
import { ShaderStudyControls } from './ShaderPanel'
import './SidePanel.css'

export type VoxelWorkspace = 'field' | 'shaders'

type VoxelPanelProps = {
  workspace: VoxelWorkspace
  onWorkspaceChange: (workspace: VoxelWorkspace) => void
  params: VoxelParams
  onParamsChange: (params: VoxelParams) => void
  display: VoxelDisplay
  onDisplayChange: (display: VoxelDisplay) => void
  /** Cells per chunk edge. */
  chunkSize: number
  onChunkSizeChange: (size: number) => void
  hydro: HydroParams
  onHydroChange: (params: HydroParams) => void
  hydroRunning: boolean
  onHydroRunningChange: (running: boolean) => void
  onHydroRain: () => void
  onHydroStep: () => void
  onHydroReset: () => void
  totalWater: number
  shaderMode: ShaderStudyMode
  onShaderModeChange: (mode: ShaderStudyMode) => void
  shaderParams: ShaderStudyParams
  onShaderParamsChange: (params: ShaderStudyParams) => void
  stats: {
    samples: number
    solid: number | null
    surface: number | null
    triangles: number | null
    vertices: number | null
    chunks: number | null
    activeChunks: number | null
  }
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="side-panel__row">
      <span className="side-panel__label">{label}</span>
      <span className="side-panel__value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}

const AXES = ['X', 'Y', 'Z'] as const

const shapeLabel = (type: DensityShapeType) => SHAPE_TYPES.find((s) => s.value === type)?.label ?? type
const opLabel = (op: CsgOp) => CSG_OPS.find((o) => o.value === op)?.label ?? op

function Vec3Sliders({ id, label, value, min, max, onChange }: {
  id: string
  label: string
  value: Vec3
  min: number
  max: number
  onChange: (value: Vec3) => void
}) {
  return AXES.map((axis, i) => (
    <ParamSlider
      key={axis}
      id={`${id}-${axis}`}
      label={`${label} ${axis}`}
      value={value[i]}
      min={min}
      max={max}
      step={0.05}
      format={(v) => v.toFixed(2)}
      onChange={(v) => {
        const next = [...value] as Vec3
        next[i] = v
        onChange(next)
      }}
    />
  ))
}

function ShapeControls({ id, shape, half, onChange }: {
  id: string
  shape: DensityShape
  half: number
  onChange: (shape: DensityShape) => void
}) {
  const center = (
    <Vec3Sliders
      id={`${id}-center`}
      label={shape.type === 'noise' ? 'Offset' : 'Center'}
      value={shape.center}
      min={-half}
      max={half}
      onChange={(c) => onChange({ ...shape, center: c })}
    />
  )

  switch (shape.type) {
    case 'sphere':
      return (
        <>
          <ParamSlider id={`${id}-radius`} label="Radius" value={shape.radius} min={0.25} max={half} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ ...shape, radius: v })} />
          {center}
        </>
      )
    case 'box':
      return (
        <>
          <Vec3Sliders id={`${id}-size`} label="Size" value={shape.size} min={0.25} max={half * 2} onChange={(s) => onChange({ ...shape, size: s })} />
          {center}
        </>
      )
    case 'noise':
      return (
        <>
          <ParamSlider id={`${id}-scale`} label="Noise Scale" value={shape.scale} min={0.1} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ ...shape, scale: v })} />
          <ParamSlider id={`${id}-threshold`} label="Threshold" value={shape.threshold} min={-0.6} max={0.6} step={0.02} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ ...shape, threshold: v })} />
          {center}
          <button type="button" className="side-panel__button" onClick={() => onChange({ ...shape, seed: Math.floor(Math.random() * 100000) })}>
            Randomize Seed
          </button>
        </>
      )
  }
}

export default function VoxelPanel({
  workspace,
  onWorkspaceChange,
  params,
  onParamsChange,
  display,
  onDisplayChange,
  chunkSize,
  onChunkSizeChange,
  hydro,
  onHydroChange,
  hydroRunning,
  onHydroRunningChange,
  onHydroRain,
  onHydroStep,
  onHydroReset,
  totalWater,
  shaderMode,
  onShaderModeChange,
  shaderParams,
  onShaderParamsChange,
  stats,
}: VoxelPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(params.operations[0]?.id ?? null)
  const [newShape, setNewShape] = useState<DensityShapeType>('sphere')
  const [newOp, setNewOp] = useState<CsgOp>('union')

  const update = <Key extends keyof VoxelParams>(key: Key, value: VoxelParams[Key]) =>
    onParamsChange({ ...params, [key]: value })
  const updateHydro = <Key extends keyof HydroParams>(key: Key, value: HydroParams[Key]) =>
    onHydroChange({ ...hydro, [key]: value })
  const updateHeightfield = <Key extends keyof VoxelParams['heightfield']>(
    key: Key,
    value: VoxelParams['heightfield'][Key],
  ) => onParamsChange({ ...params, heightfield: { ...params.heightfield, [key]: value } })
  const setSource = (source: VoxelSource) => onParamsChange({ ...params, source })
  const ops = params.operations
  const setOps = (next: VoxelOperation[]) => update('operations', next)
  const patchOp = (id: string, patch: Partial<VoxelOperation>) =>
    setOps(ops.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const half = params.extent / 2
  const isHeightfield = params.source === 'heightfield'

  const addOp = () => {
    const op = createOperation(newOp, createShape(newShape))
    setOps([...ops, op])
    setExpandedId(op.id)
  }
  const removeOp = (id: string) => setOps(ops.filter((o) => o.id !== id))
  const moveOp = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= ops.length) return
    const next = [...ops]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOps(next)
  }
  const resetField = () => {
    const fresh = createDefaultVoxelParams()
    // Keep the active terrain source so Reset doesn't yank the user across tabs.
    onParamsChange({ ...fresh, source: params.source })
    setExpandedId(fresh.operations[0].id)
  }

  return (
    <aside className="side-panel" aria-label="Voxel terrain controls">
      <div className="side-panel__section">Mode</div>
      <nav className="workspace-tabs" aria-label="Voxel mode">
        <button
          type="button"
          className={`workspace-tabs__button ${workspace === 'field' ? 'workspace-tabs__button--active' : ''}`}
          onClick={() => onWorkspaceChange('field')}
        >
          Field
        </button>
        <button
          type="button"
          className={`workspace-tabs__button ${workspace === 'shaders' ? 'workspace-tabs__button--active' : ''}`}
          onClick={() => onWorkspaceChange('shaders')}
        >
          Shaders
        </button>
      </nav>
      <p className="side-panel__hint">
        {workspace === 'shaders'
          ? 'Class 05 water shaders (deform, contact, ripple, particles).'
          : 'Class 04 density, CSG, Marching Cubes, and hydrology.'}
      </p>

      {workspace === 'shaders' && (
        <ShaderStudyControls
          mode={shaderMode}
          onModeChange={onShaderModeChange}
          params={shaderParams}
          onParamsChange={onShaderParamsChange}
        />
      )}

      {workspace === 'field' && (
      <>
      <div className="side-panel__section">Surface</div>
      <nav className="sub-tabs" aria-label="Voxel view mode">
        <button
          type="button"
          className={`sub-tabs__button ${display.mode === 'mesh' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onDisplayChange({ ...display, mode: 'mesh' })}
        >
          MC Mesh
        </button>
        <button
          type="button"
          className={`sub-tabs__button ${display.mode === 'debug' ? 'sub-tabs__button--active' : ''}`}
          onClick={() => onDisplayChange({ ...display, mode: 'debug' })}
        >
          Density Debug
        </button>
      </nav>
      <ParamSlider id="voxel-iso" label="Iso Level" value={params.isoLevel} min={-2} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => update('isoLevel', v)} />

      <div className="side-panel__section">Terrain Source</div>
      <nav className="sub-tabs" aria-label="Voxel terrain source">
        <button
          type="button"
          className={`sub-tabs__button ${isHeightfield ? 'sub-tabs__button--active' : ''}`}
          onClick={() => setSource('heightfield')}
        >
          Heightfield
        </button>
        <button
          type="button"
          className={`sub-tabs__button ${!isHeightfield ? 'sub-tabs__button--active' : ''}`}
          onClick={() => setSource('csg')}
        >
          CSG Shapes
        </button>
      </nav>

      <div className="side-panel__section">Density Grid</div>
      <ParamSlider id="voxel-resolution" label="Resolution" value={params.resolution} min={8} max={64} step={2} format={(v) => `${v}³`} onChange={(v) => update('resolution', v)} />
      <ParamSlider id="voxel-extent" label="Extent" value={params.extent} min={2} max={16} step={0.5} format={(v) => v.toFixed(1)} onChange={(v) => update('extent', v)} />

      {isHeightfield && (
        <>
          <div className="side-panel__section">Heightfield Terrain</div>
          <ParamSlider
            id="voxel-hf-height"
            label="Height Scale"
            value={params.heightfield.heightScale}
            min={0.5}
            max={params.extent}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => updateHeightfield('heightScale', v)}
          />
          <ParamSlider
            id="voxel-hf-scale"
            label="Noise Scale"
            value={params.heightfield.noiseScale}
            min={0.5}
            max={8}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => updateHeightfield('noiseScale', v)}
          />
          <ParamSlider
            id="voxel-hf-octaves"
            label="Octaves"
            value={params.heightfield.octaves}
            min={1}
            max={8}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => updateHeightfield('octaves', v)}
          />
          <ParamSlider
            id="voxel-hf-power"
            label="Power"
            value={params.heightfield.power}
            min={0.6}
            max={2.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => updateHeightfield('power', v)}
          />
          <ParamSlider
            id="voxel-hf-map"
            label="Map Size"
            value={params.heightfield.mapSize}
            min={32}
            max={256}
            step={16}
            format={(v) => `${v}²`}
            onChange={(v) => updateHeightfield('mapSize', v)}
          />
          <button
            type="button"
            className="side-panel__button side-panel__button--accent"
            onClick={() => updateHeightfield('seed', Math.floor(Math.random() * 100000))}
          >
            Randomize Seed ({params.heightfield.seed})
          </button>
          <p className="side-panel__hint">
            Voxel-local fBm heightmap (independent of 2D Terrain). Rain will pool in the valleys.
          </p>
        </>
      )}

      {display.mode === 'mesh' && (
        <>
          <div className="side-panel__section">Chunks</div>
          <ToggleRow label="Chunked Meshing" checked={display.chunked} onChange={(v) => onDisplayChange({ ...display, chunked: v })} />
          {display.chunked && (
            <>
              <div className="side-panel__field">
                <label className="side-panel__label" htmlFor="voxel-chunk-size">Chunk Size (cells)</label>
                <select id="voxel-chunk-size" className="side-panel__select" value={chunkSize} onChange={(e) => onChunkSizeChange(Number(e.target.value))}>
                  {CHUNK_SIZES.map((s) => <option key={s} value={s}>{s}³</option>)}
                </select>
              </div>
              <ToggleRow label="Chunk Bounds" checked={display.chunkBounds} onChange={(v) => onDisplayChange({ ...display, chunkBounds: v })} />
              <ToggleRow label="Tint Chunks" checked={display.chunkTint} onChange={(v) => onDisplayChange({ ...display, chunkTint: v })} />
            </>
          )}
        </>
      )}

      <div className="side-panel__section">Hydrology</div>
      <ToggleRow label="Show Water" checked={display.showWater} onChange={(v) => onDisplayChange({ ...display, showWater: v })} />
      <ParamSlider id="hydro-rain-amount" label="Drop Depth" value={hydro.rainAmount} min={0.01} max={0.2} step={0.005} format={(v) => v.toFixed(3)} onChange={(v) => updateHydro('rainAmount', v)} />
      <ParamSlider id="hydro-rain-columns" label="Drop Count" value={hydro.rainColumns} min={20} max={400} step={10} format={(v) => String(v)} onChange={(v) => updateHydro('rainColumns', v)} />
      <ParamSlider id="hydro-flow" label="Flow Rate" value={hydro.flowRate} min={0.05} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateHydro('flowRate', v)} />
      <ParamSlider id="hydro-evap" label="Evaporation" value={hydro.evaporation} min={0} max={0.05} step={0.001} format={(v) => v.toFixed(3)} onChange={(v) => updateHydro('evaporation', v)} />
      <div className="side-panel__row">
        <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onHydroRain}>
          Add Rain
        </button>
        <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onHydroStep} disabled={hydroRunning}>
          Step
        </button>
      </div>
      <div className="side-panel__row">
        <button
          type="button"
          className={`side-panel__button ${hydroRunning ? '' : 'side-panel__button--accent'}`}
          style={{ flex: 1 }}
          onClick={() => onHydroRunningChange(!hydroRunning)}
        >
          {hydroRunning ? '■ Stop' : '▶ Run'}
        </button>
        <button type="button" className="side-panel__button" style={{ flex: 1 }} onClick={onHydroReset}>
          Reset Water
        </button>
      </div>
      <StatRow label="Total Water" value={Number(totalWater.toFixed(2))} />
      <p className="side-panel__hint">
        Tiny drops fall as particles, then gravity-flow into valleys. Best at resolution ≤ 48³.
      </p>

      {!isHeightfield && (
        <>
          <div className="side-panel__section">Operations (top → bottom)</div>
          <div className="layer-list">
            {ops.map((step, index) => {
              const isBase = index === 0
              const isExpanded = expandedId === step.id
              return (
                <div key={step.id} className={`layer-card ${isExpanded ? 'layer-card--expanded' : ''}`}>
                  <div className="layer-card__header">
                    <button type="button" className="layer-card__name" onClick={() => setExpandedId(isExpanded ? null : step.id)}>
                      {index + 1}. {isBase ? 'Base' : opLabel(step.op)}
                    </button>
                    <span className="layer-card__type">{shapeLabel(step.shape.type)}</span>
                    <div className="layer-card__actions">
                      <button type="button" title="Move up" disabled={index === 0} onClick={() => moveOp(index, -1)}>↑</button>
                      <button type="button" title="Move down" disabled={index === ops.length - 1} onClick={() => moveOp(index, 1)}>↓</button>
                      <button type="button" title="Remove" disabled={ops.length <= 1} onClick={() => removeOp(step.id)}>×</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="layer-card__body">
                      {!isBase && (
                        <div className="side-panel__field">
                          <label className="side-panel__label" htmlFor={`${step.id}-op`}>Operation</label>
                          <select id={`${step.id}-op`} className="side-panel__select" value={step.op} onChange={(e) => patchOp(step.id, { op: e.target.value as CsgOp })}>
                            {CSG_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="side-panel__field">
                        <label className="side-panel__label" htmlFor={`${step.id}-shape`}>Shape</label>
                        <select
                          id={`${step.id}-shape`}
                          className="side-panel__select"
                          value={step.shape.type}
                          onChange={(e) => patchOp(step.id, { shape: createShape(e.target.value as DensityShapeType, step.shape.center) })}
                        >
                          {SHAPE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <ShapeControls id={step.id} shape={step.shape} half={half} onChange={(shape) => patchOp(step.id, { shape })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="side-panel__row">
            <select className="side-panel__select" aria-label="New operation" value={newOp} onChange={(e) => setNewOp(e.target.value as CsgOp)}>
              {CSG_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="side-panel__select" aria-label="New shape" value={newShape} onChange={(e) => setNewShape(e.target.value as DensityShapeType)}>
              {SHAPE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <button type="button" className="side-panel__button side-panel__button--accent" onClick={addOp}>
            + Add Operation
          </button>
          <button type="button" className="side-panel__button" onClick={resetField}>
            Reset Field
          </button>
          <p className="side-panel__hint">
            Step 1 fills the grid; each later step combines into the result above it, so order matters.
          </p>
        </>
      )}

      {isHeightfield && (
        <button type="button" className="side-panel__button" onClick={resetField}>
          Reset Terrain
        </button>
      )}

      <div className="side-panel__section">Display</div>
      {display.mode === 'mesh' ? (
        <ToggleRow label="Wireframe" checked={display.meshWireframe} onChange={(v) => onDisplayChange({ ...display, meshWireframe: v })} />
      ) : (
        <>
          <ToggleRow label="Surface Voxels" checked={display.voxels} onChange={(v) => onDisplayChange({ ...display, voxels: v })} />
          <ToggleRow label="Density Points" checked={display.points} onChange={(v) => onDisplayChange({ ...display, points: v })} />
        </>
      )}
      <ToggleRow label="Grid Bounds" checked={display.bounds} onChange={(v) => onDisplayChange({ ...display, bounds: v })} />

      <div className="side-panel__section">Field Stats</div>
      <StatRow label="Samples" value={stats.samples} />
      {stats.solid !== null && <StatRow label="Solid" value={stats.solid} />}
      {stats.chunks !== null && <StatRow label="Chunks (with mesh)" value={`${stats.activeChunks ?? 0} / ${stats.chunks}`} />}
      {stats.triangles !== null && <StatRow label="Triangles" value={stats.triangles} />}
      {stats.vertices !== null && <StatRow label="Vertices" value={stats.vertices} />}
      {stats.surface !== null && <StatRow label="Drawn Voxels" value={stats.surface} />}
      <p className="side-panel__hint">
        Density &gt; iso level is solid; the mesh surface sits where density equals the iso level.
      </p>
      </>
      )}
    </aside>
  )
}
