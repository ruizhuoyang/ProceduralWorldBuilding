import ParamSlider from './ParamSlider'
import {
  SHADER_STUDY_MODES,
  type ShaderStudyMode,
  type ShaderStudyParams,
  createDefaultShaderParams,
} from '../lib/shaders/types'
import './SidePanel.css'

type ShaderStudyControlsProps = {
  mode: ShaderStudyMode
  onModeChange: (mode: ShaderStudyMode) => void
  params: ShaderStudyParams
  onParamsChange: (params: ShaderStudyParams) => void
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="side-panel__field">
      <label className="side-panel__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="color"
        className="side-panel__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: '2rem', padding: 0 }}
      />
    </div>
  )
}

/** Controls body — embeds inside Voxel Terrain (Class 05 living next to voxels). */
export function ShaderStudyControls({
  mode,
  onModeChange,
  params,
  onParamsChange,
}: ShaderStudyControlsProps) {
  const update = <Key extends keyof ShaderStudyParams>(key: Key, value: ShaderStudyParams[Key]) =>
    onParamsChange({ ...params, [key]: value })

  return (
    <>
      <div className="side-panel__section">Water Shader Studies</div>
      <p className="side-panel__hint">
        Class 05 strategies on a water mesh: vertex displacement, contact foam, click ripples, and soft particles.
      </p>

      <nav className="sub-tabs" aria-label="Shader strategy">
        {SHADER_STUDY_MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`sub-tabs__button ${mode === item.value ? 'sub-tabs__button--active' : ''}`}
            onClick={() => onModeChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {(mode === 'deform' || mode === 'particles' || mode === 'ripple') && (
        <>
          <div className="side-panel__section">Mesh Deformation</div>
          <ParamSlider
            id="shader-amp"
            label="Amplitude"
            value={params.amplitude}
            min={0}
            max={0.5}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('amplitude', v)}
          />
          <ParamSlider
            id="shader-freq"
            label="Frequency"
            value={params.frequency}
            min={0.2}
            max={4}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('frequency', v)}
          />
          <ParamSlider
            id="shader-speed"
            label="Speed"
            value={params.speed}
            min={0}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('speed', v)}
          />
        </>
      )}

      {(mode === 'contact' || mode === 'deform') && (
        <>
          <div className="side-panel__section">Depth & Contact Foam</div>
          <ColorField id="shader-shallow" label="Shallow Color" value={params.shallowColor} onChange={(v) => update('shallowColor', v)} />
          <ColorField id="shader-deep" label="Deep Color" value={params.deepColor} onChange={(v) => update('deepColor', v)} />
          <ColorField id="shader-foam" label="Foam Color" value={params.foamColor} onChange={(v) => update('foamColor', v)} />
          <ParamSlider
            id="shader-foam-w"
            label="Foam Width"
            value={params.foamWidth}
            min={0.05}
            max={0.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('foamWidth', v)}
          />
          <ParamSlider
            id="shader-depth"
            label="Depth Scale"
            value={params.depthScale}
            min={0.3}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('depthScale', v)}
          />
          <p className="side-panel__hint">
            White foam marks where water meets rocks. Depth tints shallow → deep.
          </p>
        </>
      )}

      {mode === 'ripple' && (
        <>
          <div className="side-panel__section">Click Ripples</div>
          <ParamSlider
            id="shader-rip-str"
            label="Strength"
            value={params.rippleStrength}
            min={0.05}
            max={0.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('rippleStrength', v)}
          />
          <ParamSlider
            id="shader-rip-wl"
            label="Wavelength"
            value={params.rippleWavelength}
            min={0.5}
            max={4}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('rippleWavelength', v)}
          />
          <ParamSlider
            id="shader-rip-decay"
            label="Decay"
            value={params.rippleDecay}
            min={0.3}
            max={4}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('rippleDecay', v)}
          />
          <p className="side-panel__hint">Click the water to spawn a ripple. Right-drag to orbit.</p>
        </>
      )}

      {mode === 'particles' && (
        <>
          <div className="side-panel__section">Particles + Mesh</div>
          <ParamSlider
            id="shader-p-count"
            label="Count"
            value={params.particleCount}
            min={50}
            max={1200}
            step={10}
            format={(v) => String(v)}
            onChange={(v) => update('particleCount', v)}
          />
          <ParamSlider
            id="shader-p-size"
            label="Size"
            value={params.particleSize}
            min={0.03}
            max={0.25}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => update('particleSize', v)}
          />
          <ParamSlider
            id="shader-p-spawn"
            label="Spawn Rate"
            value={params.particleSpawnRate}
            min={5}
            max={120}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => update('particleSpawnRate', v)}
          />
          <ParamSlider
            id="shader-p-life"
            label="Life"
            value={params.particleLife}
            min={0.5}
            max={5}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => update('particleLife', v)}
          />
          <p className="side-panel__hint">
            Soft point shader for spray; the water plane stays a triangle mesh. Same scene, different GPU programs.
          </p>
        </>
      )}

      <button
        type="button"
        className="side-panel__button"
        onClick={() => onParamsChange(createDefaultShaderParams())}
      >
        Reset Shader Params
      </button>
    </>
  )
}

/** Standalone panel kept for compatibility; prefer embedding via VoxelPanel. */
export default function ShaderPanel(props: ShaderStudyControlsProps) {
  return (
    <aside className="side-panel" aria-label="Shader study controls">
      <ShaderStudyControls {...props} />
    </aside>
  )
}
