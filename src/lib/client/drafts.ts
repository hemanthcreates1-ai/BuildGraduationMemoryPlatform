'use client'

/**
 * Tiny IndexedDB key-value store for unsaved work (drawings in progress). This is only a local
 * safety net so nothing is lost on refresh or a dropped connection; submitted contributions
 * always live in the server database.
 */
const DB_NAME = 'the-last-jersey-drafts'
const STORE = 'drafts'

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

export async function saveDraft<T>(key: string, value: T) {
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  const db = await open()
  if (!db) return null
  const value = await new Promise<T | null>((resolve) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    request.onsuccess = () => resolve((request.result as T) ?? null)
    request.onerror = () => resolve(null)
  })
  db.close()
  return value
}

export async function deleteDraft(key: string) {
  const db = await open()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}
