/**
 * Editor context menu — right-click menu bound to the TipTap editor.
 * Built on the base-ui ContextMenu primitive (positions at the cursor).
 */

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  Eraser,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Scissors,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

interface EditorContextMenuProps {
  editor: Editor
  children: React.ReactNode
  /** Insert an image (opens the shared file picker). */
  onInsertImage: () => void
  onAddComment: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export function EditorContextMenu({
  editor,
  children,
  onInsertImage,
  onAddComment,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorContextMenuProps) {
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor
      const sel = e.state.selection
      const from = typeof sel.from === "number" ? sel.from : 0
      const to = typeof sel.to === "number" ? sel.to : 0
      const nodeAt = from ? e.state.doc.nodeAt(from) : null
      return {
        selectionActive: to > from,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        blockquote: e.isActive("blockquote"),
        align: e.isActive({ textAlign: "left" })
          ? "left"
          : e.isActive({ textAlign: "center" })
            ? "center"
            : e.isActive({ textAlign: "right" })
              ? "right"
              : "left",
        headingLevel: e.isActive("heading") ? Number(e.getAttributes("heading").level) || 0 : 0,
        linkHref: (e.getAttributes("link").href as string) || "",
        imageSelected: !!nodeAt && nodeAt.type.name === "image",
      }
    },
  })

  const doCopy = () => {
    editor.view.focus()
    try {
      document.execCommand("copy")
    } catch {
      /* clipboard blocked */
    }
  }
  const doCut = () => {
    editor.view.focus()
    try {
      document.execCommand("cut")
    } catch {
      /* clipboard blocked */
    }
  }

  const applyStyle = (level: number) => {
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!state.selectionActive} onClick={doCut} closeOnClick={false}>
          <Scissors /> Cut
        </ContextMenuItem>
        <ContextMenuItem disabled={!state.selectionActive} onClick={doCopy} closeOnClick={false}>
          <Copy /> Copy
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canUndo} onClick={onUndo}>
          <Undo2 /> Undo
          <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canRedo} onClick={onRedo}>
          <Redo2 /> Redo
          <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut>
        </ContextMenuItem>

        {state.imageSelected && (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel inset>Image</ContextMenuLabel>
              <ContextMenuItem onClick={onInsertImage}>
                <ImageIcon /> Replace image…
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onClick={() => {
                  editor.chain().focus().deleteNode("image").run()
                }}
              >
                <Trash2 /> Delete image
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel inset>Text</ContextMenuLabel>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleBold().run()
            }}
            className={cn(state.bold && "bg-accent text-accent-foreground")}
          >
            <Bold /> Bold
            <ContextMenuShortcut>Ctrl+B</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleItalic().run()
            }}
            className={cn(state.italic && "bg-accent text-accent-foreground")}
          >
            <Italic /> Italic
            <ContextMenuShortcut>Ctrl+I</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleUnderline().run()
            }}
            className={cn(state.underline && "bg-accent text-accent-foreground")}
          >
            <Underline /> Underline
            <ContextMenuShortcut>Ctrl+U</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleStrike().run()
            }}
            className={cn(state.strike && "bg-accent text-accent-foreground")}
          >
            <Strikethrough /> Strikethrough
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>
            <Pilcrow /> Paragraph style
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onClick={() => applyStyle(0)} className={cn(state.headingLevel === 0 && "bg-accent")}>
              Normal text
            </ContextMenuItem>
            <ContextMenuItem onClick={() => applyStyle(1)} className={cn(state.headingLevel === 1 && "bg-accent")}>
              <Heading1 /> Heading 1
            </ContextMenuItem>
            <ContextMenuItem onClick={() => applyStyle(2)} className={cn(state.headingLevel === 2 && "bg-accent")}>
              <Heading2 /> Heading 2
            </ContextMenuItem>
            <ContextMenuItem onClick={() => applyStyle(3)} className={cn(state.headingLevel === 3 && "bg-accent")}>
              <Heading3 /> Heading 3
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>
            <AlignLeft /> Align
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              className={cn(state.align === "left" && "bg-accent")}
            >
              <AlignLeft /> Left
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
              className={cn(state.align === "center" && "bg-accent")}
            >
              <AlignCenter /> Center
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              className={cn(state.align === "right" && "bg-accent")}
            >
              <AlignRight /> Right
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {state.linkHref && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              closeOnClick={false}
              onClick={() => {
                window.open(state.linkHref, "_blank", "noopener,noreferrer")
              }}
            >
              <ExternalLink /> Open link
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
              }}
            >
              <Unlink /> Remove link
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel inset>Insert</ContextMenuLabel>
          <ContextMenuItem onClick={onInsertImage}>
            <ImageIcon /> Image…
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <TableIcon /> Table
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().setHorizontalRule().run()
            }}
          >
            <Minus /> Horizontal rule
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor
                .chain()
                .focus()
                .toggleBulletList()
                .run()
            }}
            className={cn(state.bulletList && "bg-accent text-accent-foreground")}
          >
            <List /> Bulleted list
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleOrderedList().run()
            }}
            className={cn(state.orderedList && "bg-accent text-accent-foreground")}
          >
            <ListOrdered /> Numbered list
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor.chain().focus().toggleBlockquote().run()
            }}
            className={cn(state.blockquote && "bg-accent text-accent-foreground")}
          >
            <Quote /> Quote
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuItem disabled={!state.selectionActive} onClick={onAddComment}>
          <MessageSquarePlus /> Add comment
          <ContextMenuShortcut>Ctrl+Alt+M</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }}
        >
          <Eraser /> Clear formatting
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}