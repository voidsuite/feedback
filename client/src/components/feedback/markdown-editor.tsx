import * as React from "react"
import { Eye, Edit3, Image as ImageIcon, Upload, X, Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote, Link, Hash, Minus, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { api } from "@/lib/api"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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

  function insertAtCursor(text: string, cursorOffset?: number) {
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
      const pos = cursorOffset !== undefined ? start + cursorOffset : start + text.length
      el.setSelectionRange(pos, pos)
      el.focus()
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

  const bold = () => wrapSelection("**", "**", "bold")
  const italic = () => wrapSelection("*", "*", "italic")
  const strikethrough = () => wrapSelection("~~", "~~", "text")
  const inlineCode = () => wrapSelection("`", "`", "code")
  const codeBlock = () => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? 0
    const end = el?.selectionEnd ?? 0
    const selected = value.slice(start, end)
    if (selected.includes("\n")) {
      insertAtCursor(`\`\`\`\n${selected}\n\`\`\``)
    } else {
      insertAtCursor(`\`\`\`\ncode here\n\`\`\``, 4)
    }
  }
  const unorderedList = () => insertAtCursor("\n- Item\n- Item\n", 3)
  const orderedList = () => insertAtCursor("\n1. First\n2. Second\n", 4)
  const blockquote = () => insertAtCursor("\n> Quote\n", 3)
  const heading = (level: number) => insertAtCursor(`\n${"#".repeat(level)} Heading\n`, level + 3)
  const divider = () => insertAtCursor("\n---\n")
  const link = () => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? 0
    const end = el?.selectionEnd ?? 0
    const selected = value.slice(start, end)
    if (selected) {
      insertAtCursor(`[${selected}](url)`)
    } else {
      insertAtCursor("[text](url)", 1)
    }
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case "b": e.preventDefault(); bold(); return
        case "i": e.preventDefault(); italic(); return
        case "k": e.preventDefault(); link(); return
        case "e": e.preventDefault(); inlineCode(); return
      }
    }
    if (e.key === "Tab") {
      e.preventDefault()
      insertAtCursor("  ")
      return
    }
    onKeyDown?.(e)
  }

  const toolbarButtons: { icon: React.ElementType; label: string; shortcut?: string; onClick: () => void }[] = [
    { icon: Bold, label: "Bold", shortcut: "Ctrl+B", onClick: bold },
    { icon: Italic, label: "Italic", shortcut: "Ctrl+I", onClick: italic },
    { icon: Strikethrough, label: "Strikethrough", onClick: strikethrough },
    { icon: Code, label: "Inline code", shortcut: "Ctrl+E", onClick: inlineCode },
    { icon: List, label: "Bulleted list", onClick: unorderedList },
    { icon: ListOrdered, label: "Numbered list", onClick: orderedList },
    { icon: Quote, label: "Blockquote", onClick: blockquote },
    { icon: Hash, label: "Heading", onClick: () => heading(2) },
    { icon: Link, label: "Link", shortcut: "Ctrl+K", onClick: link },
    { icon: Minus, label: "Divider", onClick: divider },
    { icon: Code, label: "Code block", onClick: codeBlock },
  ]

  return (
    <div className={cn("space-y-1", className)}>
      {/* Toolbar */}
      {!preview && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-1">
          {toolbarButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              tabIndex={-1}
              onClick={btn.onClick}
              className="rounded p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
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
            className="rounded p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            title="Upload image"
          >
            {uploading ? <Upload className="size-3.5 animate-pulse" /> : <ImageIcon className="size-3.5" />}
          </button>
          <div className="ml-auto flex items-center gap-0.5">
            <HelpMenu onInsert={insertAtCursor} />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setPreview(true)}
              className="rounded p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              title="Preview (Ctrl+Shift+P)"
            >
              <Eye className="size-3.5" />
            </button>
          </div>
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
          onKeyDown={handleKeyDown}
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
              className="rounded-md p-1 text-xs text-muted-foreground/60 hover:text-muted-foreground focus:outline-none"
              title="Edit"
            >
              <Edit3 className="size-3.5" />
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

      {/* Word count + preview toggle */}
      {!preview && (
        <div className="flex items-center justify-end text-[11px] text-muted-foreground/50">
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="inline-flex items-center gap-1 hover:text-muted-foreground"
          >
            <Eye className="size-3" /> Preview
          </button>
        </div>
      )}
    </div>
  )
}

function HelpMenu({ onInsert }: { onInsert: (text: string, offset?: number) => void }) {
  const [open, setOpen] = React.useState(false)

  const shortcuts = [
    { label: "Bold", syntax: "**text**", keys: "Ctrl+B", insert: "**bold**" },
    { label: "Italic", syntax: "*text*", keys: "Ctrl+I", insert: "*italic*" },
    { label: "Strikethrough", syntax: "~~text~~", insert: "~~text~~" },
    { label: "Inline code", syntax: "`code`", keys: "Ctrl+E", insert: "`code`" },
    { label: "Code block", syntax: "```lang\n```", insert: "```\ncode\n```" },
    { label: "Link", syntax: "[text](url)", keys: "Ctrl+K", insert: "[text](url)" },
    { label: "Image", syntax: "![alt](url)", insert: "![alt](url)" },
    { label: "Heading", syntax: "## Heading", insert: "## " },
    { label: "Bullet list", syntax: "- item", insert: "- " },
    { label: "Numbered list", syntax: "1. item", insert: "1. " },
    { label: "Blockquote", syntax: "> quote", insert: "> " },
    { label: "Divider", syntax: "---", insert: "\n---\n" },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="rounded p-1.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          title="Markdown help"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-2">
        <div className="text-xs font-medium text-muted-foreground mb-2">Markdown shortcuts</div>
        <div className="grid gap-0.5">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              className="flex items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => {
                onInsert(s.insert, s.insert.length)
                setOpen(false)
              }}
            >
              <span className="text-foreground">{s.label}</span>
              <span className="flex items-center gap-2">
                {s.keys && <kbd className="rounded bg-muted/80 px-1 py-0.5 text-[10px] text-muted-foreground">{s.keys}</kbd>}
                <code className="text-muted-foreground/60">{s.syntax}</code>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
