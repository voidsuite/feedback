import { useState, useRef, useCallback } from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { MoreHorizontal, Delete01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons"
import type { TOTPAccount } from "@/lib/totp"
import { TOTPCode } from "@/components/TOTPCode"
import { AppIcon } from "@/components/AppIcon"
import { Button } from "@/components/ui/button"

interface AccountCardProps {
  account: TOTPAccount
  onDelete: (id: string) => void
}

export function AccountCard({ account, onDelete }: AccountCardProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false)
      setConfirming(false)
    }
  }, [])

  if (menuOpen) {
    document.addEventListener('mousedown', handleClickOutside, { once: true })
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 transition-colors hover:border-ring/30">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <AppIcon icon={account.icon || "Shield02Icon"} className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">
              {account.issuer || account.name}
            </h3>
            {account.issuer && (
              <p className="truncate text-xs text-muted-foreground">
                {account.name}
              </p>
            )}
          </div>
        </div>
        <div className="relative ml-2 flex-shrink-0" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <HugeiconsIcon icon={MoreHorizontal} className="size-4" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 w-40 rounded-xl border border-border bg-popover p-1 shadow-lg">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted"
                onClick={() => { setMenuOpen(false); navigate(`/account/${account.id}`) }}
              >
                <HugeiconsIcon icon={PencilEdit01Icon} className="size-3.5" /> Edit
              </button>
              {!confirming ? (
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirming(true)}
                >
                  <HugeiconsIcon icon={Delete01Icon} className="size-3.5" /> Delete
                </button>
              ) : (
                <div className="flex gap-1 p-1">
                  <Button
                    size="xs"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => { onDelete(account.id); setMenuOpen(false); setConfirming(false) }}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <TOTPCode account={account} />
    </div>
  )
}
