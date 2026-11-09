import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { HISTORY_MAX, loadHistoryFromRaw, type FossilHistoryEntry } from './history'
import { normalizeOrbitSystem, type OrbitSystemSettings } from './orbit'

export type CloudLibrary = {
  entries: FossilHistoryEntry[]
  orbit: OrbitSystemSettings
}

/** Shrink a data-URL thumb so a 12-entry library stays under Firestore's 1 MB doc limit. */
export function compressThumbSync(
  dataUrl: string,
  maxEdge = 96,
  quality = 0.55,
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl)
      return
    }
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      try {
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export async function prepareCloudEntries(
  entries: FossilHistoryEntry[],
): Promise<FossilHistoryEntry[]> {
  const sliced = entries.slice(-HISTORY_MAX)
  return Promise.all(
    sliced.map(async (entry) => ({
      ...entry,
      thumb: await compressThumbSync(entry.thumb),
    })),
  )
}

export function cloudDocRef(uid: string) {
  if (!db) throw new Error('Firestore is not ready.')
  return doc(db, 'users', uid, 'configs', 'fossil')
}

export async function saveCloudLibrary(
  uid: string,
  entries: FossilHistoryEntry[],
  orbit: OrbitSystemSettings,
): Promise<void> {
  const prepared = await prepareCloudEntries(entries)
  await setDoc(cloudDocRef(uid), {
    entries: prepared,
    orbit: normalizeOrbitSystem(orbit),
    updatedAt: serverTimestamp(),
  })
}

export async function loadCloudLibrary(uid: string): Promise<CloudLibrary | null> {
  const snapshot = await getDoc(cloudDocRef(uid))
  if (!snapshot.exists()) return null
  const data = snapshot.data() as Record<string, unknown>
  if (!Array.isArray(data.entries)) {
    throw new Error('Cloud library has an invalid format.')
  }
  return {
    entries: loadHistoryFromRaw(data.entries),
    orbit: normalizeOrbitSystem(data.orbit),
  }
}
