import { useEffect, useRef, useState } from 'react'
import {
  ATMO_AMOUNT_MAX,
  ATMO_AMOUNT_MIN,
  ATMO_GLOW_MAX,
  ATMO_GLOW_MIN,
  ATMO_HEIGHT_MAX,
  ATMO_HEIGHT_MIN,
  ATMO_SIZE_MAX,
  ATMO_SIZE_MIN,
  ATMO_SPEED_MAX,
  ATMO_SPEED_MIN,
  ATMOSPHERE_FIELD_MODES,
  LIGHT_KEY_MAX,
  LIGHT_KEY_MIN,
  MESH_RESOLUTION_MAX,
  MESH_RESOLUTION_MIN,
  OCTAVES_MAX,
  OCTAVES_MIN,
  STONE_COLOR_MAX,
  nextColorAlt,
  normalizeColorAlts,
  type AtmosphereParams,
  type LandformLayer,
  type LightingParams,
} from '../lib/types'
import {
  createLandformLayer,
  LANDFORM_DENSITY_MAX,
  LANDFORM_DENSITY_MIN,
  LANDFORM_KINDS,
  LANDFORM_LAYER_MAX,
  LANDFORM_SIZE_MAX,
  LANDFORM_SIZE_MIN,
  LANDFORM_SPARSE_MAX,
  LANDFORM_SPARSE_MIN,
  LANDFORM_STRENGTH_MAX,
  LANDFORM_STRENGTH_MIN,
  landformLayerName,
  type LandformKind,
} from '../lib/landforms'
import { FieldLabel, PaletteSelect, SwitchRow } from './paletteUi'
import './Controls.css'

export type ControlsProps = {
  draftDigits: string
  onDraftDigitsChange: (value: string) => void
  appliedDigits: string
  seed: number
  noiseStrength: number
  onNoiseStrengthChange: (v: number) => void
  noiseScale: number
  onNoiseScaleChange: (v: number) => void
  fbmOctaves: number
  onFbmOctavesChange: (v: number) => void
  digitStrength: number
  onDigitStrengthChange: (v: number) => void
  detail: number
  onDetailChange: (v: number) => void
  landformLayers: LandformLayer[]
  onLandformLayersChange: (layers: LandformLayer[]) => void
  stoneColors: string[]
  onStoneColorsChange: (colors: string[]) => void
  colorAlts: number[]
  onColorAltsChange: (alts: number[]) => void
  heightBlend: number
  onHeightBlendChange: (v: number) => void
  normalStrength: number
  onNormalStrengthChange: (v: number) => void
  lighting: LightingParams
  onLightingChange: (patch: Partial<LightingParams>) => void
  atmosphere: AtmosphereParams
  onAtmosphereChange: (patch: Partial<AtmosphereParams>) => void
  onGenerate: () => void
  onSave: () => void
  onExportStl: () => void
  onClearHistory: () => void
  historyCount: number
}

function hexOk(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#b0aaa2'
}

/** Distinct defaults when adding a slot — avoid cloning the previous swatch. */
const ADD_COLOR_DEFAULTS = ['#8e9398', '#c4b49a', '#c49a5a', '#6a6762', '#9a8f82', '#b0aaa2']

function nextDistinctColor(existing: string[]): string {
  const used = new Set(existing.map((c) => c.toLowerCase()))
  for (const candidate of ADD_COLOR_DEFAULTS) {
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  // Fallback: nudge hue so mix still reads even if palette is full of presets
  const base = existing[existing.length - 1] ?? '#b0aaa2'
  const n = Number.parseInt(base.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + 40)
  const g = Math.min(255, ((n >> 8) & 255) + 18)
  const b = Math.max(0, (n & 255) - 25)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function Controls({
  draftDigits,
  onDraftDigitsChange,
  appliedDigits,
  seed,
  noiseStrength,
  onNoiseStrengthChange,
  noiseScale,
  onNoiseScaleChange,
  fbmOctaves,
  onFbmOctavesChange,
  digitStrength,
  onDigitStrengthChange,
  detail,
  onDetailChange,
  landformLayers,
  onLandformLayersChange,
  stoneColors,
  onStoneColorsChange,
  colorAlts,
  onColorAltsChange,
  heightBlend,
  onHeightBlendChange,
  normalStrength,
  onNormalStrengthChange,
  lighting,
  onLightingChange,
  atmosphere,
  onAtmosphereChange,
  onGenerate,
  onSave,
  onExportStl,
  onClearHistory,
  historyCount,
}: ControlsProps) {
  const colors = stoneColors.length > 0 ? stoneColors.map(hexOk) : ['#b0aaa2']
  const alts = normalizeColorAlts(colorAlts, colors.length)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [expandedLandformId, setExpandedLandformId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const patchLandform = (id: string, patch: Partial<LandformLayer>) => {
    onLandformLayersChange(
      landformLayers.map((layer, index) => {
        if (layer.id !== id) return layer
        const kind = patch.kind ?? layer.kind
        return {
          ...layer,
          ...patch,
          name: patch.kind && patch.kind !== layer.kind ? landformLayerName(index + 1, kind) : layer.name,
        }
      }),
    )
  }

  useEffect(() => {
    if (openIndex !== null && openIndex >= colors.length) {
      setOpenIndex(colors.length > 0 ? colors.length - 1 : null)
    }
  }, [colors.length, openIndex])

  useEffect(() => {
    if (openIndex === null) return
    const onPointerDown = (e: PointerEvent) => {
      const el = pickerRef.current
      if (el && !el.contains(e.target as Node)) {
        setOpenIndex(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openIndex])

  const updateAt = (index: number, hex: string) => {
    const next = colors.map((c, i) => (i === index ? hexOk(hex) : c))
    onStoneColorsChange(next)
  }

  const updateAltAt = (index: number, alt: number) => {
    const next = alts.map((v, i) => (i === index ? Math.min(1, Math.max(0, alt)) : v))
    onColorAltsChange(next)
  }

  const removeAt = (index: number) => {
    if (colors.length <= 1) return
    onStoneColorsChange(colors.filter((_, i) => i !== index))
    onColorAltsChange(alts.filter((_, i) => i !== index))
    setOpenIndex(null)
  }

  const addColor = () => {
    if (colors.length >= STONE_COLOR_MAX) return
    const next = [...colors, nextDistinctColor(colors)]
    onStoneColorsChange(next)
    onColorAltsChange([...alts, nextColorAlt(alts)])
    setOpenIndex(next.length - 1)
  }

  const openColor = openIndex !== null ? colors[openIndex] : null

  return (
    <aside className="controls" aria-label="Parameter palette">
      <p className="controls__palette-label">Palette</p>

      <section className="controls__block">
        <FieldLabel htmlFor="digits-input" tip="0–9, up to 16 digits. Leading zeros count.">
          Digits
        </FieldLabel>
        <div className="controls__row">
          <input
            id="digits-input"
            className="controls__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            value={draftDigits}
            onChange={(e) => onDraftDigitsChange(e.target.value.replace(/\D/g, '').slice(0, 16))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onGenerate()
            }}
          />
          <button type="button" className="controls__btn controls__btn--primary" onClick={onGenerate}>
            Generate
          </button>
        </div>
      </section>

      <section className="controls__block">
        <span className="controls__label">Shape</span>
        <FieldLabel htmlFor="noise-strength" tip="How deep the wrinkles go." value={noiseStrength.toFixed(2)}>
          Noise Strength
        </FieldLabel>
        <input
          id="noise-strength"
          className="controls__slider"
          type="range"
          min={0}
          max={0.55}
          step={0.01}
          value={noiseStrength}
          onChange={(e) => onNoiseStrengthChange(Number(e.target.value))}
        />

        <FieldLabel htmlFor="noise-scale" tip="Wrinkle size — higher is finer." value={noiseScale.toFixed(2)}>
          Noise Scale
        </FieldLabel>
        <input
          id="noise-scale"
          className="controls__slider"
          type="range"
          min={0.4}
          max={4}
          step={0.05}
          value={noiseScale}
          onChange={(e) => onNoiseScaleChange(Number(e.target.value))}
        />

        <FieldLabel htmlFor="fbm-octaves" tip="Noise layers. Higher = finer folds." value={String(fbmOctaves)}>
          Octaves
        </FieldLabel>
        <input
          id="fbm-octaves"
          className="controls__slider"
          type="range"
          min={OCTAVES_MIN}
          max={OCTAVES_MAX}
          step={1}
          value={fbmOctaves}
          onChange={(e) => onFbmOctavesChange(Number(e.target.value))}
        />

        <FieldLabel htmlFor="digit-strength" tip="How far each digit pushes out." value={digitStrength.toFixed(2)}>
          Digit Strength
        </FieldLabel>
        <input
          id="digit-strength"
          className="controls__slider"
          type="range"
          min={0}
          max={0.6}
          step={0.01}
          value={digitStrength}
          onChange={(e) => onDigitStrengthChange(Number(e.target.value))}
        />

        <FieldLabel htmlFor="mesh-detail" tip="Mesh density. Higher helps Surface Grain show." value={String(detail)}>
          Resolution
        </FieldLabel>
        <input
          id="mesh-detail"
          className="controls__slider"
          type="range"
          min={MESH_RESOLUTION_MIN}
          max={MESH_RESOLUTION_MAX}
          step={1}
          value={detail}
          onChange={(e) => onDetailChange(Number(e.target.value))}
        />

        <span className="controls__label">Landforms</span>
        <div className="layer-list">
          {landformLayers.map((layer) => {
            const expanded = expandedLandformId === layer.id
            return (
              <div
                key={layer.id}
                className={`layer-card ${expanded ? 'layer-card--expanded' : ''} ${
                  layer.enabled ? '' : 'layer-card--off'
                }`}
              >
                <div className="layer-card__header">
                  <button
                    type="button"
                    className={`switch switch--sm ${layer.enabled ? 'is-on' : ''}`}
                    role="switch"
                    aria-checked={layer.enabled}
                    aria-label={`Enable ${layer.name}`}
                    onClick={() => patchLandform(layer.id, { enabled: !layer.enabled })}
                  >
                    <span className="switch__knob" />
                  </button>
                  <button
                    type="button"
                    className="layer-card__name"
                    onClick={() => setExpandedLandformId(expanded ? null : layer.id)}
                  >
                    {layer.name}
                  </button>
                  <span className="layer-card__type">{layer.kind}</span>
                  <div className="layer-card__actions">
                    <button
                      type="button"
                      title="Remove"
                      aria-label={`Remove ${layer.name}`}
                      onClick={() => {
                        onLandformLayersChange(landformLayers.filter((item) => item.id !== layer.id))
                        if (expandedLandformId === layer.id) setExpandedLandformId(null)
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <div className="layer-card__body">
                    <FieldLabel htmlFor={`land-kind-${layer.id}`} tip="Volcano cone, wide basin, or steep cave shaft.">
                      Type
                    </FieldLabel>
                    <PaletteSelect
                      id={`land-kind-${layer.id}`}
                      value={layer.kind}
                      options={LANDFORM_KINDS}
                      onChange={(kind) => patchLandform(layer.id, { kind })}
                    />
                    <FieldLabel
                      htmlFor={`land-density-${layer.id}`}
                      tip="How many separate features. New ones keep off existing ones."
                      value={String(Math.round(layer.density))}
                    >
                      Count
                    </FieldLabel>
                    <input
                      id={`land-density-${layer.id}`}
                      className="controls__slider"
                      type="range"
                      min={LANDFORM_DENSITY_MIN}
                      max={LANDFORM_DENSITY_MAX}
                      step={1}
                      value={layer.density}
                      onChange={(e) => patchLandform(layer.id, { density: Number(e.target.value) })}
                    />
                    <FieldLabel
                      htmlFor={`land-sparse-${layer.id}`}
                      tip="Pack features together. Higher = fewer groups, tighter huddle."
                      value={layer.sparse.toFixed(2)}
                    >
                      Cluster
                    </FieldLabel>
                    <input
                      id={`land-sparse-${layer.id}`}
                      className="controls__slider"
                      type="range"
                      min={LANDFORM_SPARSE_MIN}
                      max={LANDFORM_SPARSE_MAX}
                      step={0.02}
                      value={layer.sparse}
                      onChange={(e) => patchLandform(layer.id, { sparse: Number(e.target.value) })}
                    />
                    <FieldLabel
                      htmlFor={`land-strength-${layer.id}`}
                      tip="How tall or deep each feature is."
                      value={layer.strength.toFixed(2)}
                    >
                      Strength
                    </FieldLabel>
                    <input
                      id={`land-strength-${layer.id}`}
                      className="controls__slider"
                      type="range"
                      min={LANDFORM_STRENGTH_MIN}
                      max={LANDFORM_STRENGTH_MAX}
                      step={0.02}
                      value={layer.strength}
                      onChange={(e) => patchLandform(layer.id, { strength: Number(e.target.value) })}
                    />
                    <FieldLabel
                      htmlFor={`land-size-${layer.id}`}
                      tip="How wide each feature spreads on the crust."
                      value={layer.size.toFixed(2)}
                    >
                      Size
                    </FieldLabel>
                    <input
                      id={`land-size-${layer.id}`}
                      className="controls__slider"
                      type="range"
                      min={LANDFORM_SIZE_MIN}
                      max={LANDFORM_SIZE_MAX}
                      step={0.02}
                      value={layer.size}
                      onChange={(e) => patchLandform(layer.id, { size: Number(e.target.value) })}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="controls__btn"
          disabled={landformLayers.length >= LANDFORM_LAYER_MAX}
          onClick={() => {
            const cycle: LandformKind[] = ['volcano', 'basin', 'cave']
            const kind = cycle[landformLayers.length % 3] ?? 'volcano'
            const created = createLandformLayer(landformLayers.length + 1, kind)
            onLandformLayersChange([...landformLayers, created])
            setExpandedLandformId(created.id)
          }}
        >
          + Add Layer {landformLayers.length + 1}
        </button>
      </section>

      <section className="controls__block">
        <span className="controls__label">Appearance</span>
        <FieldLabel tip="Each swatch can sit at its own altitude. Open one to set it.">
          Stone Color
        </FieldLabel>

        <div className="color-chips" ref={pickerRef}>
          <div className="color-chips__row" role="list" aria-label="Stone colors">
            {colors.map((hex, index) => (
              <button
                key={`chip-${index}`}
                type="button"
                role="listitem"
                className={`color-chips__swatch ${
                  openIndex === index ? 'color-chips__swatch--open' : ''
                }`}
                style={{ background: hex }}
                aria-expanded={openIndex === index}
                aria-label={`Color ${index + 1}, ${hex}`}
                title={hex}
                onClick={() => setOpenIndex((prev) => (prev === index ? null : index))}
              />
            ))}
            {colors.length < STONE_COLOR_MAX && (
              <button
                type="button"
                className="color-chips__add"
                aria-label="Add color"
                title="Add color"
                onClick={addColor}
              >
                <span className="color-chips__add-plus" aria-hidden>
                  +
                </span>
              </button>
            )}
          </div>

          {openIndex !== null && openColor && (
            <div className="color-chips__canvas" role="dialog" aria-label={`Edit color ${openIndex + 1}`}>
              <div className="color-chips__canvas-top">
                <span className="color-chips__canvas-title">Color {openIndex + 1}</span>
                <button
                  type="button"
                  className="color-chips__delete"
                  disabled={colors.length <= 1}
                  aria-label={`Delete color ${openIndex + 1}`}
                  onClick={() => removeAt(openIndex)}
                >
                  Delete
                </button>
              </div>
              <label className="color-chips__picker">
                <input
                  type="color"
                  value={openColor}
                  onChange={(e) => updateAt(openIndex, e.target.value)}
                  aria-label={`Pick color ${openIndex + 1}`}
                />
              </label>
              <div className="color-chips__meta">
                <span className="color-chips__preview" style={{ background: openColor }} />
                <code className="color-chips__hex">{openColor.toUpperCase()}</code>
              </div>
              {colors.length > 1 && (
                <label className="color-chips__alt">
                  <span className="color-chips__alt-label">
                    Altitude
                    <span className="controls__value">
                      {(alts[openIndex] ?? 0).toFixed(2)}
                    </span>
                  </span>
                  <input
                    className="controls__slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={alts[openIndex] ?? 0}
                    onChange={(e) => updateAltAt(openIndex, Number(e.target.value))}
                    aria-label={`Altitude for color ${openIndex + 1}`}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <FieldLabel htmlFor="height-blend" tip="How much the altitude colors show." value={heightBlend.toFixed(2)}>
          Height Tint
        </FieldLabel>
        <input
          id="height-blend"
          className="controls__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={heightBlend}
          onChange={(e) => onHeightBlendChange(Number(e.target.value))}
        />

        <FieldLabel htmlFor="normal-strength" tip="Fine skin displacement. Needs enough Resolution." value={normalStrength.toFixed(2)}>
          Surface Grain
        </FieldLabel>
        <input
          id="normal-strength"
          className="controls__slider"
          type="range"
          min={0}
          max={1.6}
          step={0.05}
          value={normalStrength}
          onChange={(e) => onNormalStrengthChange(Number(e.target.value))}
        />
      </section>

      <section className="controls__block">
        <span className="controls__label">Lighting</span>
        <FieldLabel htmlFor="light-key" tip="Studio light intensity." value={lighting.key.toFixed(2)}>
          Light
        </FieldLabel>
        <input
          id="light-key"
          className="controls__slider"
          type="range"
          min={LIGHT_KEY_MIN}
          max={LIGHT_KEY_MAX}
          step={0.02}
          value={lighting.key}
          onChange={(e) => onLightingChange({ key: Number(e.target.value) })}
        />
      </section>

      <section className="controls__block">
        <span className="controls__label">Atmosphere</span>
        <SwitchRow
          id="atmo-visible"
          tip="Show or hide the particle layer."
          checked={atmosphere.visible}
          onChange={(visible) => onAtmosphereChange({ visible })}
        >
          Visible
        </SwitchRow>
        <SwitchRow
          id="atmo-playing"
          tip="Play motion, or freeze particles where they are."
          checked={atmosphere.playing}
          onChange={(playing) => onAtmosphereChange({ playing })}
        >
          Motion
        </SwitchRow>
        <FieldLabel htmlFor="atmo-color" tip="Haze color.">
          Color
        </FieldLabel>
        <label className="controls__color-row" htmlFor="atmo-color">
          <input
            id="atmo-color"
            type="color"
            value={atmosphere.color}
            onChange={(e) => onAtmosphereChange({ color: e.target.value })}
            aria-label="Atmosphere color"
          />
          <code className="color-chips__hex">{atmosphere.color.toUpperCase()}</code>
        </label>
        <FieldLabel htmlFor="atmo-field" tip="Class 06 vector field that steers particles.">
          Field
        </FieldLabel>
        <PaletteSelect
          id="atmo-field"
          value={atmosphere.fieldMode}
          options={ATMOSPHERE_FIELD_MODES}
          onChange={(fieldMode) => onAtmosphereChange({ fieldMode })}
        />
        <FieldLabel htmlFor="atmo-amount" tip="How many haze particles sit on the surface." value={atmosphere.amount.toFixed(2)}>
          Amount
        </FieldLabel>
        <input
          id="atmo-amount"
          className="controls__slider"
          type="range"
          min={ATMO_AMOUNT_MIN}
          max={ATMO_AMOUNT_MAX}
          step={0.02}
          value={atmosphere.amount}
          onChange={(e) => onAtmosphereChange({ amount: Number(e.target.value) })}
        />
        <FieldLabel htmlFor="atmo-height" tip="Lift off the mesh. 0 = on the skin; higher = thicker air." value={atmosphere.height.toFixed(3)}>
          Height
        </FieldLabel>
        <input
          id="atmo-height"
          className="controls__slider"
          type="range"
          min={ATMO_HEIGHT_MIN}
          max={ATMO_HEIGHT_MAX}
          step={0.002}
          value={atmosphere.height}
          onChange={(e) => onAtmosphereChange({ height: Number(e.target.value) })}
        />
        <FieldLabel htmlFor="atmo-size" tip="Particle sprite size." value={atmosphere.size.toFixed(2)}>
          Size
        </FieldLabel>
        <input
          id="atmo-size"
          className="controls__slider"
          type="range"
          min={ATMO_SIZE_MIN}
          max={ATMO_SIZE_MAX}
          step={0.02}
          value={atmosphere.size}
          onChange={(e) => onAtmosphereChange({ size: Number(e.target.value) })}
        />
        <FieldLabel htmlFor="atmo-speed" tip="How hard the vector field pushes." value={atmosphere.speed.toFixed(2)}>
          Speed
        </FieldLabel>
        <input
          id="atmo-speed"
          className="controls__slider"
          type="range"
          min={ATMO_SPEED_MIN}
          max={ATMO_SPEED_MAX}
          step={0.02}
          value={atmosphere.speed}
          onChange={(e) => onAtmosphereChange({ speed: Number(e.target.value) })}
        />
        <FieldLabel htmlFor="atmo-glow" tip="Limb haze strength." value={atmosphere.glow.toFixed(2)}>
          Glow
        </FieldLabel>
        <input
          id="atmo-glow"
          className="controls__slider"
          type="range"
          min={ATMO_GLOW_MIN}
          max={ATMO_GLOW_MAX}
          step={0.02}
          value={atmosphere.glow}
          onChange={(e) => onAtmosphereChange({ glow: Number(e.target.value) })}
        />
      </section>

      <section className="controls__block">
        <span className="controls__label">Library</span>
        <div className="controls__row controls__row--wrap">
          <button
            type="button"
            className="controls__btn controls__btn--primary"
            title="Store a thumbnail locally"
            onClick={onSave}
          >
            Save
          </button>
          <button
            type="button"
            className="controls__btn"
            title="Download the mesh as STL"
            onClick={onExportStl}
          >
            Export STL
          </button>
          <button
            type="button"
            className="controls__btn"
            title="Remove all saved fossils"
            onClick={onClearHistory}
            disabled={historyCount === 0}
          >
            Clear History
          </button>
        </div>
      </section>

      <section className="controls__meta" aria-live="polite">
        <div>
          <span className="controls__meta-key">Applied</span>
          <code className="controls__meta-val">{appliedDigits}</code>
        </div>
        <div>
          <span className="controls__meta-key">Seed</span>
          <code className="controls__meta-val">{seed}</code>
        </div>
      </section>
    </aside>
  )
}
