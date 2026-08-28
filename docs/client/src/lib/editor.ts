/**
 * TipTap editor definition for docs — the Google-Docs-style rich text engine.
 *
 * Everything here is schema-level and shared by every collaborator, so
 * documents stay consistent when Yjs merges updates from different clients.
 */

import { Extension, Mark, mergeAttributes, type AnyExtension } from "@tiptap/core"
import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Heading } from "@tiptap/extension-heading"
import { Bold } from "@tiptap/extension-bold"
import { Italic } from "@tiptap/extension-italic"
import { Underline } from "@tiptap/extension-underline"
import { Strike } from "@tiptap/extension-strike"
import { Code } from "@tiptap/extension-code"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { Highlight } from "@tiptap/extension-highlight"
import { Link } from "@tiptap/extension-link"
import { BulletList } from "@tiptap/extension-bullet-list"
import { OrderedList } from "@tiptap/extension-ordered-list"
import { ListItem } from "@tiptap/extension-list-item"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { Blockquote } from "@tiptap/extension-blockquote"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { HorizontalRule } from "@tiptap/extension-horizontal-rule"
import { HardBreak } from "@tiptap/extension-hard-break"
import { Placeholder } from "@tiptap/extension-placeholder"
import { TextAlign } from "@tiptap/extension-text-align"
import { CharacterCount } from "@tiptap/extension-character-count"
import { Dropcursor } from "@tiptap/extension-dropcursor"
import { Gapcursor } from "@tiptap/extension-gapcursor"
import { Image } from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import { History } from "@tiptap/extension-history"
import { Collaboration } from "@tiptap/extension-collaboration"
import { Markdown } from "tiptap-markdown"
import { yCursorPlugin } from "@tiptap/y-tiptap"
import { createLowlight, common } from "lowlight"
import * as Y from "yjs"
import type { Awareness } from "y-protocols/awareness"

import type { FontDef } from "./types"

// --- Fonts (bundled via @fontsource; the browser fetches each woff2 on first use) ---

import "@fontsource/roboto"
import "@fontsource/open-sans"
import "@fontsource/lato"
import "@fontsource/montserrat"
import "@fontsource/raleway"
import "@fontsource/oswald"
import "@fontsource/playfair-display"
import "@fontsource/merriweather"
import "@fontsource/source-serif-4"
import "@fontsource/noto-serif"
import "@fontsource/poppins"
import "@fontsource/nunito"
import "@fontsource/cabin"
import "@fontsource/work-sans"
import "@fontsource/space-grotesk"
import "@fontsource/archivo"
import "@fontsource/comfortaa"
import "@fontsource/ubuntu"
import "@fontsource/pacifico"
import "@fontsource/dancing-script"
import "@fontsource/caveat"
import "@fontsource/righteous"
import "@fontsource/jetbrains-mono"
import "@fontsource/fira-code"
import "@fontsource/ibm-plex-mono"

export const FONTS: FontDef[] = [
  { label: "Inter", family: "'Inter Variable', sans-serif" },
  { label: "Roboto", family: "'Roboto', sans-serif" },
  { label: "Open Sans", family: "'Open Sans', sans-serif" },
  { label: "Lato", family: "'Lato', sans-serif" },
  { label: "Montserrat", family: "'Montserrat', sans-serif" },
  { label: "Raleway", family: "'Raleway', sans-serif" },
  { label: "Oswald", family: "'Oswald', sans-serif" },
  { label: "Poppins", family: "'Poppins', sans-serif" },
  { label: "Nunito", family: "'Nunito', sans-serif" },
  { label: "Cabin", family: "'Cabin', sans-serif" },
  { label: "Work Sans", family: "'Work Sans', sans-serif" },
  { label: "Space Grotesk", family: "'Space Grotesk', sans-serif" },
  { label: "Archivo", family: "'Archivo', sans-serif" },
  { label: "Comfortaa", family: "'Comfortaa', sans-serif" },
  { label: "Ubuntu", family: "'Ubuntu', sans-serif" },
  { label: "Playfair Display", family: "'Playfair Display', serif" },
  { label: "Merriweather", family: "'Merriweather', serif" },
  { label: "Source Serif 4", family: "'Source Serif 4', serif" },
  { label: "Noto Serif", family: "'Noto Serif', serif" },
  { label: "Pacifico", family: "'Pacifico', cursive" },
  { label: "Dancing Script", family: "'Dancing Script', cursive" },
  { label: "Caveat", family: "'Caveat', cursive" },
  { label: "Righteous", family: "'Righteous', display" },
  { label: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
  { label: "Fira Code", family: "'Fira Code', monospace" },
  { label: "IBM Plex Mono", family: "'IBM Plex Mono', monospace" },
]

export const SYSTEM_FONTS: FontDef[] = [
  { label: "Arial", family: "Arial, sans-serif", system: true },
  { label: "Georgia", family: "Georgia, serif", system: true },
  { label: "Times New Roman", family: "'Times New Roman', serif", system: true },
  { label: "Courier New", family: "'Courier New', monospace", system: true },
]

const lowlight = createLowlight(common)

// --- Paragraph styles (the toolbar "style" dropdown) ---

export const PARAGRAPH_STYLES = [
  { label: "Normal text", command: "paragraph" as const },
  { label: "Heading 1", command: "h1" as const },
  { label: "Heading 2", command: "h2" as const },
  { label: "Heading 3", command: "h3" as const },
  { label: "Heading 4", command: "h4" as const },
  { label: "Heading 5", command: "h5" as const },
  { label: "Heading 6", command: "h6" as const },
]

// --- Suggestion (tracked changes) marks ---

const suggestionAttrs = {
  author: { default: "" },
  color: { default: "#f59e0b" },
  date: { default: 0 },
}

export const SuggestionInsert = Mark.create({
  name: "suggestion-insert",
  inclusive: true,
  addAttributes() {
    return suggestionAttrs
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-insert]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-suggestion-insert": "", class: "vdocs-sugg-insert" }), 0]
  },
})

export const SuggestionDelete = Mark.create({
  name: "suggestion-delete",
  inclusive: true,
  addAttributes() {
    return suggestionAttrs
  },
  parseHTML() {
    return [{ tag: "span[data-suggestion-delete]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-suggestion-delete": "", class: "vdocs-sugg-delete" }), 0]
  },
})

// --- Comments mark ---

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: true,
  addAttributes() {
    return {
      threadId: { default: "" },
      author: { default: "" },
      color: { default: "#f59e0b" },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-comment]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-comment": "" }), 0]
  },
})

// --- Collaboration cursors (y-prosemirror decorations) ---

export const CollaborationCursor = Extension.create<{ awareness: Awareness | null }, { awareness: Awareness | null }>({
  name: "collaborationCursor",
  addOptions() {
    return { awareness: null }
  },
  addStorage() {
    return { awareness: null }
  },
  addProseMirrorPlugins() {
    if (!this.options.awareness) return []
    return [yCursorPlugin(this.options.awareness, {})]
  },
})

// --- Main extension assembly ---

export function buildEditorExtensions(opts?: {
  yDoc?: Y.Doc | null
  awareness?: Awareness | null
}): AnyExtension[] {
  const { yDoc, awareness } = opts || {}

  const textStyle = TextStyle.extend({
    addGlobalAttributes() {
      return [
        {
          types: ["textStyle"],
          attributes: {
            fontFamily: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.fontFamily || null,
              renderHTML: (attrs: Record<string, unknown>) =>
                attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
            },
            fontSize: {
              default: null,
              parseHTML: (el: HTMLElement) => el.style.fontSize || null,
              renderHTML: (attrs: Record<string, unknown>) =>
                attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
            },
          },
        },
      ]
    },
  })

  const extensions = [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    textStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      HTMLAttributes: { rel: "noopener noreferrer nofollow" },
    }),
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    Blockquote,
    CodeBlockLowlight.configure({ lowlight }),
    HorizontalRule,
    HardBreak,
    Placeholder.configure({ placeholder: "Start typing, or paste text." }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    CharacterCount,
    Dropcursor,
    Gapcursor,
    Image.configure({
      allowBase64: true,
      inline: false,
      resize: {
        enabled: true,
        directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
        minWidth: 48,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Markdown.configure({ tightLists: true, transformPastedText: false, transformCopiedText: false }),
    SuggestionInsert,
    SuggestionDelete,
    CommentMark,
  ]

  if (yDoc) {
    extensions.push(
      Collaboration.configure({ document: yDoc, field: "default" }),
      CollaborationCursor.configure({ awareness: awareness || null })
    )
  } else {
    extensions.push(History)
  }

  return extensions
}

// --- Comments (metadata lives in a synced Y.Map; ranges use the comment mark) ---

export const COMMENTS_MAP = "vdocsComments"

export interface PlainCommentThread {
  id: string
  text: string
  author: string
  authorColor?: string
  createdAt: number
  resolved: boolean
  resolvedBy?: string
  replies: { id: string; author: string; authorColor?: string; text: string; createdAt: number }[]
}

export function addCommentThread(
  doc: Y.Doc,
  data: { id: string; text: string; author: string; authorColor?: string }
): void {
  const map = doc.getMap(COMMENTS_MAP)
  if (map.has(data.id)) return
  map.set(data.id, {
    text: data.text,
    author: data.author,
    authorColor: data.authorColor || "",
    createdAt: Date.now(),
    resolved: false,
    resolvedBy: "",
    replies: [],
  })
}

export function addCommentReply(
  doc: Y.Doc,
  threadId: string,
  reply: { id: string; text: string; author: string; authorColor?: string }
): void {
  const map = doc.getMap(COMMENTS_MAP)
  const thread = map.get(threadId) as Record<string, unknown> | undefined
  if (thread && Array.isArray(thread.replies)) {
    map.set(threadId, {
      ...thread,
      replies: [
        ...thread.replies,
        { id: reply.id, text: reply.text, author: reply.author, authorColor: reply.authorColor || "", createdAt: Date.now() },
      ],
    })
  }
}

export function setCommentResolved(doc: Y.Doc, threadId: string, resolved: boolean, by?: string): void {
  const map = doc.getMap(COMMENTS_MAP)
  const thread = map.get(threadId) as Record<string, unknown> | undefined
  if (thread) map.set(threadId, { ...thread, resolved, resolvedBy: resolved ? by || "" : "" })
}

export function deleteCommentThread(doc: Y.Doc, threadId: string): void {
  doc.getMap(COMMENTS_MAP).delete(threadId)
}

export function readCommentThreads(doc: Y.Doc): PlainCommentThread[] {
  const map = doc.getMap(COMMENTS_MAP)
  const out: PlainCommentThread[] = []
  for (const [id, raw] of map.entries()) {
    const t = raw as Record<string, unknown>
    out.push({
      id,
      text: typeof t.text === "string" ? t.text : "",
      author: typeof t.author === "string" ? t.author : "Unknown",
      authorColor: typeof t.authorColor === "string" ? t.authorColor : undefined,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : 0,
      resolved: t.resolved === true,
      resolvedBy: typeof t.resolvedBy === "string" ? t.resolvedBy : undefined,
      replies: Array.isArray(t.replies)
        ? (t.replies as Record<string, unknown>[]).map((r) => ({
            id: String(r.id || ""),
            author: String(r.author || "Unknown"),
            authorColor: typeof r.authorColor === "string" ? r.authorColor : undefined,
            text: String(r.text || ""),
            createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
          }))
        : [],
    })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

// --- Suggestion accept / reject ---

type EditorLike = {
  state: import("@tiptap/pm/state").EditorState
  view: import("@tiptap/pm/view").EditorView
}

function collectMarkRanges(
  editor: EditorLike,
  markName: string,
  scope: "all" | "selection"
): { from: number; to: number }[] {
  const { state } = editor
  const markType = state.schema.marks[markName]
  if (!markType) return []
  const ranges: { from: number; to: number }[] = []
  const sel = state.selection as { from?: number; to?: number }
  const from = scope === "selection" && typeof sel.from === "number" ? sel.from : 0
  const to = scope === "selection" && typeof sel.to === "number" ? sel.to : state.doc.content.size
  state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((m) => m.type === markType)) {
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      if (end > start) ranges.push({ from: start, to: end })
    }
    return true
  })
  return ranges
}

/**
 * Accept suggestions in scope:
 *  - suggestion-insert → keep the text, drop the mark
 *  - suggestion-delete → delete the text
 */
export function acceptSuggestions(editor: EditorLike, scope: "all" | "selection" = "all"): boolean {
  const { state } = editor
  const insertType = state.schema.marks["suggestion-insert"]
  const tr = state.tr
  const ops: { from: number; to: number; kind: "remove-mark" | "delete" }[] = [
    ...collectMarkRanges(editor, "suggestion-insert", scope).map((r) => ({ ...r, kind: "remove-mark" as const })),
    ...collectMarkRanges(editor, "suggestion-delete", scope).map((r) => ({ ...r, kind: "delete" as const })),
  ].sort((a, b) => b.from - a.from)
  for (const op of ops) {
    if (op.kind === "delete") {
      tr.delete(op.from, op.to)
    } else if (insertType) {
      tr.removeMark(op.from, op.to, insertType)
    }
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    return true
  }
  return false
}

/**
 * Reject suggestions in scope:
 *  - suggestion-insert → delete the text
 *  - suggestion-delete → keep the text, drop the mark
 */
export function rejectSuggestions(editor: EditorLike, scope: "all" | "selection" = "all"): boolean {
  const { state } = editor
  const deleteType = state.schema.marks["suggestion-delete"]
  const tr = state.tr
  const ops: { from: number; to: number; kind: "delete" | "remove-mark" }[] = [
    ...collectMarkRanges(editor, "suggestion-insert", scope).map((r) => ({ ...r, kind: "delete" as const })),
    ...collectMarkRanges(editor, "suggestion-delete", scope).map((r) => ({ ...r, kind: "remove-mark" as const })),
  ].sort((a, b) => b.from - a.from)
  for (const op of ops) {
    if (op.kind === "delete") {
      tr.delete(op.from, op.to)
    } else if (deleteType) {
      tr.removeMark(op.from, op.to, deleteType)
    }
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    return true
  }
  return false
}

export function hasSuggestions(editor: { state: import("@tiptap/pm/state").EditorState }): boolean {
  const { state } = editor
  const insertType = state.schema.marks["suggestion-insert"]
  const deleteType = state.schema.marks["suggestion-delete"]
  let found = false
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type === insertType || m.type === deleteType)) {
      found = true
      return false
    }
    return true
  })
  return found
}