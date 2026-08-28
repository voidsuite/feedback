import * as React from "react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Menu as MenuIcon,
  MessageSquarePlus,
  Redo2,
  Search,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
  X,
} from "lucide-react"
import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { FONTS, PARAGRAPH_STYLES, SYSTEM_FONTS } from "@/lib/editor"
import type { SyncState } from "@/lib/types"

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72]

const TEXT_COLORS = [
  "#1c1917",
  "#57534e",
  "#a8a29e",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0284c7",
  "#4f46e5",
  "#9333ea",
  "#db2777",
  "#ffffff",
]

const HIGHLIGHT_COLORS = ["#fde68a", "#fcd34d", "#fca5a5", "#86efac", "#93c5fd", "#c4b5fd", "#f9a8d4", "#e7e5e4"]

export interface ToolbarCallbacks {
  onShare: () => void
  onPageSetup: () => void
  onWordCount: () => void
  onFindReplace: () => void
  onVersionHistory: () => void
  onNew: () => void
  onHome: () => void
  onRenameRequest: () => void
  onToggleStar: () => void
  onDelete: () => void
  onAddComment: () => void
  onImport: (file: File) => void
  onExport: (kind: "docx" | "pdf" | "md" | "txt" | "html") => void
  onPrint: () => void
  onToggleOutline: () => void
  onToggleComments: () => void
  onHelp: () => void
}

interface ToolbarProps {
  editor: Editor | null
  title: string
  starred: boolean
  suggestionMode: boolean
  setSuggestionMode: (on: boolean) => void
  hasSuggestions: boolean
  onAcceptSuggestions: () => void
  onRejectSuggestions: () => void
  syncState: SyncState
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  callbacks: ToolbarCallbacks
}

function ToolButton({
  active,
  onClick,
  title,
  shortcut,
  children,
  className,
}: {
  active?: boolean
  onClick: () => void
  title: string
  shortcut?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 px-0 sm:h-7 sm:w-7", active && "bg-accent text-foreground", className)}
            onClick={onClick}
            onMouseDown={(e) => e.preventDefault()}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <span>
          {title}
          {shortcut && <span className="ms-1.5 text-[10px] text-muted-foreground">{shortcut}</span>}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

// --- Font picker ---

function FontPicker({ editor }: { editor: Editor }) {
  const activeFont = useEditorState({
    editor,
    selector: (ctx) => (ctx.editor.getAttributes("textStyle").fontFamily as string) || null,
  })
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const allFonts = [...FONTS, ...SYSTEM_FONTS]
  const filtered = allFonts.filter((f) => f.label.toLowerCase().includes(query.toLowerCase()))
  const current = allFonts.find((f) => f.family === activeFont)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs font-normal" />}>
        <span className="max-w-32 truncate">{current?.label || "Font"}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
              placeholder="Search fonts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.map((f) => (
              <button
                key={f.label}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  current?.label === f.label && "bg-accent/60"
                )}
                style={{ fontFamily: f.family }}
                onClick={() => {
                  editor.chain().focus().setFontFamily(f.family).run()
                  setOpen(false)
                }}
              >
                <span>{f.label}</span>
                {current?.label === f.label && <Check className="size-3.5" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No fonts match</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// --- Format bar ---

function FormatBar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        highlight: e.isActive("highlight"),
        link: e.isActive("link"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        align: e.isActive({ textAlign: "left" })
          ? "left"
          : e.isActive({ textAlign: "center" })
            ? "center"
            : e.isActive({ textAlign: "right" })
              ? "right"
              : e.isActive({ textAlign: "justify" })
                ? "justify"
                : "left",
        style: e.isActive("heading", { level: 1 })
          ? "h1"
          : e.isActive("heading", { level: 2 })
            ? "h2"
            : e.isActive("heading", { level: 3 })
              ? "h3"
              : e.isActive("heading", { level: 4 })
                ? "h4"
                : e.isActive("heading", { level: 5 })
                  ? "h5"
                  : e.isActive("heading", { level: 6 })
                    ? "h6"
                    : "paragraph",
        fontSize: (e.getAttributes("textStyle").fontSize as string) || null,
      }
    },
  })

  const applyStyle = (command: string | null) => {
    if (!command) return
    const chain = editor.chain().focus()
    if (command === "paragraph") chain.setParagraph()
    else chain.toggleHeading({ level: Number(command.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 })
    chain.run()
  }

  const align = (a: "left" | "center" | "right" | "justify") => editor.chain().focus().setTextAlign(a).run()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-2 py-1">
      <Select value={state.style} onValueChange={applyStyle}>
        <SelectTrigger size="sm" className="h-7 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARAGRAPH_STYLES.map((s) => (
            <SelectItem key={s.command} value={s.command}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FontPicker editor={editor} />

      <Select
        value={state.fontSize || "16"}
        onValueChange={(v) => editor.chain().focus().setMark("textStyle", { fontSize: `${v}px` }).run()}
      >
        <SelectTrigger size="sm" className="h-7 w-14 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold" shortcut="Ctrl+B">
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic" shortcut="Ctrl+I">
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" shortcut="Ctrl+U">
        <Underline className="size-4" />
      </ToolButton>
      <ToolButton active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <Strikethrough className="size-4" />
      </ToolButton>
      <ToolButton active={state.code} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
        <Code className="size-4" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" />
      <TextColorButton editor={editor} />
      <HighlightButton editor={editor} active={state.highlight} />

      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton active={state.align === "left"} onClick={() => align("left")} title="Align left">
        <AlignLeft className="size-4" />
      </ToolButton>
      <ToolButton active={state.align === "center"} onClick={() => align("center")} title="Align center">
        <AlignCenter className="size-4" />
      </ToolButton>
      <ToolButton active={state.align === "right"} onClick={() => align("right")} title="Align right">
        <AlignRight className="size-4" />
      </ToolButton>
      <ToolButton active={state.align === "justify"} onClick={() => align("justify")} title="Justify">
        <AlignJustify className="size-4" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">
        <List className="size-4" />
      </ToolButton>
      <ToolButton active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
        <MessageSquarePlus className="size-4" />
      </ToolButton>
      <ToolButton active={state.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
        <Code className="size-4" />
      </ToolButton>

      <span className="mx-1 h-4 w-px bg-border" />
      <InsertImageButton editor={editor} />
      <InsertTableButton editor={editor} />
      <LinkButton editor={editor} active={state.link} />

      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        title="Clear formatting"
      >
        <X className="size-4" />
      </ToolButton>
    </div>
  )
}

function TextColorButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = React.useState(false)
  const color = useEditorState({
    editor,
    selector: (ctx) => (ctx.editor.getAttributes("textStyle").color as string) || null,
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 px-0" />}>
        <span className="flex flex-col items-center">
          <span className="text-xs font-semibold leading-none">A</span>
          <span className="h-1 w-3.5 rounded-sm" style={{ background: color || "currentColor" }} />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="start">
        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Text color</p>
        <div className="grid grid-cols-6 gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              className={cn(
                "size-6 rounded-md border border-border",
                color === c && "ring-2 ring-ring"
              )}
              style={{ background: c }}
              onClick={() => {
                editor.chain().focus().setColor(c).run()
                setOpen(false)
              }}
              title={c}
            />
          ))}
        </div>
        <button
          className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          onClick={() => {
            editor.chain().focus().unsetColor().run()
            setOpen(false)
          }}
        >
          Default color
        </button>
      </PopoverContent>
    </Popover>
  )
}

function HighlightButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className={cn("h-7 w-7 px-0", active && "bg-accent")} />}>
        <Highlighter className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="start">
        <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Highlight</p>
        <div className="grid grid-cols-4 gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className="h-7 rounded-md border border-border"
              style={{ background: c }}
              onClick={() => {
                editor.chain().focus().toggleHighlight({ color: c }).run()
                setOpen(false)
              }}
              title={c}
            />
          ))}
        </div>
        <button
          className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          onClick={() => {
            editor.chain().focus().toggleHighlight().run()
            setOpen(false)
          }}
        >
          Remove highlight
        </button>
      </PopoverContent>
    </Popover>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [href, setHref] = React.useState("")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className={cn("h-7 w-7 px-0", active && "bg-accent")} />}>
        <LinkIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Link</p>
        <div className="flex gap-1.5">
          <Input
            placeholder="https://…"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && href) {
                editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
                setOpen(false)
                setHref("")
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!href) return
              editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
              setOpen(false)
              setHref("")
            }}
          >
            Apply
          </Button>
        </div>
        {active && (
          <button
            className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
              setOpen(false)
            }}
          >
            Remove link
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function InsertImageButton({ editor }: { editor: Editor }) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => {
            const src = String(reader.result)
            editor.chain().focus().setImage({ src }).run()
          }
          reader.readAsDataURL(file)
          e.target.value = ""
        }}
      />
      <ToolButton
        onClick={() => ref.current?.click()}
        title="Insert image"
      >
        <ImageIcon className="size-4" />
      </ToolButton>
    </>
  )
}

function InsertTableButton({ editor }: { editor: Editor }) {
  return (
    <ToolButton
      onClick={() => {
        if (editor.isActive("table")) {
          editor.chain().focus().deleteTable().run()
        } else {
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      }}
      title={editor.isActive("table") ? "Delete table" : "Insert table"}
    >
      <TableIcon className="size-4" />
    </ToolButton>
  )
}

// --- Menu bar ---

/**
 * The seven dropdown menus (File/Edit/View/Insert/Format/Tools/Help).
 * Shared by the desktop row and the mobile expanded panel so every tool
 * stays reachable from a phone.
 */
function MenuItems({ props, importRef }: { props: ToolbarProps; importRef: HTMLInputElement | null }) {
  const { editor, callbacks: cb, canUndo, canRedo, onUndo, onRedo } = props
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          File
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onClick={cb.onNew}>
            New <DropdownMenuShortcut>Ctrl+Alt+N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onHome}>
            Home <DropdownMenuShortcut>Ctrl+Alt+H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => importRef?.click()}>Import…</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem onClick={() => cb.onExport("docx")}>Word (.docx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => cb.onExport("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => cb.onExport("md")}>Markdown (.md)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => cb.onExport("txt")}>Plain text (.txt)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => cb.onExport("html")}>HTML (.html)</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={cb.onRenameRequest}>Rename…</DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onToggleStar}>{props.starred ? "Unstar" : "Star"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={cb.onPageSetup}>
            Page setup… <DropdownMenuShortcut>Ctrl+Alt+P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onPrint}>
            Print <DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={cb.onDelete} variant="destructive">
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          Edit
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem disabled={!canUndo} onClick={onUndo}>
            <Undo2 /> Undo <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canRedo} onClick={onRedo}>
            <Redo2 /> Redo <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => document.execCommand("cut")}>
            Cut <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => document.execCommand("copy")}>
            Copy <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => document.execCommand("paste")}>
            Paste <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={cb.onFindReplace}>
            Find and replace <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onWordCount}>
            Word count <DropdownMenuShortcut>Ctrl+Shift+C</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          View
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onClick={cb.onPageSetup}>Page setup…</DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onToggleOutline}>
            Outline <DropdownMenuShortcut>Ctrl+Alt+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onToggleComments}>
            Comments <DropdownMenuShortcut>Ctrl+Alt+C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={cb.onWordCount}>Word count</DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onVersionHistory}>
            Version history <DropdownMenuShortcut>Ctrl+Alt+V</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          Insert
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onClick={() => importRef?.click()}>Image…</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            Table
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
            Horizontal rule
          </DropdownMenuItem>
          <DropdownMenuItem onClick={cb.onAddComment}>Comment</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          Format
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onClick={() => editor?.chain().focus().toggleBold().run()}>
            Bold <DropdownMenuShortcut>Ctrl+B</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor?.chain().focus().toggleItalic().run()}>
            Italic <DropdownMenuShortcut>Ctrl+I</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            Underline <DropdownMenuShortcut>Ctrl+U</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}>
            Clear formatting
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          Tools
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Editing</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={() => props.setSuggestionMode(!props.suggestionMode)}>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                  props.suggestionMode ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3 transform rounded-full bg-background shadow transition-transform",
                    props.suggestionMode ? "translate-x-3.5" : "translate-x-0.5"
                  )}
                />
              </span>
              Suggestion mode
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!props.hasSuggestions} onClick={props.onAcceptSuggestions}>
            Accept all suggestions
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!props.hasSuggestions} onClick={props.onRejectSuggestions}>
            Reject all suggestions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-[13px] font-medium" />}>
          Help
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onClick={cb.onHelp}>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[11px]">Void Docs · 0.1.0</DropdownMenuLabel>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export function EditorToolbar(props: ToolbarProps) {
  const { editor, syncState } = props
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [importRef, setImportRef] = React.useState<HTMLInputElement | null>(null)

  const fileInput = (
    <input
      ref={setImportRef}
      type="file"
      accept=".docx,.md,.markdown,.txt,.html,.htm"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) props.callbacks.onImport(file)
        e.target.value = ""
      }}
    />
  )

  return (
    <div className="border-b border-border bg-background">
      {fileInput}
      {/* Mobile: the whole toolbar collapses into one "Menu" button that
          expands into the full list of menus + format tools below. */}
      <div className="flex h-10 items-center gap-1 px-2 sm:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[13px] font-medium"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="vdocs-toolbar-panel"
        >
          <MenuIcon className="size-4" />
          Menu
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", menuOpen && "rotate-180")} />
        </Button>
        <div className="ms-auto flex min-w-0 items-center gap-1.5">
          <SyncingLabel state={syncState.state} />
        </div>
      </div>

      {/* Menus + format bar — always visible on desktop, expanded panel on mobile. */}
      <div id="vdocs-toolbar-panel" className={cn("flex-col", menuOpen ? "flex" : "hidden", "sm:flex")}>
        <div className="flex h-10 items-center gap-0.5 overflow-x-auto px-2">
          <MenuItems props={props} importRef={importRef} />
          <div className="ms-auto hidden items-center gap-1.5 sm:flex">
            <SyncingLabel state={syncState.state} />
          </div>
        </div>
        {editor && <FormatBar editor={editor} />}
      </div>
    </div>
  )
}

function SyncingLabel({ state }: { state: SyncState["state"] }) {
  if (state === "syncing") return <span className="truncate text-xs text-muted-foreground">Saving…</span>
  if (state === "synced") return <span className="truncate text-xs text-muted-foreground">All changes saved</span>
  if (state === "error") return <span className="truncate text-xs text-destructive">Sync error</span>
  return null
}

export function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px bg-border" />
}