import { useMemo } from 'react'
import type { FossilHistoryEntry } from '../lib/history'
import {
  ORBIT_DISTANCE_MAX,
  ORBIT_DISTANCE_MIN,
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

type OrbitPaletteProps = {
  settings: OrbitSystemSettings
  onSettingsChange: (patch: Partial<OrbitSystemSettings>) => void
  bodies: SystemBody[]
  selectedId: string | null
  onSelectBody: (id: string) => void
  onOrbitChange: (id: string, patch: Partial<PlanetOrbit>) => void
  /** Body currently choosing a collide target, or null. */
  collideSelectMoverId: string | null
  onStartCollideSelect: (moverId: string) => void
  onCancelCollideSelect: () => void
  onConfirmCollideTarget: (targetId: string) => void
  historyEntries: FossilHistoryEntry[]
  onClearSystem: () => void
  onRemoveBody: (id: string) => void
}

export default function OrbitPalette({
  settings,
  onSettingsChange,
  bodies,
  selectedId,
  onSelectBody,
  onOrbitChange,
  collideSelectMoverId,
  onStartCollideSelect,
  onCancelCollideSelect,
  onConfirmCollideTarget,
  historyEntries,
  onClearSystem,
  onRemoveBody,
}: OrbitPaletteProps) {
  const canCollide = bodies.length >= 2

  const sourceLabels = (body: SystemBody) =>
    body.sourceEntryIds.map((id) => {
      const entry = historyEntries.find((e) => e.id === id)
      return entry?.digits ?? id.slice(0, 6)
    })

  const picking = collideSelectMoverId !== null
  const pickMoverLabel = useMemo(() => {
    if (!collideSelectMoverId) return ''
    return bodies.find((b) => b.id === collideSelectMoverId)?.label ?? 'body'
  }, [bodies, collideSelectMoverId])

  return (
    <PaletteShell label="Orbit">
      <section className="controls__block">
        <span className="controls__label">Cosmos</span>
        <p className="controls__hint">
          One fossil can orbit alone. Add more from the tray on separate tracks. Select a body, then
          Collide with… and click another fossil in the scene to send it on a chase.
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
        {picking ? (
          <p className="controls__hint controls__hint--accent" role="status">
            Select another fossil for {pickMoverLabel}. Esc or Cancel to quit.
          </p>
        ) : null}
        {bodies.length === 0 ? (
          <p className="controls__hint">
            Empty system — pick a saved fossil in the tray to place the first planet.
          </p>
        ) : (
          <div className="layer-list">
            {bodies.map((body, index) => {
              const expanded = selectedId === body.id
              const distance = resolveOrbitDistance(body.orbit, index, settings.spread)
              const scars = body.planet.scars.length
              const sources = sourceLabels(body)
              const isPickMover = collideSelectMoverId === body.id
              const isPickTarget =
                picking && collideSelectMoverId !== null && collideSelectMoverId !== body.id
              return (
                <div
                  key={body.id}
                  className={`layer-card ${expanded ? 'layer-card--expanded' : ''}${
                    isPickMover ? ' layer-card--collide-mover' : ''
                  }${isPickTarget ? ' layer-card--collide-target' : ''}`}
                >
                  <div className="layer-card__header">
                    <button
                      type="button"
                      className="layer-card__name"
                      onClick={() => {
                        if (picking && collideSelectMoverId && body.id !== collideSelectMoverId) {
                          onConfirmCollideTarget(body.id)
                          return
                        }
                        onSelectBody(body.id)
                      }}
                    >
                      {body.label}
                    </button>
                    <div className="layer-card__actions">
                      <button
                        type="button"
                        className="layer-card__remove"
                        title="Remove from System"
                        aria-label="Remove from System"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveBody(body.id)
                        }}
                      >
                        −
                      </button>
                    </div>
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
                        step={0.02}
                        value={distance}
                        onChange={(e) =>
                          onOrbitChange(body.id, { distance: Number(e.target.value) })
                        }
                      />
                      <FieldLabel
                        htmlFor={`orbit-tilt-${body.id}`}
                        tip="Orbit plane tilt."
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
                        step={0.01}
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
                          Surface record: {scars} mark{scars === 1 ? '' : 's'}
                          {sources.length > 0 ? ` · fossils ${sources.join(', ')}` : ''}
                          . Open View Surface to find Fossil Imprints — each stamp keeps that
                          fossil&apos;s outline, digits, and memory note.
                        </p>
                      ) : null}

                      {canCollide ? (
                        <div className="controls__collide">
                          {picking && isPickMover ? (
                            <>
                              <p className="controls__hint controls__hint--accent" role="status">
                                Select another fossil
                              </p>
                              <button
                                type="button"
                                className="controls__btn"
                                onClick={onCancelCollideSelect}
                              >
                                Cancel
                              </button>
                            </>
                          ) : !picking ? (
                            <button
                              type="button"
                              className="controls__btn controls__btn--primary"
                              onClick={() => onStartCollideSelect(body.id)}
                            >
                              Collide with…
                            </button>
                          ) : null}
                        </div>
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
