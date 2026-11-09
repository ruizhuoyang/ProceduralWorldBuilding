import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, firebaseReady } from '../firebase'
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
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseReady || !auth) return null
  const currentAuth = auth

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
              run(async () => {
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
              run(async () => {
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
          <button type="button" disabled={busy} onClick={() => run(() => signOut(currentAuth))}>
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await signInWithPopup(currentAuth, new GoogleAuthProvider())
            })
          }
        >
          Sign in with Google
        </button>
      )}
      {message ? (
        <span className="firebase-controls__message" role="status">
          {message}
        </span>
      ) : null}
    </div>
  )
}
