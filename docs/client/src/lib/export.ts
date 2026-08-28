/**
 * Export pipelines — .docx (via the `docx` lib), HTML, Markdown (via
 * tiptap-markdown), plain text, and print-to-PDF (hidden iframe + window.print).
 *
 * Suggestions and comment marks are stripped: the exported document is the
 * "clean" view of the content.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import type { Editor } from "@tiptap/react"
import type { Node as PMNode, Mark as PMMark } from "@tiptap/pm/model"
import type { IRunOptions } from "docx"

import type { DocMeta } from "./types"

// --- Shared helpers ---

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function twipsFromPt(pt: number): number {
  return Math.round(pt * 20)
}

function pageDimensions(meta: DocMeta): { width: number; height: number; orientation: "portrait" | "landscape" } {
  const portrait = meta.page.size === "letter" ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 }
  return {
    width: meta.page.orientation === "landscape" ? portrait.height : portrait.width,
    height: meta.page.orientation === "landscape" ? portrait.width : portrait.height,
    orientation: meta.page.orientation,
  }
}

// --- Run (inline) mapping ---

function runStyle(mark: PMMark): Partial<IRunOptions> {
  switch (mark.type.name) {
    case "bold":
      return { bold: true }
    case "italic":
      return { italics: true }
    case "underline":
      return { underline: {} }
    case "strike":
      return { strike: true }
    case "code":
      return { font: "Courier New", shading: { type: "clear", fill: "F4F1EC" } }
    case "color":
      return { color: String(mark.attrs.color || "").replace(/^#/, "") }
    case "highlight": {
      const c = mark.attrs.color || "#FDE68A"
      return { highlight: c }
    }
    case "textStyle": {
      const font = mark.attrs.fontFamily ? String(mark.attrs.fontFamily) : undefined
      const px = Number.parseFloat(String(mark.attrs.fontSize ?? ""))
      const size = !Number.isNaN(px) ? Math.round(px * 1.5) : undefined // px → pt → half-points
      return {
        ...(font ? { font } : {}),
        ...(size !== undefined ? { size } : {}),
      }
    }
    default:
      return {}
  }
}

function runForText(node: PMNode): TextRun {
  let options: Partial<IRunOptions> = { text: node.text ?? "" }
  for (const mark of node.marks) options = { ...options, ...runStyle(mark) }
  return new TextRun(options as IRunOptions)
}

function nodeText(node: PMNode): string {
  return node.textContent
}

// --- Block mapping ---

function paragraphChildren(node: PMNode): Paragraph[] {
  const runs: TextRun[] = []
  const aligned = node.attrs.align as string | undefined
  for (const child of node.children ?? []) {
    if (child.isText) runs.push(runForText(child))
  }
  return [
    new Paragraph({
      children: runs,
      alignment:
        aligned === "center"
          ? AlignmentType.CENTER
          : aligned === "right"
            ? AlignmentType.RIGHT
            : aligned === "justify"
              ? AlignmentType.JUSTIFIED
              : AlignmentType.LEFT,
      spacing: { after: 120 },
    }),
  ]
}

function blockToParagraphs(node: PMNode, listContext: { list: 0 | 1 | -1; depth: number }): Paragraph[] {
  switch (node.type.name) {
    case "paragraph":
      return paragraphChildren(node)
    case "heading": {
      const level = Math.min(Number(node.attrs.level) || 1, 6)
      const heading = (HeadingLevel as unknown as Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]>)[level] ?? HeadingLevel.HEADING_1
      return [
        new Paragraph({
          children: Array.from(node.children ?? []).map(runForText),
          heading,
        }),
      ]
    }
    case "bulletList": {
      const out: Paragraph[] = []
      for (const item of node.children ?? []) out.push(...blockToParagraphs(item, { list: 0, depth: listContext.depth + 1 }))
      return out
    }
    case "orderedList": {
      const out: Paragraph[] = []
      for (const item of node.children ?? []) out.push(...blockToParagraphs(item, { list: 1, depth: listContext.depth + 1 }))
      return out
    }
    case "listItem":
      return [
        new Paragraph({
          children: Array.from(node.children ?? []).flatMap((c) => (c.isText ? [runForText(c)] : [])),
          numbering: {
            reference: listContext.list === 0 ? "bullets" : "numbers",
            level: Math.min(listContext.depth - 1, 2),
          },
          spacing: { after: 60 },
        }),
      ]
    case "blockquote":
      return [
        new Paragraph({
          children: Array.from(node.children ?? []).flatMap((c) => (c.isText ? [runForText(c)] : [])),
          border: { left: { color: "C7C2BA", size: 12, style: BorderStyle.SINGLE, space: 8 } },
          indent: { left: 360 },
          shading: { fill: "FAF7F2", type: "clear" },
        }),
      ]
    case "codeBlock":
      return [
        new Paragraph({
          children: [new TextRun({ text: nodeText(node), font: "Courier New", size: 18 })],
          shading: { fill: "F4F1EC", type: "clear" },
          spacing: { before: 120, after: 120 },
        }),
      ]
    case "image": {
      const src = String(node.attrs.src || "")
      if (!src.startsWith("data:")) return []
      try {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(src)
        if (!m) return []
        const w = Number(node.attrs.width) || 320
        const h = Number(node.attrs.height) || Math.round(w * 0.5625)
        return [
          new Paragraph({
            children: [
              new ImageRun({
                type: m[1].startsWith("image/png") ? "png" : "jpg",
                data: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)),
                transformation: { width: Math.max(24, Math.round(w)), height: Math.max(24, Math.round(h)) },
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ]
      } catch {
        return []
      }
    }
    default:
      return []
  }
}

function tableToDocx(node: PMNode): Table {
  const rows: TableRow[] = []
  for (const row of node.children ?? []) {
    const cells: TableCell[] = []
    for (const cell of row.children ?? []) {
      const paras: Paragraph[] = []
      for (const block of cell.children ?? []) paras.push(...blockToParagraphs(block, { list: -1, depth: 0 }))
      cells.push(
        new TableCell({
          children: paras.length ? paras : [new Paragraph({ children: [] })],
          shading: cell.type.name === "tableHeader" ? { fill: "F4F1EC", type: "clear" } : undefined,
        })
      )
    }
    rows.push(new TableRow({ children: cells }))
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

export async function exportAsDocx(editor: Editor, meta: DocMeta): Promise<void> {
  const dims = pageDimensions(meta)
  const children: (Paragraph | Table)[] = []
  const doc = editor.state.doc
  const blocks: PMNode[] = []
  doc.content.forEach((n) => blocks.push(n))

  for (const block of blocks) {
    if (block.type.name === "table") children.push(tableToDocx(block))
    else if (block.type.name === "horizontalRule")
      children.push(
        new Paragraph({
          border: { bottom: { color: "C7C2BA", size: 6, style: BorderStyle.SINGLE } },
          spacing: { before: 120, after: 120 },
        })
      )
    else children.push(...blockToParagraphs(block, { list: -1, depth: 0 }))
  }

  const numberingLevels = (format: "bullet" | "decimal") =>
    [0, 1, 2].map((level) => ({
      level,
      format: format === "bullet" ? LevelFormat.BULLET : LevelFormat.DECIMAL,
      text: format === "bullet" ? "\u2022" : `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
    }))

  const file = new Document({
    styles: {
      default: {
        document: { run: { font: "Aptos", size: 22 } },
      },
    },
    numbering: {
      config: [
        { reference: "bullets", levels: numberingLevels("bullet") },
        { reference: "numbers", levels: numberingLevels("decimal") },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: dims.width,
              height: dims.height,
              orientation: dims.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: twipsFromPt(meta.page.margins),
              bottom: twipsFromPt(meta.page.margins),
              left: twipsFromPt(meta.page.margins),
              right: twipsFromPt(meta.page.margins),
            },
          },
        },
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(file)
  downloadBlob(blob, `${meta.title || "document"}.docx`)
}

export function exportAsHtml(editor: Editor): string {
  const body = editor.getHTML()
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Exported document</title>
  <style>
    body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #1c1917; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #d6d3d1; padding: 6px 10px; }
    blockquote { border-left: 3px solid #c7c2ba; margin-left: 0; padding-left: 16px; color: #57534e; }
    pre { background: #f4f1ec; padding: 12px; border-radius: 8px; overflow-x: auto; }
    code { font-family: monospace; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

export function exportAsMarkdown(editor: Editor): string {
  try {
    const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown?.getMarkdown()
    return typeof md === "string" ? md : ""
  } catch {
    return ""
  }
}

export function exportAsText(editor: Editor): string {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n")
}

/** Print the rendered document (user picks "Save as PDF" in the dialog). */
export function exportAsPdf(editor: Editor, meta: DocMeta): void {
  const body = editor.getHTML()
  const widthMm = meta.page.size === "a4" ? 210 : 215.9
  const heightMm = meta.page.size === "a4" ? 297 : 279.4
  const orient = meta.page.orientation === "landscape" ? "landscape" : "portrait"
  const marginMm = Math.round(meta.page.margins * 0.3528)

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${widthMm}mm ${heightMm}mm ${orient};
      margin: ${marginMm}mm;
    }
    * { box-sizing: border-box; }
    body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #1c1917; margin: 0; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
    td, th { border: 1px solid #d6d3d1; padding: 6px 10px; }
    blockquote { border-left: 3px solid #c7c2ba; margin-left: 0; padding-left: 16px; color: #57534e; }
    pre { background: #f4f1ec; padding: 12px; border-radius: 8px; white-space: pre-wrap; page-break-inside: avoid; }
  </style>
</head>
<body>
${body}
</body>
</html>`

  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.srcdoc = html
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try {
      const win = iframe.contentWindow
      win?.focus()
      win?.print()
    } catch {
      /* noop */
    }
    setTimeout(() => iframe.remove(), 60_000)
  }
}