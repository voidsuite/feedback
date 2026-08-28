import { useEffect, useState } from "react"
import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { generatePassphrase } from "@/lib/crypto"

type Mode = "setup" | "unlock"

interface PassphraseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  onConfirmed: (passphrase: string) => void
}

/**
 * Setup (first time) shows a generated passphrase and asks for confirmation;
 * unlock asks for the existing passphrase. Passphrases are kept in memory
 * only (lib/passphrase) — never persisted.
 */
export function PassphraseDialog({ open, onOpenChange, mode, onConfirmed }: PassphraseDialogProps) {
  const [generated, setGenerated] = useState("")
  const [entered, setEntered] = useState("")
  const [confirm, setConfirm] = useState("")
  const [step, setStep] = useState<0 | 1>(0)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setGenerated(generatePassphrase(6))
      setEntered("")
      setConfirm("")
      setStep(0)
      setError(null)
      setCopied(false)
    }
  }, [open])

  async function copyGenerated() {
    try {
      await navigator.clipboard.writeText(generated)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  function confirmSetup() {
    if (entered !== generated) {
      setError("The passphrase doesn't match")
      return
    }
    onConfirmed(generated)
  }

  function confirmUnlock() {
    if (entered.trim().length < 8) {
      setError("Passphrase looks too short")
      return
    }
    onConfirmed(entered)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "setup" ? "Create a sync passphrase" : "Enter your passphrase"}</DialogTitle>
          <DialogDescription>
            {mode === "setup"
              ? "Your mail, accounts and settings are encrypted with this passphrase before they leave this device."
              : "This unlocks your encrypted cloud backup on this device."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <ShieldAlert className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              There is no recovery. If you lose the passphrase, your cloud backup cannot be decrypted — ever.
            </p>
          </div>

          {mode === "setup" && step === 0 ? (
            <div className="space-y-3">
              <Label>Your passphrase</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-center text-sm font-medium tracking-wide">
                  {generated}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={copyGenerated} aria-label="Copy passphrase">
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Write it down or store it in a password manager. You will need it on every new device.
              </p>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setGenerated(generatePassphrase(6))}>
                <RefreshCw className="size-3" />
                Generate another
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw-entry">
                  {mode === "setup" ? "Confirm your passphrase" : "Passphrase"}
                </Label>
                <div className="relative">
                  <Input
                    id="pw-entry"
                    type={show ? "text" : "password"}
                    autoComplete="off"
                    value={entered}
                    onChange={(e) => {
                      setEntered(e.target.value)
                      setError(null)
                    }}
                    placeholder={mode === "setup" ? "Re-type the passphrase above" : "••••••••"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={show ? "Hide passphrase" : "Show passphrase"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {mode === "setup" ? (
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm once more"
                />
              ) : null}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === "setup" && step === 0 ? (
            <Button onClick={() => setStep(1)}>I've saved it</Button>
          ) : (
            <Button
              onClick={mode === "setup" ? confirmSetup : confirmUnlock}
              disabled={mode === "setup" ? entered !== confirm || !entered : entered.trim().length < 8}
            >
              {mode === "setup" ? "Enable encryption" : "Unlock"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}