import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { loadCloudLibrary, saveCloudLibrary } from '../lib/cloudLibrary'
import type { FossilHistoryEntry } from '../lib/history'
import type { OrbitSystemSettings } from '../lib/orbit'
import './FirebaseControls.css'

type Props = {
  entries: FossilHistoryEntry[]
  orbit: OrbitSystemSettings
  onLoadLibrary: (payload: {
    entries: FossilHistoryEntry[]
    orbit: OrbitSystemSettings
  }) => void
}

export default function FirebaseControls({ entries, orbit, onLoadLibrary }: Props) {
  const { ready, user, busy, error, signInWithGoogle, signOutUser, run } = useAuth()
  const [message, setMessage] = useState('')

  if (!ready) return null

  return (
    <div className="firebase-controls" aria-label="Cloud save">
      {user ? (
        <>
          <span className="firebase-controls__user" title={user.email ?? ''}>
            {user.displayName ?? user.email}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMessage('')
                await saveCloudLibrary(user.uid, entries, orbit)
                setMessage('Library saved to cloud.')
              })
            }
          >
            Cloud Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMessage('')
                const library = await loadCloudLibrary(user.uid)
                if (!library) {
                  setMessage('No cloud library yet.')
                  return
                }
                onLoadLibrary(library)
                setMessage(`Loaded ${library.entries.length} fossil(s).`)
              })
            }
          >
            Cloud Load
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setMessage('')
                await signOutUser()
              })()
            }
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void (async () => {
              setMessage('')
              await signInWithGoogle()
            })()
          }
        >
          Sign in with Google
        </button>
      )}
      {message || error ? (
        <span className="firebase-controls__message" role="status">
          {message || error}
        </span>
      ) : null}
    </div>
  )
}
