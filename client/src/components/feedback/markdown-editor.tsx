import * as React from "react"
import { Eye, Edit3, Image as ImageIcon, Upload, X, Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote, Link, Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { api } from "@/lib/api"

/**
 * Full interactive markdown editor with:
 * - A button toolbar: bold, italic, strikethrough, inline code, code block,
 *   ordered/unordered lists, blockquote, heading, image upload, separator
 * - Live preview toggle
 * - Drag-and-drop image upload
 * - Compact cheat-sheet
 *
 * The `value`/`onChange`/`placeholder`/`rows` props mirror the native
 * Textarea so this can drop in as a 1:1 replacement.
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
  const [previewImageName, setPreviewImageName] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    return () => {
      if (previewImage) URL.revokeObjectURL(previewImage)
    }
  }, [previewImage])

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
    setTimeout(() => {
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  function wrapSelection(before: string, after: string, placeholder = "") {
    const el = textareaRef.current
    if (!el) {
      insertAtCursor(`${before}${placeholder}${after}`)
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = value.slice(start, end || start)
    const wrapText = selected || placeholder
    insertAtCursor(`${before}${wrapText}${after}`)
  }

  // Toolbar button helpers
  const bold = () => wrapSelection("**", "**", "bold")
  const italic = () => wrapSelection("*", "*", "italic")
  const strikethrough = () => wrapSelection("~~", "~~", "text")
  const inlineCode = () => wrapSelection("`", "`", "code")
  const codeBlock = () => {
    const lang = prompt("Language (optional)", "typescript") ?? ""
    insertAtCursor(`\`\`\`${lang}\n\n\`\`\``)
  }
  const unorderedList = () => insertAtCursor("\n- List item\n- Another item\n")
  const orderedList = () => insertAtCursor("\n1. First\n2. Second\n")
  const blockquote = () => insertAtCursor("\n> Quote\n")
  const heading = () => {
    const level = prompt("Heading level (1-3)", "2") ?? "2"
    const n = Math.max(1, Math.min(3, parseInt(level) || 2))
    insertAtCursor(`\n${"#".repeat(n)} Heading\n`)
  }
  const divider = () => insertAtCursor("\n---\n")
  const link = () => {
    const href = prompt("URL", "https://") ?? ""
    const label = prompt("Link text", "label") ?? "label"
    insertAtCursor(`[${label}](${href})`)
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
        setPreviewImage(URL.createObjectURL(file))
        setPreviewImageName(file.name)
        handleFileUpload(file)
      }
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  const toolbarButtons: { icon: React.ElementType; label: string; onClick: () => void }[] = [
    { icon: Bold, label: "Bold", onClick: bold },
    { icon: Italic, label: "Italic", onClick: italic },
    { icon: Strikethrough, label: "Strikethrough", onClick: strikethrough },
    { icon: Code, label: "Inline code", onClick: inlineCode },
    { icon: List, label: "Bulleted list", onClick: unorderedList },
    { icon: ListOrdered, label: "Numbered list", onClick: orderedList },
    { icon: Quote, label: "Blockquote", onClick: blockquote },
    { icon: Hash, label: "Heading", onClick: heading },
    { icon: Link, label: "Link", onClick: link },
    { icon: Code, label: "Code block", onClick: codeBlock },
  ]

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      {!preview && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-1 text-xs">
          {toolbarButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              tabIndex={-1}
              onClick={btn.onClick}
              className="rounded p-1.5 text-muted-foreground/70 opacity-60 hover:text-foreground hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
              title={btn.label}
            >
              <btn.icon className="size-3.5" />
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded p-1.5 text-muted-foreground/70 opacity-60 hover:text-foreground hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            title="Insert image (drag & drop or click)"
          >
            {uploading ? <Upload className="size-3.5 animate-pulse" /> : <ImageIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={divider}
            className="rounded p-1.5 text-muted-foreground/70 opacity-60 hover:text-foreground hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            title="Divider"
          >
            —
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setPreview(true)}
            className="ml-auto rounded p-1.5 text-muted-foreground/70 opacity-60 hover:text-foreground hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            title="Preview"
          >
            <Eye className="size-3.5" />
          </button>
        </div>
      )}

      {/* Editor / Preview body */}
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
            "min-h-[44px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-h-40",
            preview && "hidden"
          )}
          spellCheck
        />

        {preview && (
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <Markdown content={value} />
          </div>
        )}

        {preview && (
          <div className="absolute top-2 right-2">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setPreview(false)}
              className="rounded-md p-1 text-xs text-muted-foreground/60 opacity-0 hover:text-muted-foreground hover:opacity-100 focus:opacity-100 focus:outline-none"
              title="Edit"
            >
              <Edit3 className="size-3.5" />
            </button>
          </div>
        )}

        {!preview && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setPreview(true)}
              className="rounded-md p-1 text-xs text-muted-foreground/60 opacity-0 hover:text-muted-foreground hover:opacity-100 focus:opacity-100 focus:outline-none"
              title="Preview"
            >
              <Eye className="size-3.5" />
            </button>
          </div>
        )}

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
              e.target.value = ""
            }
          }}
        />
      </div>

      {/* Upload preview / status */}
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

      {/* Cheat-sheet + preview toggle (only when not in preview mode) */}
      {!preview && (
        <div className="flex items-center justify-between text-xs text-muted-foreground/60">
          <MarkdownCheatsheet />
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
          >
            Preview mode
          </button>
        </div>
      )}
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
      <code className="rounded bg-muted/50 px-1 py-0.5">![alt](url)</code>
    </span>
  )
}
