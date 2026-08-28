import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft02Icon, Delete01Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card"
import { TOTPCode } from "@/components/TOTPCode"
import { AppIcon } from "@/components/AppIcon"
import { IconPicker } from "@/components/IconPicker"
import type { TOTPAccount } from "@/lib/totp"
import { suggestIcon } from "@/lib/icons"
import { encrypt } from "@/lib/crypto"
import { saveAppData } from "@/lib/api"
import { getPassphrase } from "@/lib/passphrase"

const STORAGE_KEY = 'ava_accounts'

function loadAccounts(): TOTPAccount[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveAccounts(accounts: TOTPAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [account, setAccount] = useState<TOTPAccount | null>(null)
  const [name, setName] = useState("")
  const [issuer, setIssuer] = useState("")
  const [icon, setIcon] = useState("Shield02Icon")
  const [secret, setSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)

  useEffect(() => {
    const accounts = loadAccounts()
    const found = accounts.find((a) => a.id === id)
    if (!found) { navigate("/", { replace: true }); return }
    setAccount(found)
    setName(found.name)
    setIssuer(found.issuer || "")
    setIcon(found.icon || "Shield02Icon")
    setSecret(found.secret)
  }, [id, navigate])

  const handleSave = useCallback(async () => {
    if (!account) return
    const accounts = loadAccounts().map((a) =>
      a.id === account.id
        ? {
            ...a,
            name,
            issuer: issuer.trim() || undefined,
            icon,
            secret: secret.replace(/\s/g, '').toUpperCase(),
            updatedAt: Date.now(),
          }
        : a
    )
    saveAccounts(accounts)
    setAccount(accounts.find((a) => a.id === account.id)!)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)

    const passphrase = await getPassphrase()
    if (passphrase) {
      encrypt(JSON.stringify(accounts), passphrase).then((ciphertext) => {
        saveAppData('totp_accounts', { accounts, encrypted: ciphertext })
      }).catch(() => {})
    }
  }, [account, name, issuer, icon, secret])

  const handleDelete = useCallback(() => {
    if (!account) return
    const accounts = loadAccounts().filter((a) => a.id !== account.id)
    saveAccounts(accounts)
    navigate("/", { replace: true })
  }, [account, navigate])

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate("/")}>
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold">Account Details</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 overflow-hidden">
                <AppIcon icon={icon} className="size-6" />
              </div>
              <div>
                <CardTitle>{account.issuer || account.name}</CardTitle>
                {account.issuer && (
                  <p className="text-xs text-muted-foreground">{account.name}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TOTPCode account={account} large />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label>Service / App Name</Label>
              <Input
                placeholder="e.g. GitHub, Google"
                value={issuer}
                onChange={(e) => {
                  setIssuer(e.target.value)
                  if (e.target.value) setIcon(suggestIcon(name, e.target.value))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="relative">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                >
                  <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                    <AppIcon icon={icon} className="size-4" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {icon.endsWith("Icon") || icon === "AlertTriangle" ? "Generic icon" : "Brand logo"}
                  </span>
                </button>
                <IconPicker
                  value={icon}
                  onChange={setIcon}
                  open={showIconPicker}
                  onOpenChange={setShowIconPicker}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Secret Key</Label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => { navigator.clipboard.writeText(secret) }}
                >
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3.5" />
                </Button>
              </div>
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? "Hide" : "Show"} secret
              </button>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button className="flex-1" size="sm" onClick={handleSave}>
              {saved ? "Saved" : "Save Changes"}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <HugeiconsIcon icon={Delete01Icon} className="size-4" /> Delete
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
