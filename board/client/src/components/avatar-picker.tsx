/**
 * AvatarPicker — a board/workspace avatar photo.
 *
 * Shows the uploaded image, or a deterministic initials tile derived from a
 * seed id (same hue naming as WorkspaceIcon). When `canEdit` is set, hovering
 * reveals a camera button that opens a small popover to upload or remove the
 * photo. The hidden file input lives outside the popover so native file
 * dialogs open cleanly from any browser.
 */

import * as React from "react"
import { Camera, Trash2, Upload } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { fileUrl } from "@/lib/api"
import { avatarHue, initials } from "@/components/workspace-icon"
import { cn } from "@/lib/utils"

const SIZES = {
  sm: "size-7 rounded-lg text-[10px]",
  md: "size-9 rounded-xl text-xs",
  lg: "size-12 rounded-2xl text-sm",
}

export function AvatarPicker({
  fileId,
  name,
  seed,
  canEdit = false,
  onUpload,
  onRemove,
  size = "md",
  className,
}: {
  fileId: string | null
  name: string
  /** Stable id used to derive the fallback tile color. */
  seed: string
  canEdit?: boolean
  onUpload?: (file: File) => void | Promise<void>
  onRemove?: () => void | Promise<void>
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const pick = async (file: File | undefined) => {
    if (!file || !onUpload) return
    setOpen(false)
    setBusy(true)
    try {
      await onUpload(file)
    } catch {
      /* surfaced by the parent's toast */
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!onRemove) return
    setOpen(false)
    setBusy(true)
    try {
      await onRemove()
    } catch {
      /* surfaced by the parent's toast */
    } finally {
      setBusy(false)
    }
  }

  const tile = (
    <>
      {fileId ? (
        <img src={fileUrl(fileId)} alt="" className="size-full object-cover" />
      ) : (
        <span className={cn("flex size-full items-center justify-center", avatarHue(seed))} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      {canEdit ? (
        <span
          className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100"
          aria-hidden="true"
        >
          <Camera className="size-1/3" />
        </span>
      ) : null}
    </>
  )

  if (!canEdit) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold",
          SIZES[size],
          className
        )}
      >
        {tile}
      </span>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          void pick(file)
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={fileId ? `Change photo for ${name}` : `Add a photo for ${name}`}
              className={cn(
                "group/avatar relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                SIZES[size],
                className
              )}
            >
              {tile}
            </button>
          }
        />
        <PopoverContent align="start" sideOffset={8} className="w-44 p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            {fileId ? "Change photo" : "Upload photo"}
          </Button>
          {fileId ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove photo
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  )
}