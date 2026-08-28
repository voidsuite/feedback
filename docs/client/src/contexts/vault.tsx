/**
 * Vault context — resolves and caches the user's Vault Key.
 *
 * Recovery order (automatic, no passphrases):
 *   1. localStorage cache,
 *   2. gateway escrow (only when signed in),
 *   3. device key (offline / local-only).
 *
 * Signing out drops the cached key so the local vault becomes locked again.
 */

import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { clearVaultCache, resolveVaultKey, type VaultSource } from "@/lib/keychain"

interface VaultContextValue {
  /** Resolved vault key, or null while loading / when unavailable. */
  key: CryptoKey | null
  ready: boolean
  source: VaultSource | null
  /** Real reason the escrow couldn't be reached (set when we fell back to a local key). */
  escrowError: string | null
  /** Re-resolve, e.g. right after signing in. */
  reload: () => Promise<void>
}

const VaultContext = React.createContext<VaultContextValue | undefined>(undefined)

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [key, setKey] = React.useState<CryptoKey | null>(null)
  const [ready, setReady] = React.useState(false)
  const [source, setSource] = React.useState<VaultSource | null>(null)
  const [escrowError, setEscrowError] = React.useState<string | null>(null)

  // Keep reload() stable (identity churns on every /me poll) — the caller's
  // effect keys off user?.id anyway.
  const userRef = React.useRef(user)
  userRef.current = user

  const reload = React.useCallback(async () => {
    setReady(false)
    // Only attempt gateway escrow when a session actually exists; otherwise
    // this fires a pointless 401 (and refresh chain) on every signed-out boot.
    const result = await resolveVaultKey({ signedIn: !!userRef.current, userId: userRef.current?.id })
    setKey(result?.key ?? null)
    setSource(result?.source ?? null)
    setEscrowError(result?.escrowError ?? null)
    setReady(true)
  }, [])

  // Resolve once on mount, and again when sign-in state changes.
  React.useEffect(() => {
    void reload()
  }, [reload, user?.id])

  // Immediate re-resolve when something explicitly locks the vault.
  React.useEffect(() => {
    const handler = () => void reload()
    window.addEventListener("vdocs:lock-vault", handler)
    return () => window.removeEventListener("vdocs:lock-vault", handler)
  }, [reload])

  const value = React.useMemo(
    () => ({ key, ready, source, escrowError, reload }),
    [key, ready, source, escrowError, reload]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultContextValue {
  const context = React.useContext(VaultContext)
  if (!context) throw new Error("useVault must be used within a VaultProvider")
  return context
}

/** Drop the cached key (used on explicit "Lock vault" / sign-out). */
export function lockVault(): void {
  clearVaultCache()
  // The context picks this up via reload after sign-out; for immediate
  // effect we also nuke the in-memory key by dispatching a reload.
  window.dispatchEvent(new CustomEvent("vdocs:lock-vault"))
}

export function useVaultKeyNow(): CryptoKey | null {
  return useVault().key
}