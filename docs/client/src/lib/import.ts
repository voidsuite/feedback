/**
 * Import pipelines — .docx (via mammoth), Markdown (parsed by tiptap-markdown),
 * HTML (sanitized with DOMPurify) and plain text.
 */

import type { Editor } from "@tiptap/react"
import DOMPurify from "dompurify"

export type ImportKind = "docx" | "md" | "html" | "txt"

export function kindForFileName(name: string): ImportKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "docx") return "docx"
  if (ext === "md" || ext === "markdown") return "md"
  if (ext === "html" || ext === "htm") return "html"
  if (ext === "txt") return "txt"
  return null
}

export async function importFileIntoEditor(file: File, editor: Editor): Promise<{ kind: ImportKind; warnings: string[] }> {
  const kind = kindForFileName(file.name)
  if (!kind) throw new Error(`Unsupported file type: .${file.name.split(".").pop()}`)

  switch (kind) {
    case "docx": {
      const arrayBuffer = await file.arrayBuffer()
      const mammoth = await import("mammoth")
      const result = await mammoth.convertToHtml({ arrayBuffer }, { includeDefaultStyleMap: true })
      const clean = DOMPurify.sanitize(result.value ?? "", {
        USE_PROFILES: { html: true },
      })
      editor.commands.setContent(clean)
      return { kind, warnings: result.messages.map((m) => m.message) }
    }
    case "md": {
      const text = await file.text()
      editor.commands.setContent(text) // tiptap-markdown overrides setContent to parse
      return { kind, warnings: [] }
    }
    case "html": {
      const text = await file.text()
      editor.commands.setContent(DOMPurify.sanitize(text, { USE_PROFILES: { html: true } }))
      return { kind, warnings: [] }
    }
    case "txt": {
      const text = await file.text()
      editor.commands.setContent(text)
      return { kind, warnings: [] }
    }
  }
}

/** Convenience for a drag & drop or hidden-file-input flow. */
export function readFileAsText(file: File): Promise<string> {
  return file.text()
}