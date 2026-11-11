import type { FossilHistoryEntry } from '../lib/history'
import './HistoryTray.css'

type HistoryTrayProps = {
  entries: FossilHistoryEntry[]
  onSelect: (entry: FossilHistoryEntry) => void
  onDelete: (id: string) => void
  /** Formation mode: tray seeds / stages fossils instead of loading into Edit. */
  formationMode?: boolean
  selectedId?: string | null
  disabled?: boolean
}

export default function HistoryTray({
  entries,
  onSelect,
  onDelete,
  formationMode = false,
  selectedId = null,
  disabled = false,
}: HistoryTrayProps) {
  if (entries.length === 0) return null

  return (
    <div
      className={`history-tray${formationMode ? ' history-tray--formation' : ''}`}
      aria-label={formationMode ? 'Saved fossils for planet formation' : 'Saved fossils'}
    >
      {formationMode ? (
        <p className="history-tray__caption">Add to system</p>
      ) : null}
      <ul className="history-tray__list">
        {entries.map((entry) => {
          const selected = selectedId === entry.id
          return (
            <li key={entry.id} className="history-tray__cell">
              <button
                type="button"
                className={`history-tray__item${selected ? ' history-tray__item--selected' : ''}`}
                title={
                  formationMode
                    ? `Add ${entry.digits} to planet`
                    : `${entry.digits} · seed ${entry.seed}`
                }
                disabled={disabled}
                onClick={() => onSelect(entry)}
              >
                <img src={entry.thumb} alt="" className="history-tray__thumb" />
                <span className="history-tray__digits">{entry.digits}</span>
              </button>
              {!formationMode ? (
                <button
                  type="button"
                  className="history-tray__delete"
                  aria-label={`Delete ${entry.digits}`}
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(entry.id)
                  }}
                >
                  ×
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
