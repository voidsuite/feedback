/**
 * Docs context — the local document registry + encrypted cloud sync.
 *
 * - Every doc gets a random 256-bit doc key (base64url). The raw key is
 *   wrapped under the Vault Key and stored in the doc's metadata.
 * - Doc metadata + Yjs updates + versions live in IndexedDB, encrypted at
 *   rest (metadata under the Vault Key; updates + snapshots under the doc key).
 * - Cloud sync serializes all encrypted state into one opaque blob
 *   (AES-GCM under the Vault Key) and stores it via the VoidAuth storage
 *   API. Two-way merge is idempotent: doc metadata is last-write-wins,
 *   doc updates and versions dedupe by id (Yjs CRDTs make replay safe).
 */

import * as React from "react"
import * as api from "@/lib/api"
import { useAuth } from "@/contexts/auth"
import { useVault } from "@/contexts/vault"
import { useSettings } from "@/contexts/settings"
import {
  appendDocUpdateWithId,
  dbDeleteDoc,
  dbGetAllDocsRaw,
  dbGetAllUpdatesRaw,
  dbGetAllVersionsRaw,
  dbGetDoc,
  dbLoadDocs,
  dbPutStoredDoc,
  dbSaveDoc,
  dbSaveVersion,
  kvGet,
  kvSet,
} from "@/lib/db"
import {
  b64UrlToBytes,
  bytesToB64Url,
  decryptStringWithKey,
  encryptStringWithKey,
  getOrCreateDeviceKey,
  keyToB64Url,
  randomId,
  randomKeyB64,
} from "@/lib/crypto"
import { cacheVaultKey } from "@/lib/keychain"
import { defaultPageSettings, type DocMeta, type VersionRecord } from "@/lib/types"
import { loadDocPreview } from "@/lib/preview"

const CLOUD_KEY = "vdocs_cloud_v1"

export interface CloudSyncState {
  state: "idle" | "syncing" | "synced" | "error"
  message?: string
  lastSync?: number
}

export interface DocHandle {
  meta: DocMeta
  /** Raw base64url doc key (unwrapped) — needed for the editor + sharing. */
  docKey: string
}

export interface DocPreview {
  /** JPEG data URL of the rendered page — display as an <img>. */
  image: string | null
  words: number
}

interface DocsContextValue {
  loading: boolean
  docs: DocMeta[]
  search: string
  setSearch: (q: string) => void
  createDoc: (title?: string) => Promise<DocMeta>
  /** Create a local doc adopting a share-link's key (link owner's doc). */
  adoptSharedDoc: (id: string, docKeyB64: string) => Promise<DocMeta>
  loadDoc: (id: string) => Promise<DocHandle | null>
  renameDoc: (id: string, title: string) => Promise<void>
  /** Patch arbitrary metadata (page settings, stars, updatedAt…). */
  patchDoc: (id: string, patch: Partial<DocMeta>) => Promise<void>
  deleteDoc: (id: string) => Promise<void>
  toggleStar: (id: string) => Promise<void>
  /** Plain-text preview of a doc's content (home-page cards). */
  previewDoc: (id: string) => Promise<DocPreview | null>
  cloud: CloudSyncState
  /** Push the encrypted cloud backup. Resolves true when the sync succeeded. */
  syncNow: () => Promise<boolean>
}

const DocsContext = React.createContext<DocsContextValue | undefined>(undefined)

interface CloudBlobV1 {
  v: 1
  exportedAt: number
  docs: { id: string; dataEnc: string; updatedAt: number }[]
  updates: { id: string; docId: string; payload: string }[]
  versions: VersionRecord[]
}

export function DocsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const vault = useVault()
  const { settings, updateSettings } = useSettings()
  const [loading, setLoading] = React.useState(true)
  const [docs, setDocs] = React.useState<DocMeta[]>([])
  const [search, setSearch] = React.useState("")
  const [cloud, setCloud] = React.useState<CloudSyncState>({ state: "idle" })

  const refreshDocs = React.useCallback(async () => {
    if (!vault.ready || !vault.key) {
      setDocs([])
      setLoading(false)
      return
    }
    const all = await dbLoadDocs(vault.key)
    setDocs(all.filter((d) => !d.deleted).sort((a, b) => b.updatedAt - a.updatedAt))
    setLoading(false)
  }, [vault.ready, vault.key])

  React.useEffect(() => {
    void refreshDocs()
  }, [refreshDocs])

  const createDoc = React.useCallback(
    async (title = "Untitled document"): Promise<DocMeta> => {
      if (!vault.key) throw new Error("Vault is not unlocked")
      const now = Date.now()
      const meta: DocMeta = {
        id: randomId(),
        title,
        createdAt: now,
        updatedAt: now,
        wrappedDocKey: await encryptStringWithKey(randomKeyB64(), vault.key),
        starred: false,
        ownerId: user?.id,
        page: { ...defaultPageSettings },
      }
      await dbSaveDoc(meta, vault.key)
      await refreshDocs()
      return meta
    },
    [vault.key, refreshDocs, user?.id]
  )

  const loadDoc = React.useCallback(
    async (id: string): Promise<DocHandle | null> => {
      if (!vault.key) return null
      const meta = await dbGetDoc(id, vault.key)
      if (!meta) return null
      const docKey = await decryptStringWithKey(meta.wrappedDocKey, vault.key)
      return { meta, docKey }
    },
    [vault.key]
  )

  const adoptSharedDoc = React.useCallback(
    async (id: string, docKeyB64: string): Promise<DocMeta> => {
      if (!vault.key) throw new Error("Vault is locked")
      const now = Date.now()
      const meta: DocMeta = {
        id,
        title: "Shared document",
        createdAt: now,
        updatedAt: now,
        wrappedDocKey: await encryptStringWithKey(docKeyB64, vault.key),
        starred: false,
        ownerId: user?.id,
        page: { ...defaultPageSettings },
      }
      await dbSaveDoc(meta, vault.key)
      await refreshDocs()
      return meta
    },
    [vault.key, refreshDocs, user?.id]
  )

  const renameDoc = React.useCallback(
    async (id: string, title: string) => {
      if (!vault.key) return
      const meta = await dbGetDoc(id, vault.key)
      if (!meta) return
      meta.title = title
      meta.updatedAt = Date.now()
      await dbSaveDoc(meta, vault.key)
      await refreshDocs()
    },
    [vault.key, refreshDocs]
  )

  const deleteDoc = React.useCallback(
    async (id: string) => {
      await dbDeleteDoc(id)
      await refreshDocs()
    },
    [refreshDocs]
  )

  const patchDoc = React.useCallback(
    async (id: string, patch: Partial<DocMeta>) => {
      if (!vault.key) return
      const meta = await dbGetDoc(id, vault.key)
      if (!meta) return
      Object.assign(meta, patch)
      meta.updatedAt = Date.now()
      await dbSaveDoc(meta, vault.key)
      await refreshDocs()
    },
    [vault.key, refreshDocs]
  )

  const toggleStar = React.useCallback(
    async (id: string) => {
      if (!vault.key) return
      const meta = await dbGetDoc(id, vault.key)
      if (!meta) return
      meta.starred = !meta.starred
      meta.updatedAt = Date.now()
      await dbSaveDoc(meta, vault.key)
      await refreshDocs()
    },
    [vault.key, refreshDocs]
  )

  // --- Home-page previews (rasterized thumbnails, cached per doc + updatedAt) ---
  const previewCache = React.useRef(new Map<string, { updatedAt: number; image: string | null; words: number }>())
  const pendingPreviews = React.useRef(new Map<string, Promise<DocPreview | null>>())

  const previewDoc = React.useCallback(
    async (id: string): Promise<DocPreview | null> => {
      if (!vault.key) return null
      const vaultKey = vault.key
      const meta = await dbGetDoc(id, vaultKey)
      if (!meta) return null

      const cached = previewCache.current.get(id)
      if (cached && cached.updatedAt === meta.updatedAt) {
        return { image: cached.image, words: cached.words }
      }

      // Dedupe concurrent requests for the same doc (cards mount in parallel).
      const inFlight = pendingPreviews.current.get(id)
      if (inFlight) return inFlight

      const run = async (): Promise<DocPreview | null> => {
        try {
          // Persistent cache (kv, encrypted under the vault key) survives reloads.
          const raw = await kvGet<{ updatedAt: number; dataEnc: string }>(`preview:${id}`)
          if (raw && raw.updatedAt === meta.updatedAt) {
            try {
              const parsed = JSON.parse(await decryptStringWithKey(raw.dataEnc, vaultKey)) as {
                image: string | null
                words: number
              }
              previewCache.current.set(id, { updatedAt: meta.updatedAt, image: parsed.image, words: parsed.words })
              return { image: parsed.image, words: parsed.words }
            } catch {
              /* undecryptable (vault changed) — regenerate below */
            }
          }

          const docKey = await decryptStringWithKey(meta.wrappedDocKey, vaultKey)
          const loaded = await loadDocPreview(id, docKey)
          if (!loaded) return null
          previewCache.current.set(id, { updatedAt: meta.updatedAt, image: loaded.image, words: loaded.words })
          const dataEnc = await encryptStringWithKey(JSON.stringify({ image: loaded.image, words: loaded.words }), vaultKey)
          void kvSet(`preview:${id}`, { updatedAt: meta.updatedAt, dataEnc })
          return loaded
        } catch {
          return null
        } finally {
          pendingPreviews.current.delete(id)
        }
      }
      const promise = run()
      pendingPreviews.current.set(id, promise)
      return promise
    },
    [vault.key]
  )

  // --- Local → logged-in migration ---
  // Docs created in local (offline) mode are encrypted under the device key.
  // The first time an escrow vault key is resolved (i.e. after signing in),
  // re-wrap those docs under the user's vault key so they stay readable and
  // get included in the first cloud sync.
  const migrateDeviceDocs = React.useCallback(async (vaultKey: CryptoKey) => {
    try {
      const deviceKey = await getOrCreateDeviceKey()
      const deviceDocs = await dbLoadDocs(deviceKey)
      if (deviceDocs.length === 0) return
      for (const meta of deviceDocs) {
        try {
          const docKey = await decryptStringWithKey(meta.wrappedDocKey, deviceKey)
          meta.wrappedDocKey = await encryptStringWithKey(docKey, vaultKey)
          await dbSaveDoc(meta, vaultKey)
        } catch {
          // skip docs that can't be decrypted with the device key
        }
      }
    } catch {
      /* migration is best-effort */
    }
  }, [])

  // --- Auto-sync on login / when sync is enabled ---
  const syncedForUser = React.useRef<string | null>(null)
  const [pendingLoginSync, setPendingLoginSync] = React.useState<string | null>(null)

  React.useEffect(() => {
    const onSignIn = (e: Event) => setPendingLoginSync((e as CustomEvent<string>).detail)
    window.addEventListener("vdocs:user-signed-in", onSignIn)
    return () => window.removeEventListener("vdocs:user-signed-in", onSignIn)
  }, [])

  // --- Cloud sync ---

  const syncNow = React.useCallback(async (): Promise<boolean> => {
    if (!user) {
      setCloud({ state: "error", message: "Sign in to sync documents" })
      return false
    }
    if (!vault.key) {
      setCloud({ state: "error", message: "Vault is locked" })
      return false
    }
    setCloud({ state: "syncing" })
    try {
      // 1) Pull remote blob.
      const remote = await api.getAppData(CLOUD_KEY)
      let remoteBlob: CloudBlobV1 | null = null
      // The key used to encrypt the merged result. Normally vault.key; it can
      // differ during one-time recovery (below) when the backup was written
      // under a key that never reached the escrow.
      let workingKey = vault.key
      if (remote?.value && typeof remote.value === "object" && "enc" in (remote.value as object)) {
        const enc = (remote.value as { enc: string }).enc
        try {
          remoteBlob = JSON.parse(await decryptStringWithKey(enc, workingKey)) as CloudBlobV1
        } catch {
          // Wrong key. While the escrow couldn't resolve, everything was
          // synced under the per-device key instead, so the backup may be
          // locked under this device's device key. If so, restore that key
          // to the escrow (the "Re-sign in on the device that originally
          // synced it" advice, made automatic) and carry on with it — every
          // device then converges on the key that actually encrypted the data.
          const deviceKey = await getOrCreateDeviceKey()
          let blobWithDeviceKey: CloudBlobV1 | null = null
          try {
            blobWithDeviceKey = JSON.parse(await decryptStringWithKey(enc, deviceKey)) as CloudBlobV1
          } catch {
            blobWithDeviceKey = null
          }
          if (!blobWithDeviceKey) {
            // Neither the escrow key nor this device's key can read the
            // backup — only the device that originally synced it can fix this.
            throw new Error(
              "Could not decrypt cloud data — this device's vault key doesn't match the backup. " +
                "Re-sign in on the device that originally synced it (Settings → Sign out, then Sign in) to restore the correct key."
            )
          }
          await api.storeVaultKey(await keyToB64Url(deviceKey))
          await cacheVaultKey(deviceKey, user.id)
          workingKey = deviceKey
          remoteBlob = blobWithDeviceKey
          console.info("[sync] backup was locked under this device's key — restored it to the vault escrow")
          // Re-resolve the vault so Settings reflects the restored escrow key.
          void vault.reload()
        }
      }
      if (remoteBlob) await mergeBlob(remoteBlob, workingKey)

      // 2) Push the fully merged local state.
      const local = await serializeLocal(workingKey)
      const cipherText = await encryptStringWithKey(JSON.stringify(local), workingKey)
      await api.saveAppData(CLOUD_KEY, { enc: cipherText })

      // 3) Reload + mark synced.
      await refreshDocs()
      const now = Date.now()
      updateSettings({ lastSync: now, syncEnabled: true })
      setCloud({ state: "synced", lastSync: now })
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Sync failed"
      setCloud({ state: "error", message })
      return false
    }
  }, [user, vault.key, vault.reload, refreshDocs, updateSettings])

  // Auto-sync: right after a fresh login, or on open when sync is enabled.
  const vaultRetryCount = React.useRef(0)
  const vaultRetryTimer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => {
    if (!user?.id || !vault.ready || !vault.key) return
    // Just signed in on a fresh device: the vault may still be the local
    // device key until the escrow fetch finishes. Syncing now would try to
    // decrypt the cloud blob with the wrong key and fail. Wait for the key
    // to resolve to the escrow key (the effect re-runs when source changes).
    if (vault.source === "device") {
      // Escrow didn't resolve (transient network/server hiccup at boot).
      // Give it a couple more bounded chances so a fresh phone still
      // auto-loads; give up silently rather than poisoning the sync state.
      if (user && vaultRetryCount.current < 3 && !vaultRetryTimer.current) {
        vaultRetryTimer.current = window.setTimeout(() => {
          vaultRetryTimer.current = undefined
          vaultRetryCount.current += 1
          void vault.reload()
        }, 1500 * (vaultRetryCount.current + 1))
      }
      return
    }
    const vaultKey = vault.key
    const shouldSync = pendingLoginSync === user.id || settings.syncEnabled
    if (!shouldSync) return
    if (syncedForUser.current === user.id) return
    if (pendingLoginSync === user.id) setPendingLoginSync(null)
    ;(async () => {
      try {
        if (vault.source === "escrow") await migrateDeviceDocs(vaultKey)
        await refreshDocs()
        const ok = await syncNow()
        // Only mark the session as synced when it actually succeeded, so a
        // failed attempt (network, wrong key) can retry when deps change.
        if (ok) syncedForUser.current = user.id
      } catch {
        // syncNow reports its own error via cloud state
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, vault.ready, vault.key, vault.source, settings.syncEnabled, pendingLoginSync, syncNow, migrateDeviceDocs, refreshDocs])

  // Clear any pending escrow retry when the provider unmounts, and give a
  // fresh login a fresh retry budget.
  React.useEffect(() => () => window.clearTimeout(vaultRetryTimer.current), [])
  React.useEffect(() => {
    vaultRetryCount.current = 0
  }, [user?.id])

  const value = React.useMemo<DocsContextValue>(
    () => ({
      loading,
      docs: search
        ? docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
        : docs,
      search,
      setSearch,
      createDoc,
      adoptSharedDoc,
      loadDoc,
      renameDoc,
      patchDoc,
      deleteDoc,
      toggleStar,
      previewDoc,
      cloud,
      syncNow,
    }),
    [loading, docs, search, createDoc, adoptSharedDoc, loadDoc, renameDoc, patchDoc, deleteDoc, toggleStar, previewDoc, cloud, syncNow]
  )

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>
}

export function useDocs(): DocsContextValue {
  const context = React.useContext(DocsContext)
  if (!context) throw new Error("useDocs must be used within a DocsProvider")
  return context
}

// --- Sync internals ---

async function serializeLocal(vault: CryptoKey): Promise<CloudBlobV1> {
  const [rawDocs, rawUpdates, rawVersions] = await Promise.all([
    dbGetAllDocsRaw(),
    dbGetAllUpdatesRaw(),
    dbGetAllVersionsRaw(),
  ])
  const docsWithTs = await Promise.all(
    rawDocs.map(async (d) => {
      let updatedAt = 0
      try {
        updatedAt = (JSON.parse(await decryptStringWithKey(d.dataEnc, vault)) as DocMeta).updatedAt
      } catch {
        /* keep 0 */
      }
      return { id: d.id, dataEnc: d.dataEnc, updatedAt }
    })
  )
  return {
    v: 1,
    exportedAt: Date.now(),
    docs: docsWithTs,
    updates: rawUpdates.map((u) => ({ id: u.id, docId: u.id.slice(0, u.id.indexOf(":")), payload: bytesToB64Url(u.payload) })),
    versions: rawVersions,
  }
}

async function mergeBlob(blob: CloudBlobV1, vault: CryptoKey): Promise<void> {
  // Metadata: last-write-wins by updatedAt.
  const localDocs = new Map(await dbGetAllDocsRaw().then((arr) => arr.map((d) => [d.id, d] as const)))
  for (const remote of blob.docs) {
    const local = localDocs.get(remote.id)
    if (!local || remote.updatedAt > (await localUpdatedAt(local.dataEnc, vault))) {
      await dbPutStoredDoc({ id: remote.id, dataEnc: remote.dataEnc })
    }
  }

  // Updates + versions: idempotent by id.
  for (const u of blob.updates) {
    const payload = b64UrlToBytes(u.payload)
    await appendDocUpdateWithId(payload, u.id)
  }
  for (const v of blob.versions) {
    await dbSaveVersion(v)
  }
}

async function localUpdatedAt(dataEnc: string, vault: CryptoKey): Promise<number> {
  try {
    return (JSON.parse(await decryptStringWithKey(dataEnc, vault)) as DocMeta).updatedAt
  } catch {
    return 0
  }
}