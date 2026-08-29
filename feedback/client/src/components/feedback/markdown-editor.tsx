import * as React from "react"
import { Eye, Edit3, Image as ImageIcon, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { api } from "@/lib/api"

/**
 * Shared markdown editor with live preview, a compact cheat-sheet, and
 * drag-and-drop image upload. Used by SubmitForm (issue body) and
 * LiveChat (reply body).
 *
 * The `value`/`onChange`/`placeholder`/`rows` props mirror the native
 * Textarea so this can drop in as a 1:1 replacement.
 *
 * When `onImageUpload` is not provided, the default handler uploads via
 * the /api/uploads endpoint and inserts a markdown image tag at the cursor.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder = "Markdown supported…",
  rows = 5,
  onKeyDown,
  autoFocus,
  className,
  onImageUpload,
}: {
  id?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  autoFocus?: boolean
  className?: string
  onImageUpload?: (file: File) => Promise<string>
}) {
  const [preview, setPreview] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [previewImage, setPreviewImage] = React.useState<string | null>(null)
  const [previewImageName, setPreviewImageName] = React.useState<string>("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function insertAtCursor(text: string) {
    const el = textareaRef.current
    if (!el) {
      onChange({ target: { value: value + text } } as React.ChangeEvent<HTMLTextAreaElement>)
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const newVal = value.slice(0, start) + text + value.slice(end)
    onChange({ target: { value: newVal } } as React.ChangeEvent<HTMLTextAreaElement>)
    // Restore cursor after next render
    setTimeout(() => {
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  async function handleFileUpload(file: File) {
    const handler = onImageUpload ?? (async (f: File) => {
      const result = await api.uploadImage(f)
      return `![${f.name}](${result.url})`
    })
    setUploading(true)
    try {
      const markdown = await handler(file)
      insertAtCursor(markdown)
    } catch (e) {
      console.error("Upload failed", e)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith("image/")) {
        handleFileUpload(file)
      }
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="relative"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <textarea
          ref={textareaRef}
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className={cn(
            "min-h-[44px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            preview && "hidden"
          )}
          spellCheck
        />

        {preview && (
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <Markdown content={value} />
          </div>
        )}

        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-md p-1 text-xs text-muted-foreground/60 opacity-0 hover:text-muted-foreground hover:opacity-100 focus:opacity-100 focus:outline-none"
            title="Insert image"
          >
            {uploading ? <Upload className="size-3.5 animate-pulse" /> : <ImageIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setPreview((p) => !p)}
            className="rounded-md p-1 text-xs text-muted-foreground/60 opacity-0 hover:text-muted-foreground hover:opacity-100 focus:opacity-100 focus:outline-none"
            title={preview ? "Edit" : "Preview"}
          >
            {preview ? <Edit3 className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              setPreviewImage(URL.createObjectURL(f))
              setPreviewImageName(f.name)
              handleFileUpload(f)
              // Clear the input so the same file can be re-selected
              e.target.value = ""
            }
          }}
        />
      </div>

      {previewImage && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3" />
            {previewImageName}
          </span>
          <button
            type="button"
            onClick={() => { URL.revokeObjectURL(previewImage); setPreviewImage(null); setPreviewImageName("") }}
            className="rounded p-0.5 hover:text-foreground"
            title="Cancel upload"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground/60">
        <MarkdownCheatsheet />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {preview ? "Edit mode" : "Preview mode"}
        </button>
      </div>
    </div>
  )
}

/** Compact markdown cheat-sheet shown below the editor. */
function MarkdownCheatsheet() {
  return (
    <span>
      <code className="rounded bg-muted/50 px-1 py-0.5">**bold**</code>, <code className="rounded bg-muted/50 px-1 py-0.5">`code`</code>,{" "}
      <code className="rounded bg-muted/50 px-1 py-0.5">```</code>, <code className="rounded bg-muted/50 px-1 py-0.5">1.</code>,{" "}
      <code className="rounded bg-muted/50 px-1 py-0.5">- list</code>,{" "}
      <code className="rounded bg-muted/50 px-1 py-0.5">![alt](url)</code>{" "}
      <span className="text-muted-foreground/40">(drag or click the image icon to upload)</span>
    </span>
  )
}
