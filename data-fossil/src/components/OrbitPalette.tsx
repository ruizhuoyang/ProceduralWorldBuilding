import { useState } from 'react'
import type { FossilHistoryEntry } from '../lib/history'
import {
  ORBIT_DISTANCE_MAX,
  ORBIT_DISTANCE_MIN,
  ORBIT_ECC_MAX,
  ORBIT_ECC_MIN,
  ORBIT_SHAPES,
  ORBIT_PACE_MAX,
  ORBIT_PACE_MIN,
  ORBIT_SIZE_MAX,
  ORBIT_SIZE_MIN,
  ORBIT_SPREAD_MAX,
  ORBIT_SPREAD_MIN,
  ORBIT_TILT_MAX,
  ORBIT_TILT_MIN,
  resolveOrbitDistance,
  type OrbitSystemSettings,
  type PlanetOrbit,
} from '../lib/orbit'
import { FieldLabel, PaletteSelect, PaletteShell, SwitchRow } from './paletteUi'
import './Controls.css'

type OrbitPaletteProps = {
  settings: OrbitSystemSettings
  onSettingsChange: (patch: Partial<OrbitSystemSettings>) => void
  entries: FossilHistoryEntry[]
  onOrbitChange: (id: string, patch: Partial<PlanetOrbit>) => void
}

export default function OrbitPalette({
  settings,
  onSettingsChange,
  entries,
  onOrbitChange,
}: OrbitPaletteProps) {
  const [expandedId, setExpandedId] = useState<string | null>(entries[0]?.id ?? null)

  return (
    <PaletteShell label="Orbit">
      <section className="controls__block">
        <span className="controls__label">System</span>
        <SwitchRow
          id="orbit-motion"
          tip="Pause orbit and spin at the current place."
          checked={settings.playing}
          onChange={(playing) => onSettingsChange({ playing })}
        >
          Motion
        </SwitchRow>
        <FieldLabel htmlFor="orbit-shape" tip="Circle around the star, or a Kepler ellipse.">
          Shape
        </FieldLabel>
        <PaletteSelect
          id="orbit-shape"
          value={settings.shape}
          options={ORBIT_SHAPES}
          onChange={(shape) => onSettingsChange({ shape })}
        />
        <FieldLabel
          htmlFor="orbit-spread"
          tip="Spacing between auto-distance planets."
          value={settings.spread.toFixed(2)}
        >
          Spread
        </FieldLabel>
        <input
          id="orbit-spread"
          className="controls__slider"
          type="range"
          min={ORBIT_SPREAD_MIN}
          max={ORBIT_SPREAD_MAX}
          step={0.02}
          value={settings.spread}
          onChange={(e) => onSettingsChange({ spread: Number(e.target.value) })}
        />
      </section>

      <section className="controls__block">
        <span className="controls__label">Planets</span>
        <div className="layer-list">
          {entries.map((entry, index) => {
            const expanded = expandedId === entry.id
            const distance = resolveOrbitDistance(entry.orbit, index, settings.spread)
            return (
              <div
                key={entry.id}
                className={`layer-card ${expanded ? 'layer-card--expanded' : ''}`}
              >
                <div className="layer-card__header">
                  <img src={entry.thumb} alt="" className="layer-card__thumb" />
                  <button
                    type="button"
                    className="layer-card__name"
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                  >
                    {entry.digits}
                  </button>
                  <span className="layer-card__type">{index + 1}</span>
                </div>
                {expanded ? (
                  <div className="layer-card__body">
                    <FieldLabel
                      htmlFor={`orbit-size-${entry.id}`}
                      tip="How large this planet reads in the stellar system. Edit rock stays full size."
                      value={entry.orbit.size.toFixed(2)}
                    >
                      Size
                    </FieldLabel>
                    <input
                      id={`orbit-size-${entry.id}`}
                      className="controls__slider"
                      type="range"
                      min={ORBIT_SIZE_MIN}
                      max={ORBIT_SIZE_MAX}
                      step={0.01}
                      value={entry.orbit.size}
                      onChange={(e) => onOrbitChange(entry.id, { size: Number(e.target.value) })}
                    />
                    <FieldLabel
                      htmlFor={`orbit-dist-${entry.id}`}
                      tip="Distance from the star. Writes over the auto spacing."
                      value={distance.toFixed(2)}
                    >
                      Distance
                    </FieldLabel>
                    <input
                      id={`orbit-dist-${entry.id}`}
                      className="controls__slider"
                      type="range"
                      min={ORBIT_DISTANCE_MIN}
                      max={ORBIT_DISTANCE_MAX}
                      step={0.05}
                      value={distance}
                      onChange={(e) =>
                        onOrbitChange(entry.id, { distance: Number(e.target.value) })
                      }
                    />
                    {settings.shape === 'ellipse' ? (
                      <>
                        <FieldLabel
                          htmlFor={`orbit-ecc-${entry.id}`}
                          tip="How stretched the ellipse is. Star sits at one focus."
                          value={entry.orbit.eccentricity.toFixed(2)}
                        >
                          Stretch
                        </FieldLabel>
                        <input
                          id={`orbit-ecc-${entry.id}`}
                          className="controls__slider"
                          type="range"
                          min={ORBIT_ECC_MIN}
                          max={ORBIT_ECC_MAX}
                          step={0.02}
                          value={entry.orbit.eccentricity}
                          onChange={(e) =>
                            onOrbitChange(entry.id, { eccentricity: Number(e.target.value) })
                          }
                        />
                      </>
                    ) : null}
                    <FieldLabel
                      htmlFor={`orbit-tilt-${entry.id}`}
                      tip="Orbit plane lean. 0 is flat; ±1 is nearly edge-on the other way (~±85°)."
                      value={entry.orbit.tilt.toFixed(2)}
                    >
                      Tilt
                    </FieldLabel>
                    <input
                      id={`orbit-tilt-${entry.id}`}
                      className="controls__slider"
                      type="range"
                      min={ORBIT_TILT_MIN}
                      max={ORBIT_TILT_MAX}
                      step={0.02}
                      value={entry.orbit.tilt}
                      onChange={(e) => onOrbitChange(entry.id, { tilt: Number(e.target.value) })}
                    />
                    <FieldLabel
                      htmlFor={`orbit-pace-${entry.id}`}
                      tip="Orbit speed multiplier. Distance still sets the Kepler base."
                      value={entry.orbit.pace.toFixed(2)}
                    >
                      Pace
                    </FieldLabel>
                    <input
                      id={`orbit-pace-${entry.id}`}
                      className="controls__slider"
                      type="range"
                      min={ORBIT_PACE_MIN}
                      max={ORBIT_PACE_MAX}
                      step={0.02}
                      value={entry.orbit.pace}
                      onChange={(e) => onOrbitChange(entry.id, { pace: Number(e.target.value) })}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </PaletteShell>
  )
}
