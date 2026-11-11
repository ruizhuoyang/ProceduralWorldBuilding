import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Controls from './components/Controls'
import FirebaseControls from './components/FirebaseControls'
import FossilCanvas, { type FossilCanvasHandle } from './components/FossilCanvas'
import HistoryTray from './components/HistoryTray'
import HomePage from './components/HomePage'
import OrbitPalette from './components/OrbitPalette'
import ViewportToolbar from './components/ViewportToolbar'
import { sanitizeDigits } from './lib/hashDigits'
import {
  clearHistoryStorage,
  HISTORY_MAX,
  loadHistory,
  makeHistoryId,
  normalizeMemoryNote,
  saveHistory,
  type FossilHistoryEntry,
} from './lib/history'
import type { SurfaceMemoryInfo } from './lib/planetFormation'
import {
  DEFAULT_ATMOSPHERE,
  DEFAULT_FOSSIL_PARAMS,
  DEFAULT_LIGHTING,
  normalizeAtmosphere,
  normalizeColorAlts,
  normalizeLighting,
  normalizeMeshResolution,
  normalizeOctaves,
  normalizeStoneColors,
  type AtmosphereParams,
  type FossilParams,
  type LightingParams,
  type LandformLayer,
  type ViewportMode,
} from './lib/types'
import { defaultLandformLayers, normalizeLandformLayers } from './lib/landforms'
import {
  DEFAULT_ORBIT_SYSTEM,
  defaultPlanetOrbit,
  loadOrbitSystem,
  normalizeOrbitSystem,
  normalizePlanetOrbit,
  saveOrbitSystem,
  type OrbitSystemSettings,
  type PlanetOrbit,
} from './lib/orbit'
import { computeEncounterOrbit } from './lib/encounterOrbit'
import {
  createSystemBodyFromEntry,
  mergeSystemBodies,
  type BodyCollision,
  type SystemBody,
} from './lib/systemBodies'
import './App.css'

export default function App() {
  const canvasRef = useRef<FossilCanvasHandle>(null)
  /** Home stays outside the project; React state below is kept when returning. */
  const [inProject, setInProject] = useState(false)

  const [draftDigits, setDraftDigits] = useState(DEFAULT_FOSSIL_PARAMS.digits)
  const [draftMemoryNote, setDraftMemoryNote] = useState('')
  const [appliedDigits, setAppliedDigits] = useState(DEFAULT_FOSSIL_PARAMS.digits)
  const [surfaceMemory, setSurfaceMemory] = useState<SurfaceMemoryInfo | null>(null)
  const [noiseStrength, setNoiseStrength] = useState(DEFAULT_FOSSIL_PARAMS.noiseStrength)
  const [noiseScale, setNoiseScale] = useState(DEFAULT_FOSSIL_PARAMS.noiseScale)
  const [digitStrength, setDigitStrength] = useState(DEFAULT_FOSSIL_PARAMS.digitStrength)
  const [fbmOctaves, setFbmOctaves] = useState(DEFAULT_FOSSIL_PARAMS.fbmOctaves)
  const [stoneColors, setStoneColors] = useState<string[]>(() => [
    ...DEFAULT_FOSSIL_PARAMS.stoneColors,
  ])
  const [colorAlts, setColorAlts] = useState<number[]>(() => [
    ...DEFAULT_FOSSIL_PARAMS.colorAlts,
  ])
  const [heightBlend, setHeightBlend] = useState(DEFAULT_FOSSIL_PARAMS.heightBlend)
  const [detail, setDetail] = useState(DEFAULT_FOSSIL_PARAMS.detail)
  const [landformLayers, setLandformLayers] = useState<LandformLayer[]>(() => defaultLandformLayers())
  const [normalStrength, setNormalStrength] = useState(DEFAULT_FOSSIL_PARAMS.normalStrength)
  const [lighting, setLighting] = useState<LightingParams>(DEFAULT_LIGHTING)
  const [atmosphere, setAtmosphere] = useState<AtmosphereParams>(DEFAULT_ATMOSPHERE)
  const [wireframe, setWireframe] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('view')
  const [orbitSystem, setOrbitSystem] = useState(false)
  const [interiorView, setInteriorView] = useState(false)
  const [surfaceView, setSurfaceView] = useState(false)
  const [systemBodies, setSystemBodies] = useState<SystemBody[]>([])
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null)
  /** First body chosen for Collide with… — waiting for a scene/list target click. */
  const [collideSelectMoverId, setCollideSelectMoverId] = useState<string | null>(null)
  /** Active chase after a target is confirmed (cleared on merge / cancel system). */
  const [approachPair, setApproachPair] = useState<{ moverId: string; targetId: string } | null>(
    null,
  )
  const [orbitSettings, setOrbitSettings] = useState<OrbitSystemSettings>(DEFAULT_ORBIT_SYSTEM)
  const [seed, setSeed] = useState(0)
  const [revision, setRevision] = useState(0)
  const [history, setHistory] = useState<FossilHistoryEntry[]>([])

  const isEdit = viewportMode === 'edit'
  const isView = viewportMode === 'view'

  const selectedBody =
    systemBodies.find((body) => body.id === selectedBodyId) ?? systemBodies[systemBodies.length - 1] ?? null

  const setMode = (mode: ViewportMode) => {
    setViewportMode(mode)
    if (mode === 'edit') {
      setOrbitSystem(false)
      setInteriorView(false)
      setSurfaceView(false)
      setSurfaceMemory(null)
      setCollideSelectMoverId(null)
    }
  }

  useEffect(() => {
    if (!orbitSystem) setCollideSelectMoverId(null)
  }, [orbitSystem])

  useEffect(() => {
    setHistory(loadHistory())
    setOrbitSettings(loadOrbitSystem())
  }, [])

  useEffect(() => {
    if (systemBodies.length === 0) {
      setSelectedBodyId(null)
      return
    }
    if (!selectedBodyId || !systemBodies.some((body) => body.id === selectedBodyId)) {
      setSelectedBodyId(systemBodies[systemBodies.length - 1]!.id)
    }
  }, [systemBodies, selectedBodyId])

  const bumpRevision = useCallback(() => {
    setRevision((r) => r + 1)
  }, [])

  const params: FossilParams = useMemo(
    () => ({
      ...DEFAULT_FOSSIL_PARAMS,
      digits: appliedDigits,
      noiseStrength,
      noiseScale,
      digitStrength,
      stoneColors: normalizeStoneColors(stoneColors),
      colorAlts: normalizeColorAlts(colorAlts, normalizeStoneColors(stoneColors).length),
      heightBlend,
      detail: normalizeMeshResolution(detail),
      fbmOctaves: normalizeOctaves(fbmOctaves),
      normalStrength,
      landformLayers: normalizeLandformLayers(landformLayers),
    }),
    [
      appliedDigits,
      noiseStrength,
      noiseScale,
      digitStrength,
      stoneColors,
      colorAlts,
      heightBlend,
      detail,
      fbmOctaves,
      normalStrength,
      landformLayers,
    ],
  )

  const commitParam = (fn: () => void) => {
    fn()
    bumpRevision()
  }

  const handleGenerate = () => {
    const next = sanitizeDigits(draftDigits)
    setDraftDigits(next)
    setAppliedDigits(next)
    setNoiseStrength(DEFAULT_FOSSIL_PARAMS.noiseStrength)
    setNoiseScale(DEFAULT_FOSSIL_PARAMS.noiseScale)
    setDigitStrength(DEFAULT_FOSSIL_PARAMS.digitStrength)
    setFbmOctaves(DEFAULT_FOSSIL_PARAMS.fbmOctaves)
    setStoneColors([...DEFAULT_FOSSIL_PARAMS.stoneColors])
    setColorAlts([...DEFAULT_FOSSIL_PARAMS.colorAlts])
    setHeightBlend(DEFAULT_FOSSIL_PARAMS.heightBlend)
    setDetail(DEFAULT_FOSSIL_PARAMS.detail)
    setLandformLayers(defaultLandformLayers())
    setNormalStrength(DEFAULT_FOSSIL_PARAMS.normalStrength)
    setLighting({ ...DEFAULT_LIGHTING })
    setAtmosphere({ ...DEFAULT_ATMOSPHERE })
    setWireframe(false)
    setShowMapping(false)
    bumpRevision()
    canvasRef.current?.resetView()
  }

  const handleLightingChange = (patch: Partial<LightingParams>) => {
    setLighting((prev) => normalizeLighting({ ...prev, ...patch }))
  }

  const handleAtmosphereChange = (patch: Partial<AtmosphereParams>) => {
    setAtmosphere((prev) => normalizeAtmosphere({ ...prev, ...patch }))
  }

  const handleSave = () => {
    const thumb = canvasRef.current?.captureThumbnail()
    if (!thumb) return
    const entry: FossilHistoryEntry = {
      id: makeHistoryId(),
      digits: appliedDigits,
      memoryNote: normalizeMemoryNote(draftMemoryNote),
      seed,
      thumb,
      createdAt: Date.now(),
      params: {
        noiseStrength,
        noiseScale,
        digitStrength,
        stoneColors: normalizeStoneColors(stoneColors),
        colorAlts: normalizeColorAlts(colorAlts, normalizeStoneColors(stoneColors).length),
        heightBlend,
        detail,
        fbmOctaves: normalizeOctaves(fbmOctaves),
        normalStrength,
        landformLayers: normalizeLandformLayers(landformLayers),
      },
      lighting: { ...lighting },
      atmosphere: { ...atmosphere },
      orbit: defaultPlanetOrbit(appliedDigits),
    }
    setHistory((prev) => {
      const next = [...prev, entry].slice(-HISTORY_MAX)
      saveHistory(next)
      return next
    })
  }

  const handleExportStl = () => {
    const name = `data-fossil-${appliedDigits || 'rock'}.stl`
    canvasRef.current?.exportSTL(name)
  }

  const handleClearHistory = () => {
    clearHistoryStorage()
    setHistory([])
  }

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id)
      saveHistory(next)
      return next
    })
  }

  const handleSelectHistory = (entry: FossilHistoryEntry) => {
    setDraftDigits(entry.digits)
    setDraftMemoryNote(normalizeMemoryNote(entry.memoryNote))
    setAppliedDigits(entry.digits)
    setNoiseStrength(entry.params.noiseStrength)
    setNoiseScale(entry.params.noiseScale)
    setDigitStrength(entry.params.digitStrength)
    setFbmOctaves(normalizeOctaves(entry.params.fbmOctaves))
    setStoneColors(normalizeStoneColors(entry.params.stoneColors))
    setColorAlts(
      normalizeColorAlts(entry.params.colorAlts, normalizeStoneColors(entry.params.stoneColors).length),
    )
    setHeightBlend(entry.params.heightBlend)
    setDetail(normalizeMeshResolution(entry.params.detail))
    setLandformLayers(normalizeLandformLayers(entry.params.landformLayers))
    setNormalStrength(entry.params.normalStrength)
    setLighting(normalizeLighting(entry.lighting))
    setAtmosphere(normalizeAtmosphere(entry.atmosphere))
    bumpRevision()
  }

  const handleAddToSystem = (entry: FossilHistoryEntry) => {
    const livePhases = canvasRef.current?.getSolarPhases() ?? {}
    setSystemBodies((prev) => {
      const synced = prev.map((body) =>
        typeof livePhases[body.id] === 'number' ? { ...body, phase: livePhases[body.id]! } : body,
      )
      const body = createSystemBodyFromEntry(entry, synced, orbitSettings)
      setSelectedBodyId(body.id)
      return [...synced, body]
    })
    if (!orbitSystem) {
      setInteriorView(false)
      setSurfaceView(false)
      setOrbitSystem(true)
    }
  }

  const handleBodiesCollide = useCallback((collision: BodyCollision) => {
    setCollideSelectMoverId(null)
    setApproachPair(null)
    setSystemBodies((prev) => {
      const survivor = prev.find((body) => body.id === collision.survivorId)
      const absorbed = prev.find((body) => body.id === collision.absorbedId)
      if (!survivor || !absorbed) return prev
      const merged = mergeSystemBodies(survivor, absorbed, collision)
      setSelectedBodyId(merged.id)
      return prev.filter((body) => body.id !== survivor.id && body.id !== absorbed.id).concat(merged)
    })
  }, [])

  const handleOrbitSettings = (patch: Partial<OrbitSystemSettings>) => {
    setOrbitSettings((prev) => {
      const next = normalizeOrbitSystem({ ...prev, ...patch })
      saveOrbitSystem(next)
      return next
    })
  }

  const handlePlanetOrbit = (id: string, patch: Partial<PlanetOrbit>) => {
    setSystemBodies((prev) =>
      prev.map((body) =>
        body.id === id
          ? {
              ...body,
              orbit: normalizePlanetOrbit({ ...body.orbit, ...patch }, body.planet.digits),
            }
          : body,
      ),
    )
  }

  const handleCancelCollideSelect = useCallback(() => {
    setCollideSelectMoverId(null)
  }, [])

  const handleStartCollideSelect = useCallback((moverId: string) => {
    setSelectedBodyId(moverId)
    setCollideSelectMoverId(moverId)
  }, [])

  const handleConfirmCollideTarget = useCallback(
    (targetId: string) => {
      const moverId = collideSelectMoverId
      if (!moverId || targetId === moverId) return
      const livePhases = canvasRef.current?.getSolarPhases() ?? {}
      setSystemBodies((prev) => {
        const withPhases = prev.map((body) =>
          typeof livePhases[body.id] === 'number' ? { ...body, phase: livePhases[body.id]! } : body,
        )
        const mover = withPhases.find((b) => b.id === moverId)
        const target = withPhases.find((b) => b.id === targetId)
        if (!mover || !target) return withPhases
        const targetIndex = Math.max(
          0,
          withPhases.findIndex((b) => b.id === target.id),
        )
        const plan = computeEncounterOrbit(mover, target, orbitSettings, targetIndex)
        setApproachPair({ moverId, targetId })
        setCollideSelectMoverId(null)
        setSelectedBodyId(moverId)
        return withPhases.map((body) => {
          if (body.id !== moverId) return body
          return {
            ...body,
            phase: plan.phase,
            nodeAngle: plan.nodeAngle,
            orbit: normalizePlanetOrbit(plan.orbit, body.planet.digits),
          }
        })
      })
    },
    [collideSelectMoverId, orbitSettings],
  )

  useEffect(() => {
    if (!collideSelectMoverId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCollideSelectMoverId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collideSelectMoverId])

  useEffect(() => {
    if (!approachPair) return
    const alive = new Set(systemBodies.map((b) => b.id))
    if (!alive.has(approachPair.moverId) || !alive.has(approachPair.targetId)) {
      setApproachPair(null)
    }
  }, [systemBodies, approachPair])

  const handleLoadCloudLibrary = (payload: {
    entries: FossilHistoryEntry[]
    orbit: OrbitSystemSettings
  }) => {
    setHistory(payload.entries)
    saveHistory(payload.entries)
    setOrbitSettings(payload.orbit)
    saveOrbitSystem(payload.orbit)
    if (payload.entries.length > 0) {
      handleSelectHistory(payload.entries[payload.entries.length - 1])
    }
  }

  const showOrbitPalette = isView && orbitSystem
  const canOpenOrbit = history.length > 0 || systemBodies.length > 0 || orbitSystem
  const canViewSystemSurface = systemBodies.length > 0
  const focusSystemBody =
    canViewSystemSurface && (surfaceView || interiorView) ? selectedBody : null
  const viewTitle =
    focusSystemBody && surfaceView
      ? `${focusSystemBody.label} · Surface`
      : focusSystemBody && interiorView
        ? `${focusSystemBody.label} · Interior`
        : 'Data Fossil'

  const handleRemoveBody = useCallback(
    (id: string) => {
      canvasRef.current?.cancelAccretion()
      setCollideSelectMoverId((prev) => (prev === id ? null : prev))
      setApproachPair((prev) =>
        prev && (prev.moverId === id || prev.targetId === id) ? null : prev,
      )
      setSurfaceMemory(null)
      setSystemBodies((prev) => prev.filter((body) => body.id !== id))
    },
    [],
  )

  if (!inProject) {
    return <HomePage onEnter={() => setInProject(true)} />
  }

  return (
    <div className={`app ${isEdit ? 'app--edit' : 'app--view'}${showOrbitPalette ? ' app--orbit' : ''}`}>
      <main className="app__stage">
        <header className="app__brand">
          <h1 className="app__title">
            <button
              type="button"
              className="app__title-home"
              onClick={() => setInProject(false)}
              title="Home"
              aria-label="Home — Data Fossil"
            >
              {viewTitle}
            </button>
          </h1>
          <p className="app__brand-note">The digits you enter shape the stone.</p>
        </header>

        <div className="app__chrome-right">
          <FirebaseControls
            entries={history}
            orbit={orbitSettings}
            onLoadLibrary={handleLoadCloudLibrary}
          />
          <ViewportToolbar
            wireframe={wireframe}
            onWireframeChange={setWireframe}
            showMapping={showMapping}
            onShowMappingChange={setShowMapping}
            particlesVisible={atmosphere.visible}
            onParticlesVisibleChange={(visible) => handleAtmosphereChange({ visible })}
            particlesPlaying={atmosphere.playing}
            onParticlesPlayingChange={(playing) => handleAtmosphereChange({ playing })}
            onResetView={() => canvasRef.current?.resetView()}
          />
          <div className="app__mode-switch" role="group" aria-label="Viewport mode">
            <button
              type="button"
              className={`app__mode-btn ${viewportMode === 'view' ? 'app__mode-btn--active' : ''}`}
              aria-pressed={viewportMode === 'view'}
              onClick={() => setMode('view')}
            >
              View
            </button>
            <button
              type="button"
              className={`app__mode-btn ${viewportMode === 'edit' ? 'app__mode-btn--active' : ''}`}
              aria-pressed={viewportMode === 'edit'}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
          </div>
        </div>

        <FossilCanvas
          ref={canvasRef}
          params={params}
          lighting={lighting}
          atmosphere={atmosphere}
          revision={revision}
          wireframe={wireframe}
          showMapping={showMapping}
          viewportMode={viewportMode}
          orbitSystem={orbitSystem && isView}
          interiorView={interiorView && isView}
          surfaceView={surfaceView && isView}
          systemBodies={systemBodies}
          surfaceBody={focusSystemBody}
          historyEntries={history}
          orbitSettings={orbitSettings}
          collideSelectMoverId={collideSelectMoverId}
          approachPair={approachPair}
          onSeedChange={setSeed}
          onBodiesCollide={handleBodiesCollide}
          onSurfaceMemoryPick={setSurfaceMemory}
          onPickCollideTarget={handleConfirmCollideTarget}
        />

        {surfaceView && surfaceMemory ? (
          <aside className="app__memory-card" aria-label="Surface memory">
            <button
              type="button"
              className="app__memory-card-close"
              aria-label="Close memory"
              onClick={() => {
                setSurfaceMemory(null)
                canvasRef.current?.notifySurfaceMemoryClosed()
              }}
            >
              ×
            </button>
            <p className="app__memory-card-digits">{surfaceMemory.digits || '—'}</p>
            {surfaceMemory.memoryNote ? (
              <p className="app__memory-card-note">{surfaceMemory.memoryNote}</p>
            ) : null}
          </aside>
        ) : null}

        {isView && (
          <div className="app__view-btns">
            <button
              type="button"
              className={`app__orbit-btn ${interiorView ? 'app__orbit-btn--on' : ''}`}
              aria-pressed={interiorView}
              title={
                interiorView
                  ? systemBodies.length > 0
                    ? 'Back to stellar system'
                    : 'Exit interior panorama'
                  : canViewSystemSurface
                    ? `Interior of ${selectedBody?.label ?? 'selected planet'}`
                    : 'Interior panorama — look around inside the stone'
              }
              onClick={() => {
                if (interiorView) {
                  setInteriorView(false)
                  setSurfaceMemory(null)
                  if (systemBodies.length > 0) setOrbitSystem(true)
                  return
                }
                setOrbitSystem(false)
                setSurfaceView(false)
                setSurfaceMemory(null)
                setInteriorView(true)
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <circle
                  cx="12"
                  cy="12"
                  r="8.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="12" cy="12" r="1.15" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`app__orbit-btn ${surfaceView ? 'app__orbit-btn--on' : ''}`}
              aria-pressed={surfaceView}
              title={
                surfaceView
                  ? orbitSystem || systemBodies.length > 0
                    ? 'Back to stellar system'
                    : 'Exit surface panorama'
                  : canViewSystemSurface
                    ? 'Surface panorama of the selected system planet'
                    : 'Surface panorama — WASD move, drag to look'
              }
              onClick={() => {
                if (surfaceView) {
                  setSurfaceView(false)
                  setSurfaceMemory(null)
                  if (systemBodies.length > 0) setOrbitSystem(true)
                  return
                }
                setInteriorView(false)
                setOrbitSystem(false)
                setSurfaceMemory(null)
                setSurfaceView(true)
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  d="M3.5 16.5c2.2-1.4 4.6-2.1 8.5-2.1s6.3.7 8.5 2.1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M4.2 13.2c2.1-2.6 4.7-4 7.8-4s5.7 1.4 7.8 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="7.2" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="7.2" r="0.7" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`app__orbit-btn ${orbitSystem ? 'app__orbit-btn--on' : ''}`}
              aria-pressed={orbitSystem}
              title={
                !canOpenOrbit
                  ? 'Save fossils in Edit first'
                  : orbitSystem
                    ? 'Exit stellar system'
                    : 'Stellar system — add fossils from the tray; orbits can collide and merge'
              }
              disabled={!canOpenOrbit && !orbitSystem}
              onClick={() => {
                if (orbitSystem) {
                  setOrbitSystem(false)
                  return
                }
                setInteriorView(false)
                setSurfaceView(false)
                setOrbitSystem(true)
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="8.5"
                  ry="3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  transform="rotate(-24 12 12)"
                />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="8.5"
                  ry="3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  transform="rotate(48 12 12)"
                />
                <circle cx="19.2" cy="9.2" r="1.15" fill="currentColor" />
                <circle cx="6.4" cy="14.6" r="0.95" fill="currentColor" />
              </svg>
            </button>
          </div>
        )}
        {!interiorView && !surfaceView && (
          <HistoryTray
            entries={history}
            onSelect={orbitSystem ? handleAddToSystem : handleSelectHistory}
            onDelete={handleDeleteHistory}
            formationMode={orbitSystem}
            selectedId={null}
          />
        )}
      </main>

      {isEdit && (
        <Controls
          draftDigits={draftDigits}
          onDraftDigitsChange={setDraftDigits}
          draftMemoryNote={draftMemoryNote}
          onDraftMemoryNoteChange={setDraftMemoryNote}
          appliedDigits={appliedDigits}
          seed={seed}
          noiseStrength={noiseStrength}
          onNoiseStrengthChange={(v) => commitParam(() => setNoiseStrength(v))}
          noiseScale={noiseScale}
          onNoiseScaleChange={(v) => commitParam(() => setNoiseScale(v))}
          fbmOctaves={fbmOctaves}
          onFbmOctavesChange={(v) => commitParam(() => setFbmOctaves(normalizeOctaves(v)))}
          digitStrength={digitStrength}
          onDigitStrengthChange={(v) => commitParam(() => setDigitStrength(v))}
          detail={detail}
          onDetailChange={(v) => commitParam(() => setDetail(normalizeMeshResolution(v)))}
          landformLayers={landformLayers}
          onLandformLayersChange={(layers) =>
            commitParam(() => setLandformLayers(normalizeLandformLayers(layers)))
          }
          stoneColors={stoneColors}
          colorAlts={colorAlts}
          onStoneColorsChange={(colors) =>
            commitParam(() => setStoneColors(normalizeStoneColors(colors)))
          }
          onColorAltsChange={(alts) => commitParam(() => setColorAlts(alts))}
          heightBlend={heightBlend}
          onHeightBlendChange={(v) => commitParam(() => setHeightBlend(v))}
          normalStrength={normalStrength}
          onNormalStrengthChange={(v) => commitParam(() => setNormalStrength(v))}
          lighting={lighting}
          onLightingChange={handleLightingChange}
          atmosphere={atmosphere}
          onAtmosphereChange={handleAtmosphereChange}
          onGenerate={handleGenerate}
          onSave={handleSave}
          onExportStl={handleExportStl}
          onClearHistory={handleClearHistory}
          historyCount={history.length}
        />
      )}

      {showOrbitPalette ? (
        <OrbitPalette
          settings={orbitSettings}
          onSettingsChange={handleOrbitSettings}
          bodies={systemBodies}
          selectedId={selectedBodyId}
          onSelectBody={(id) => {
            if (collideSelectMoverId && id !== collideSelectMoverId) {
              handleConfirmCollideTarget(id)
              return
            }
            setSelectedBodyId(id)
          }}
          onOrbitChange={handlePlanetOrbit}
          collideSelectMoverId={collideSelectMoverId}
          onStartCollideSelect={handleStartCollideSelect}
          onCancelCollideSelect={handleCancelCollideSelect}
          onConfirmCollideTarget={handleConfirmCollideTarget}
          historyEntries={history}
          onClearSystem={() => {
            canvasRef.current?.cancelAccretion()
            setCollideSelectMoverId(null)
            setApproachPair(null)
            setSystemBodies([])
          }}
          onRemoveBody={handleRemoveBody}
        />
      ) : null}
    </div>
  )
}
