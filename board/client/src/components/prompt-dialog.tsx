/**
 * PromptDialog — a minimal single-input dialog reuse for create/rename
 * flows (workspaces, projects, boards, columns). Enter to submit, Escape
 * to cancel, opens with the input focused and value selected.
 */

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  label: string
  defaultValue?: string
  submitLabel?: string
  placeholder?: string
  /** Factory so callers can reset per-open. */
  onOpen?: () => void
  onSubmit: (value: string) => Promise<void> | void
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  defaultValue = "",
  submitLabel = "Save",
  placeholder,
  onOpen,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(defaultValue)
  const [busy, setBusy] = React.useState(false)

  // Reset the field each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setBusy(false)
      onOpen?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const next = value.trim()
    if (!next || busy) return
    setBusy(true)
    try {
      await onSubmit(next)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prompt-input">{label}</Label>
            <Input
              id="prompt-input"
              value={value}
              placeholder={placeholder}
              autoFocus
              maxLength={100}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim() || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-label="Saving" /> : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}