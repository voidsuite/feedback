import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle01Icon, LockIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"

interface PassphraseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSetPassphrase: (passphrase: string) => void
  hasExistingPassphrase: boolean
}

export function PassphraseDialog({ open, onOpenChange, onSetPassphrase, hasExistingPassphrase }: PassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    setError("")
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters")
      return
    }
    if (passphrase !== confirm) {
      setError("Passphrases don't match")
      return
    }
    onSetPassphrase(passphrase)
    setPassphrase("")
    setConfirm("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={hasExistingPassphrase ? "Change Passphrase" : "Set Encryption Passphrase"}
      description="This passphrase encrypts your 2FA secrets before cloud sync. You will need it to restore from the cloud."
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Encryption Passphrase</Label>
          <Input
            type="password"
            placeholder="Min. 8 characters"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm Passphrase</Label>
          <Input
            type="password"
            placeholder="Re-enter passphrase"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <HugeiconsIcon icon={LockIcon} className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Your passphrase never leaves this device. Only the encrypted data is stored in VoidAuth.
          </p>
        </div>
        <Button className="w-full" onClick={handleSubmit}>
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />
          {hasExistingPassphrase ? "Update Passphrase" : "Set Passphrase"}
        </Button>
      </div>
    </Dialog>
  )
}
