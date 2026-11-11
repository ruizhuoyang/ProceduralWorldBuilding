import { useCallback, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, firebaseReady } from '../firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [])

  const signInWithGoogle = useCallback(() => {
    if (!auth) return Promise.resolve()
    const current = auth
    return run(async () => {
      await signInWithPopup(current, new GoogleAuthProvider())
    })
  }, [run])

  const signOutUser = useCallback(() => {
    if (!auth) return Promise.resolve()
    const current = auth
    return run(async () => {
      await signOut(current)
    })
  }, [run])

  return {
    ready: Boolean(firebaseReady && auth),
    user,
    busy,
    error,
    clearError: () => setError(''),
    signInWithGoogle,
    signOutUser,
    run,
  }
}
