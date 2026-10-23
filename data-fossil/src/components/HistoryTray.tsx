import type { FossilHistoryEntry } from '../lib/history'
import './HistoryTray.css'

type HistoryTrayProps = {
  entries: FossilHistoryEntry[]
  onSelect: (entry: FossilHistoryEntry) => void
  onDelete: (id: string) => void
}

export default function HistoryTray({ entries, onSelect, onDelete }: HistoryTrayProps) {
  if (entries.length === 0) return null

  return (
    <div className="history-tray" aria-label="Saved fossils">
      <ul className="history-tray__list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-tray__cell">
            <button
              type="button"
              className="history-tray__item"
              title={`${entry.digits} · seed ${entry.seed}`}
              onClick={() => onSelect(entry)}
            >
              <img src={entry.thumb} alt="" className="history-tray__thumb" />
              <span className="history-tray__digits">{entry.digits}</span>
            </button>
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
          </li>
        ))}
      </ul>
    </div>
  )
}
