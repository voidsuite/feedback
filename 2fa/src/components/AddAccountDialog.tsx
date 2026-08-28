import { useState, useRef, useEffect, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon, Link01Icon, ArrowLeft02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { AppIcon } from "@/components/AppIcon"
import { IconPicker } from "@/components/IconPicker"
import { parseOTPAuthURI, createAccount } from "@/lib/totp"
import { startCamera, stopCamera, scanQRFromVideo } from "@/lib/qr"
import type { TOTPAccount } from "@/lib/totp"

interface AddAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (account: TOTPAccount) => void
}

export function AddAccountDialog({ open, onOpenChange, onAdd }: AddAccountDialogProps) {
  const [tab, setTab] = useState<"scan" | "paste">("paste")
  const [uriInput, setUriInput] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [issuerInput, setIssuerInput] = useState("")
  const [secretInput, setSecretInput] = useState("")
  const [selectedIcon, setSelectedIcon] = useState("Shield02Icon")
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [error, setError] = useState("")
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanIntervalRef = useRef<ReturnType<typeof setInterval>>()

  const reset = useCallback(() => {
    setUriInput("")
    setNameInput("")
    setIssuerInput("")
    setSecretInput("")
    setSelectedIcon("Shield02Icon")
    setShowIconPicker(false)
    setError("")
    setScanning(false)
    setCameraError("")
    stopCamera()
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const handleScan = async () => {
    if (!videoRef.current) return
    setCameraError("")
    setScanning(true)
    try {
      await startCamera(videoRef.current)
      const jsQR = await import('jsqr')
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return
        const result = await scanQRFromVideo(videoRef.current, jsQR)
        if (result && (result.startsWith('otpauth://totp/') || result.startsWith('otpauth://hotp/'))) {
          try {
            const parsed = parseOTPAuthURI(result)
            const account = createAccount({
              name: parsed.name || 'Scanned Account',
              issuer: parsed.issuer,
              secret: parsed.secret!,
              algorithm: parsed.algorithm,
              digits: parsed.digits,
              period: parsed.period,
            })
            stopCamera()
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
            onAdd(account)
            onOpenChange(false)
            reset()
          } catch {
            /* invalid scan, keep trying */
          }
        }
      }, 300)
    } catch (e: any) {
      setCameraError(e.message || 'Camera access denied')
      setScanning(false)
      stopCamera()
    }
  }

  const stopScan = () => {
    setScanning(false)
    stopCamera()
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
  }

  const handlePaste = () => {
    setError("")
    try {
      const parsed = parseOTPAuthURI(uriInput)
      const account = createAccount({
        name: parsed.name || 'Account',
        issuer: parsed.issuer,
        secret: parsed.secret!,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
      })
      onAdd(account)
      onOpenChange(false)
      reset()
    } catch (e: any) {
      setError(e.message || 'Invalid otpauth URI')
    }
  }

  const handleManual = () => {
    setError("")
    const secret = secretInput.replace(/\s/g, '').toUpperCase()
    if (!secret || secret.length < 16) {
      setError('Secret must be at least 16 characters')
      return
    }
    if (!nameInput.trim()) {
      setError('Account name is required')
      return
    }
    try {
      const account = createAccount({
        name: nameInput.trim(),
        issuer: issuerInput.trim() || undefined,
        icon: selectedIcon,
        secret,
      })
      onAdd(account)
      onOpenChange(false)
      reset()
    } catch (e: any) {
      setError(e.message || 'Invalid input')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add Account">
      <div className="flex border-b border-border">
        <button
          className={`flex-1 pb-2 text-xs font-medium transition-colors ${tab === 'paste' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}
          onClick={() => { setTab('paste'); stopScan() }}
        >
          Manual Entry
        </button>
        <button
          className={`flex-1 pb-2 text-xs font-medium transition-colors ${tab === 'scan' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}
          onClick={() => setTab('scan')}
        >
          Scan QR
        </button>
      </div>

      {tab === "scan" && (
        <div className="space-y-3">
          {scanning ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted />
              <Button
                variant="secondary"
                size="xs"
                className="absolute right-2 top-2"
                onClick={stopScan}
              >
                <HugeiconsIcon icon={ArrowLeft02Icon} className="size-3" /> Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleScan}
            >
              <HugeiconsIcon icon={Camera01Icon} className="size-4" />
              Open Camera
            </Button>
          )}
          {cameraError && (
            <p className="text-xs text-destructive">{cameraError}</p>
          )}
          <Separator />
          <p className="text-xs text-muted-foreground">Or paste a setup key below:</p>
          <Input
            placeholder="otpauth://totp/..."
            value={uriInput}
            onChange={(e) => setUriInput(e.target.value)}
          />
          <Button className="w-full" size="sm" onClick={handlePaste}>
            Add from URI
          </Button>
        </div>
      )}

      {tab === "paste" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Setup URI</Label>
            <Input
              placeholder="otpauth://totp/..."
              value={uriInput}
              onChange={(e) => setUriInput(e.target.value)}
            />
          </div>
          <Button className="w-full" size="sm" onClick={handlePaste}>
            <HugeiconsIcon icon={Link01Icon} className="size-4" /> Add from URI
          </Button>

          <Separator />

          <div className="space-y-1.5">
            <Label>Service / App Name</Label>
            <Input
              placeholder="e.g. GitHub, Google"
              value={issuerInput}
              onChange={(e) => setIssuerInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Name</Label>
            <Input
              placeholder="user@example.com"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
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
                  <AppIcon icon={selectedIcon} className="size-4" />
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedIcon.endsWith("Icon") || selectedIcon === "AlertTriangle" ? "Generic icon" : "Brand logo"}
                </span>
              </button>
              <IconPicker
                value={selectedIcon}
                onChange={setSelectedIcon}
                open={showIconPicker}
                onOpenChange={setShowIconPicker}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Secret Key</Label>
            <Input
              placeholder="JBSWY3DPEHPK3PXP"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
            />
          </div>
          <Button className="w-full" size="sm" onClick={handleManual}>
            Add Account
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Dialog>
  )
}
