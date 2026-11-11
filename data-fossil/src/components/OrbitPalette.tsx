import { useEffect, useMemo, useState } from 'react'
import {
  computeEncounterOrbit,
  formatEta,
} from '../lib/encounterOrbit'
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
import type { SystemBody } from '../lib/systemBodies'
import { FieldLabel, PaletteSelect, PaletteShell, SwitchRow } from './paletteUi'
import './Controls.css'

export type EncounterPreviewState = {
  targetId: string
  meetPhase: number
} | null

type OrbitPaletteProps = {
  settings: OrbitSystemSettings
  onSettingsChange: (patch: Partial<OrbitSystemSettings>) => void
  bodies: SystemBody[]
  selectedId: string | null
  onSelectBody: (id: string) => void
  onOrbitChange: (id: string, patch: Partial<PlanetOrbit>) => void
  onApplyEncounter: (
    moverId: string,
    patch: { orbit: PlanetOrbit; phase: number; nodeAngle: number },
  ) => void
  encounterPreview: EncounterPreviewState
  onEncounterPreviewChange: (preview: EncounterPreviewState) => void
  historyEntries: FossilHistoryEntry[]
  onClearSystem: () => void
}

export default function OrbitPalette({
  settings,
  onSettingsChange,
  bodies,
  selectedId,
  onSelectBody,
  onOrbitChange,
  onApplyEncounter,
  onEncounterPreviewChange,
  historyEntries,
  onClearSystem,
}: OrbitPaletteProps) {
  const selected = bodies.find((b) => b.id === selectedId) ?? null
  const others = useMemo(
    () => bodies.filter((b) => b.id !== selected?.id),
    [bodies, selected?.id],
  )

  const [targetId, setTargetId] = useState<string>('')
  const [meetAngle01, setMeetAngle01] = useState(0.42)

  useEffect(() => {
    if (others.length === 0) {
      setTargetId('')
      return
    }
    if (!others.some((b) => b.id === targetId)) {
      setTargetId(others[0]!.id)
    }
  }, [others, targetId])

  const target = others.find((b) => b.id === targetId) ?? null
  const targetIndex = target ? bodies.findIndex((b) => b.id === target.id) : 0

  const plan = useMemo(() => {
    if (!selected || !target) return null
    return computeEncounterOrbit(selected, target, meetAngle01, settings, Math.max(0, targetIndex))
  }, [selected, target, meetAngle01, settings, targetIndex])

  useEffect(() => {
    if (!selected || !plan || !target) {
      onEncounterPreviewChange(null)
      return
    }
    onEncounterPreviewChange({ targetId: target.id, meetPhase: plan.meetPhase })
  }, [selected, plan, target, onEncounterPreviewChange])

  const sourceLabels = (body: SystemBody) =>
    body.sourceEntryIds.map((id) => {
      const entry = historyEntries.find((e) => e.id === id)
      return entry?.digits ?? id.slice(0, 6)
    })

  return (
    <PaletteShell label="Orbit">
      <section className="controls__block">
        <span className="controls__label">Cosmos</span>
        <p className="controls__hint">
          One fossil can orbit alone. Add more from the tray on separate tracks. Use Encounter Orbit
          on a selected body to aim a meeting — merge only when the surfaces actually touch.
        </p>
        <button
          type="button"
          className="controls__btn"
          disabled={bodies.length === 0}
          onClick={onClearSystem}
        >
          Clear System
        </button>
      </section>

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
        <span className="controls__label">Bodies</span>
        {bodies.length === 0 ? (
          <p className="controls__hint">Empty system — pick a saved fossil in the tray to place the first planet.</p>
        ) : (
          <div className="layer-list">
            {bodies.map((body, index) => {
              const expanded = selectedId === body.id
              const distance = resolveOrbitDistance(body.orbit, index, settings.spread)
              const scars = body.planet.scars.length
              const sources = sourceLabels(body)
              return (
                <div
                  key={body.id}
                  className={`layer-card ${expanded ? 'layer-card--expanded' : ''}`}
                >
                  <div className="layer-card__header">
                    <button
                      type="button"
                      className="layer-card__name"
                      onClick={() => onSelectBody(body.id)}
                    >
                      {body.label}
                    </button>
                    <span className="layer-card__type">{index + 1}</span>
                  </div>
                  {expanded ? (
                    <div className="layer-card__body">
                      <FieldLabel
                        htmlFor={`orbit-size-${body.id}`}
                        tip="How large this planet reads in the stellar system."
                        value={body.orbit.size.toFixed(2)}
                      >
                        Size
                      </FieldLabel>
                      <input
                        id={`orbit-size-${body.id}`}
                        className="controls__slider"
                        type="range"
                        min={ORBIT_SIZE_MIN}
                        max={ORBIT_SIZE_MAX}
                        step={0.01}
                        value={body.orbit.size}
                        onChange={(e) => onOrbitChange(body.id, { size: Number(e.target.value) })}
                      />
                      <FieldLabel
                        htmlFor={`orbit-dist-${body.id}`}
                        tip="Distance from the star. Writes over the auto spacing."
                        value={distance.toFixed(2)}
                      >
                        Distance
                      </FieldLabel>
                      <input
                        id={`orbit-dist-${body.id}`}
                        className="controls__slider"
                        type="range"
                        min={ORBIT_DISTANCE_MIN}
                        max={ORBIT_DISTANCE_MAX}
                        step={0.05}
                        value={distance}
                        onChange={(e) =>
                          onOrbitChange(body.id, { distance: Number(e.target.value) })
                        }
                      />
                      {settings.shape === 'ellipse' ? (
                        <>
                          <FieldLabel
                            htmlFor={`orbit-ecc-${body.id}`}
                            tip="How stretched the ellipse is. Star sits at one focus."
                            value={body.orbit.eccentricity.toFixed(2)}
                          >
                            Stretch
                          </FieldLabel>
                          <input
                            id={`orbit-ecc-${body.id}`}
                            className="controls__slider"
                            type="range"
                            min={ORBIT_ECC_MIN}
                            max={ORBIT_ECC_MAX}
                            step={0.02}
                            value={body.orbit.eccentricity}
                            onChange={(e) =>
                              onOrbitChange(body.id, { eccentricity: Number(e.target.value) })
                            }
                          />
                        </>
                      ) : null}
                      <FieldLabel
                        htmlFor={`orbit-tilt-${body.id}`}
                        tip="Orbit plane lean. 0 is flat; ±1 is nearly edge-on the other way (~±85°)."
                        value={body.orbit.tilt.toFixed(2)}
                      >
                        Tilt
                      </FieldLabel>
                      <input
                        id={`orbit-tilt-${body.id}`}
                        className="controls__slider"
                        type="range"
                        min={ORBIT_TILT_MIN}
                        max={ORBIT_TILT_MAX}
                        step={0.02}
                        value={body.orbit.tilt}
                        onChange={(e) => onOrbitChange(body.id, { tilt: Number(e.target.value) })}
                      />
                      <FieldLabel
                        htmlFor={`orbit-pace-${body.id}`}
                        tip="Orbit speed multiplier."
                        value={body.orbit.pace.toFixed(2)}
                      >
                        Pace
                      </FieldLabel>
                      <input
                        id={`orbit-pace-${body.id}`}
                        className="controls__slider"
                        type="range"
                        min={ORBIT_PACE_MIN}
                        max={ORBIT_PACE_MAX}
                        step={0.02}
                        value={body.orbit.pace}
                        onChange={(e) => onOrbitChange(body.id, { pace: Number(e.target.value) })}
                      />

                      {scars > 0 || sources.length > 1 ? (
                        <p className="controls__hint">
                          Surface record: {scars} impact{scars === 1 ? '' : 's'}
                          {sources.length > 0 ? ` · fossils ${sources.join(', ')}` : ''}
                          . Open View Surface to walk the contact marks.
                        </p>
                      ) : null}

                      {others.length > 0 && plan && target ? (
                        <>
                          <span className="controls__label" style={{ marginTop: '0.35rem' }}>
                            Encounter Orbit
                          </span>
                          <p className="controls__hint">
                            Aim this body at another planet. The marker shows the planned meeting
                            spot; merge waits for real contact.
                          </p>
                          <FieldLabel htmlFor={`encounter-target-${body.id}`} tip="Body to meet.">
                            Target
                          </FieldLabel>
                          <PaletteSelect
                            id={`encounter-target-${body.id}`}
                            value={target.id}
                            options={others.map((o) => ({ value: o.id, label: o.label }))}
                            onChange={(id) => setTargetId(id)}
                          />
                          <FieldLabel
                            htmlFor={`encounter-meet-${body.id}`}
                            tip="Where along the target track they should meet."
                            value={`${Math.round(meetAngle01 * 360)}°`}
                          >
                            Meet
                          </FieldLabel>
                          <input
                            id={`encounter-meet-${body.id}`}
                            className="controls__slider"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={meetAngle01}
                            onChange={(e) => setMeetAngle01(Number(e.target.value))}
                          />
                          <p className="controls__hint">
                            Preview ETA {formatEta(plan.etaSeconds)} · shared track, faster pace
                          </p>
                          <button
                            type="button"
                            className="controls__btn controls__btn--primary"
                            onClick={() =>
                              onApplyEncounter(body.id, {
                                orbit: plan.orbit,
                                phase: plan.phase,
                                nodeAngle: plan.nodeAngle,
                              })
                            }
                          >
                            Apply Encounter Orbit
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </PaletteShell>
  )
}
