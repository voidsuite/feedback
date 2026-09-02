import * as React from "react"
import {
  Eye, Edit3, Image as ImageIcon, Upload, X, Bold, Italic, Strikethrough,
  Code, List, ListOrdered, Quote, Link, Hash, Minus, HelpCircle,
  Columns2, SplitSquareHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { api } from "@/lib/api"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type ViewMode = "write" | "split" | "preview"

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder = "Write something…",
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
  const [viewMode, setViewMode] = React.useState<ViewMode>("write")
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const previewRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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
    if (!el) return insertAtCursor(`${before}${placeholder}${after}`)
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = value.slice(start, end || start)
    insertAtCursor(`${before}${selected || placeholder}${after}`)
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
      insertAtCursor("```\n\n```", 4)
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
    setDragOver(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        handleFileUpload(file)
      }
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
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

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) handleFileUpload(file)
        return
      }
    }
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

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div
      className={cn("flex flex-col rounded-lg border border-border bg-background overflow-hidden", className)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* Top bar */}
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
        {/* Toolbar buttons - only in write/split */}
        {viewMode !== "preview" && (
          <>
            <div className="flex flex-wrap items-center gap-0.5">
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
              <HelpMenu onInsert={insertAtCursor} />
            </div>
            <div className="flex-1" />
          </>
        )}

        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          <ModeButton
            active={viewMode === "write"}
            onClick={() => setViewMode("write")}
            title="Write"
          >
            <Edit3 className="size-3" />
          </ModeButton>
          <ModeButton
            active={viewMode === "split"}
            onClick={() => setViewMode("split")}
            title="Split view"
          >
            <Columns2 className="size-3" />
          </ModeButton>
          <ModeButton
            active={viewMode === "preview"}
            onClick={() => setViewMode("preview")}
            title="Preview"
          >
            <Eye className="size-3" />
          </ModeButton>
        </div>
      </div>

      {/* Content area */}
      <div className={cn(
        "flex min-h-0",
        viewMode === "split" && "flex-row",
      )}>
        {/* Editor pane */}
        {viewMode !== "preview" && (
          <div className={cn(
            "relative flex-1 min-w-0",
            viewMode === "split" && "border-r border-border",
          )}>
            {dragOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg m-1 pointer-events-none">
                <div className="flex flex-col items-center gap-1 text-primary/60">
                  <ImageIcon className="size-6" />
                  <span className="text-xs font-medium">Drop image here</span>
                </div>
              </div>
            )}
            <textarea
              ref={textareaRef}
              id={id}
              rows={viewMode === "split" ? Math.max(rows, 12) : rows}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              autoFocus={autoFocus}
              className="w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              spellCheck
            />
          </div>
        )}

        {/* Preview pane */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div
            ref={previewRef}
            className={cn(
              "flex-1 min-w-0 overflow-y-auto px-3 py-2 text-sm",
              viewMode === "preview" && "max-h-none",
            )}
            style={viewMode === "split" ? { maxHeight: `${(Math.max(rows, 12) * 1.5 + 1) * 16 + 16}px` } : undefined}
          >
            {value.trim() ? (
              <Markdown content={value} className="prose-sm" />
            ) : (
              <p className="text-sm text-muted-foreground/40 italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground/50">
        <div className="flex items-center gap-3">
          <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
          <span>{value.length} chars</span>
        </div>
        <span className="flex items-center gap-1">
          <SplitSquareHorizontal className="size-3" />
          Markdown supported
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          files.forEach((f) => handleFileUpload(f))
          e.target.value = ""
        }}
      />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded px-1.5 py-1 focus:outline-none",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground/60 hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  )
}

function HelpMenu({ onInsert }: { onInsert: (text: string, offset?: number) => void }) {
  const [open, setOpen] = React.useState(false)

  const shortcuts = [
    { label: "Bold", syntax: "**text**", keys: "Ctrl+B", insert: "**bold**" },
    { label: "Italic", syntax: "*text*", keys: "Ctrl+I", insert: "*italic*" },
    { label: "Strikethrough", syntax: "~~text~~", insert: "~~text~~" },
    { label: "Inline code", syntax: "`code`", keys: "Ctrl+E", insert: "`code`" },
    { label: "Code block", syntax: "```", insert: "```\n\n```" },
    { label: "Link", syntax: "[text](url)", keys: "Ctrl+K", insert: "[text](url)" },
    { label: "Image", syntax: "![alt](url)", insert: "![alt](url)" },
    { label: "Heading", syntax: "## H", insert: "## " },
    { label: "Bullet list", syntax: "- item", insert: "- " },
    { label: "Numbered list", syntax: "1. item", insert: "1. " },
    { label: "Blockquote", syntax: "> quote", insert: "> " },
    { label: "Divider", syntax: "---", insert: "\n---\n" },
    { label: "Table", syntax: "| a | b |", insert: "| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n" },
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
