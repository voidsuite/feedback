/**
 * "Export all documents" — writes the full local library to disk as either
 * a human-readable Markdown bundle or a JSON backup. Each document's
 * encrypted update log is replayed (see lib/ytext) so the export includes
 * real content, not just titles.
 */

import { dbLoadDocs } from "./db"
import { decryptStringWithKey } from "./crypto"
import { downloadBlob } from "./export"
import { loadDocText } from "./ytext"

export interface ExportedDoc {
  id: string
  title: string
  starred: boolean
  createdAt: number
  updatedAt: number
  words: number
  content: string
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function collectDocs(vault: CryptoKey): Promise<ExportedDoc[]> {
  const metas = await dbLoadDocs(vault)
  const out: ExportedDoc[] = []
  for (const meta of metas.filter((d) => !d.deleted).sort((a, b) => b.updatedAt - a.updatedAt)) {
    let docKey = ""
    try {
      docKey = await decryptStringWithKey(meta.wrappedDocKey, vault)
    } catch {
      continue
    }
    const text = await loadDocText(meta.id, docKey)
    out.push({
      id: meta.id,
      title: meta.title,
      starred: meta.starred,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      words: text?.words ?? 0,
      content: text?.text ?? "",
    })
  }
  return out
}

/** Single Markdown file with each document as a `# Title` section. */
export async function exportAllAsMarkdown(vault: CryptoKey): Promise<void> {
  const items = await collectDocs(vault)
  const body = items
    .map(
      (d) =>
        `# ${d.title}\n\n${d.content}\n\n---\n\n*${Math.max(d.words, 0)} words · ${new Date(d.updatedAt).toLocaleString()}*\n`
    )
    .join("\n\n")
  const file = `# Void Docs — exported ${new Date().toLocaleString()}\n\n${
    items.length ? body : "_Nothing to export yet._\n"
  }`
  downloadBlob(new Blob([file], { type: "text/markdown;charset=utf-8" }), `void-docs-${stamp()}.md`)
}

/** JSON backup with metadata + content for every document. */
export async function exportAllAsJson(vault: CryptoKey): Promise<void> {
  const items = await collectDocs(vault)
  const backup = {
    app: "void-docs",
    version: 1,
    exportedAt: Date.now(),
    docs: items,
  }
  const file = JSON.stringify(backup, null, 2)
  downloadBlob(new Blob([file], { type: "application/json;charset=utf-8" }), `void-docs-backup-${stamp()}.json`)
}

/** Convenience: export in the given format. */
export async function exportAll(vault: CryptoKey, format: "md" | "json"): Promise<void> {
  if (format === "md") await exportAllAsMarkdown(vault)
  else await exportAllAsJson(vault)
}
