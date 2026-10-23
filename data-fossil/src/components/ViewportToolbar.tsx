import './ViewportToolbar.css'

export type ViewportToolbarProps = {
  wireframe: boolean
  onWireframeChange: (v: boolean) => void
  showMapping: boolean
  onShowMappingChange: (v: boolean) => void
  particlesVisible: boolean
  onParticlesVisibleChange: (v: boolean) => void
  particlesPlaying: boolean
  onParticlesPlayingChange: (v: boolean) => void
  onResetView: () => void
}

export default function ViewportToolbar({
  wireframe,
  onWireframeChange,
  showMapping,
  onShowMappingChange,
  particlesVisible,
  onParticlesVisibleChange,
  particlesPlaying,
  onParticlesPlayingChange,
  onResetView,
}: ViewportToolbarProps) {
  return (
    <div className="vp-tools" role="toolbar" aria-label="Viewport tools">
      <button
        type="button"
        className={`vp-tools__btn ${wireframe ? 'vp-tools__btn--on' : ''}`}
        aria-pressed={wireframe}
        title="Wireframe"
        onClick={() => onWireframeChange(!wireframe)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            d="M12 3.5V12m0 0 8-4M12 12l-8-4m8 0v8.5"
          />
        </svg>
      </button>

      <button
        type="button"
        className={`vp-tools__btn ${showMapping ? 'vp-tools__btn--on' : ''}`}
        aria-pressed={showMapping}
        title="Show Mapping"
        onClick={() => onShowMappingChange(!showMapping)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="8" r="1.35" fill="currentColor" />
          <circle cx="16" cy="13.5" r="1.35" fill="currentColor" />
          <circle cx="8" cy="13.5" r="1.35" fill="currentColor" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            d="M12 9.4v2.2M16 12.2l-1.9 1.1M8 12.2l1.9 1.1"
          />
        </svg>
      </button>

      <button
        type="button"
        className={`vp-tools__btn ${particlesVisible ? 'vp-tools__btn--on' : ''}`}
        aria-pressed={particlesVisible}
        title={particlesVisible ? 'Hide particles' : 'Show particles'}
        onClick={() => onParticlesVisibleChange(!particlesVisible)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="5.2" r="1.15" fill="currentColor" />
          <circle cx="17.4" cy="8.2" r="1.15" fill="currentColor" />
          <circle cx="17.6" cy="15.4" r="1.15" fill="currentColor" />
          <circle cx="12" cy="18.8" r="1.15" fill="currentColor" />
          <circle cx="6.4" cy="15.4" r="1.15" fill="currentColor" />
          <circle cx="6.6" cy="8.2" r="1.15" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        className={`vp-tools__btn ${particlesPlaying ? 'vp-tools__btn--on' : ''}`}
        aria-pressed={particlesPlaying}
        title={particlesPlaying ? 'Pause particles' : 'Play particles'}
        onClick={() => onParticlesPlayingChange(!particlesPlaying)}
      >
        {particlesPlaying ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M7.4 5.5h3.2v13H7.4zM13.4 5.5h3.2v13h-3.2z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M8.2 5.4v13.2L18.4 12 8.2 5.4Z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="vp-tools__btn"
        title="Reset View"
        onClick={onResetView}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.2 3.8v4.2H13M6.8 20.2v-4.2H11"
          />
        </svg>
      </button>
    </div>
  )
}
