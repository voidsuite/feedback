import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import { setPin } from "@/lib/encrypted-storage"
import { setPin as storePinState } from "@/lib/pin-state"

const DISMISSED_KEY = "ava_pin_prompt_dismissed"

export function wasPinPromptDismissed(): boolean {
  return localStorage.getItem(DISMISSED_KEY) === "1"
}

export function resetPinPrompt() {
  localStorage.removeItem(DISMISSED_KEY)
}

interface PinSetupPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PinSetupPrompt({ open, onOpenChange }: PinSetupPromptProps) {
  const [pin, setPinVal] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [step, setStep] = useState<"enter" | "confirm">("enter")

  const handleNext = async () => {
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return }
    if (step === "enter") {
      setError("")
      setStep("confirm")
      return
    }
    if (pin !== confirm) { setError("PINs do not match"); return }
    try {
      await setPin(pin)
      storePinState(pin)
      setError("")
      onOpenChange(false)
      resetPinPrompt()
    } catch {
      setError("Failed to set PIN")
    }
  }

  const handleSkip = () => {
    localStorage.setItem(DISMISSED_KEY, "1")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); else onOpenChange(o) }}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {step === "enter"
            ? "Set a local PIN to protect your TOTP accounts. Your secrets will be encrypted with this PIN and cannot be recovered if forgotten."
            : "Confirm your PIN by entering it again."}
        </p>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder={step === "enter" ? "Enter PIN" : "Confirm PIN"}
          className="text-center text-xl tracking-[0.3em]"
          value={step === "enter" ? pin : confirm}
          onChange={(e) => {
            setError("")
            if (step === "enter") setPinVal(e.target.value.replace(/\D/g, ""))
            else setConfirm(e.target.value.replace(/\D/g, ""))
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleNext() }}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleSkip}>
            Skip
          </Button>
          <Button size="sm" className="flex-1" onClick={handleNext}>
            {step === "enter" ? "Next" : "Set PIN"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}