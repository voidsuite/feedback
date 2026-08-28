/**
 * Yjs content helpers — replay a document's encrypted update log into a
 * throwaway Y.Doc and extract plain text. Used by the home-page previews
 * and by "export all documents".
 */

import * as Y from "yjs"
import { b64UrlToKey, decryptBytesWithKey } from "./crypto"
import { loadDocUpdates } from "./db"

export interface DocText {
  text: string
  words: number
  chars: number
}

/** Replay every stored update for a doc into a fresh Y.Doc (destroy it after). */
export async function replayDoc(docId: string, docKeyB64: string): Promise<Y.Doc | null> {
  try {
    const key = await b64UrlToKey(docKeyB64)
    const doc = new Y.Doc()
    const updates = await loadDocUpdates(docId)
    for (const enc of updates) {
      try {
        const plain = await decryptBytesWithKey(enc, key)
        Y.applyUpdate(doc, plain)
      } catch {
        // wrong key / corrupted update — skip
      }
    }
    return doc
  } catch {
    return null
  }
}

function elementToText(el: Y.XmlElement): string {
  const name = el.nodeName || ""
  const parts: string[] = []
  el.toArray().forEach((child) => {
    if (child instanceof Y.XmlText) parts.push(child.toString())
    else if (child instanceof Y.XmlElement) parts.push(elementToText(child))
  })

  if (name === "img") {
    const alt = el.getAttribute("alt")
    return alt ? `[image: ${alt}]` : "[image]"
  }
  if (name === "pre" || name === "codeBlock") return parts.join("\n")
  if (name === "li") return `• ${parts.join(" ")}`
  if (name === "horizontalRule") return "—"
  return parts.join(name === "p" || name.startsWith("h") || name === "blockquote" ? " " : "")
}

/** Flatten a Y.XmlFragment into readable plain text (paragraphs separated). */
export function fragmentToText(fragment: Y.XmlFragment): string {
  const parts: string[] = []
  fragment.forEach((child) => {
    if (child instanceof Y.XmlText) parts.push(child.toString())
    else if (child instanceof Y.XmlElement) parts.push(elementToText(child))
  })
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Load a doc's content as plain text + stats. */
export async function loadDocText(docId: string, docKeyB64: string): Promise<DocText | null> {
  const doc = await replayDoc(docId, docKeyB64)
  if (!doc) return null
  try {
    const fragment = doc.getXmlFragment("default")
    const text = fragmentToText(fragment)
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    return { text, words, chars: text.length }
  } finally {
    doc.destroy()
  }
}
