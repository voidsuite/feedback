/**
 * Home-page document thumbnails — render each doc's content as a real image
 * (a rasterized "page"), not as plain text, so the cards look like mini
 * previews of the document.
 *
 * Pipeline per doc (result cached by the caller, keyed on meta.updatedAt):
 *   1. replay the decrypted Yjs update log into a throwaway Y.Doc,
 *   2. serialize the content to HTML via a headless TipTap editor,
 *   3. rasterize the HTML in an off-screen node with html-to-image,
 *   4. return a JPEG data URL + word count.
 */

import { Editor } from "@tiptap/core"
import DOMPurify from "dompurify"
import { toJpeg } from "html-to-image"
import * as Y from "yjs"
import { buildEditorExtensions } from "./editor"
import { fragmentToText, replayDoc } from "./ytext"

/** Captured thumbnail size — matches the home-page card ratio (4:3). */
const THUMB_W = 400
const THUMB_H = 300

export interface DocPreviewResult {
  /** JPEG data URL of the rendered first page, or null when empty/unrenderable. */
  image: string | null
  words: number
}

/** Load a doc's preview: rendered image + word count (null on any failure). */
export async function loadDocPreview(docId: string, docKeyB64: string): Promise<DocPreviewResult | null> {
  const doc = await replayDoc(docId, docKeyB64)
  if (!doc) return null
  try {
    const fragment = doc.getXmlFragment("default")
    const text = fragmentToText(fragment)
    const words = text.trim() ? text.trim().split(/\s+/).length : 0

    // Nothing stored yet — nothing to show (fall back to the placeholder icon).
    if (fragment.length === 0) return { image: null, words }

    const html = htmlFromDoc(doc)
    const image = html ? await rasterize(html) : null
    return { image, words }
  } finally {
    doc.destroy()
  }
}

/** Serialize a replayed Y.Doc to HTML using the real editor schema. */
function htmlFromDoc(doc: Y.Doc): string | null {
  // Detached element: mounts a ProseMirror view without ever attaching to the
  // page, purely to use TipTap's serializer against the yDoc's fragment.
  const element = document.createElement("div")
  let editor: Editor | null = null
  try {
    editor = new Editor({ element, editable: false, extensions: buildEditorExtensions({ yDoc: doc }) })
    const html = editor.getHTML()
    return html && html.trim() ? html : null
  } catch {
    return null
  } finally {
    editor?.destroy()
  }
}

/** Render sanitized doc HTML off-screen and rasterize the top of the "page". */
async function rasterize(html: string): Promise<string | null> {
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden"
  document.body.appendChild(host)

  const frame = document.createElement("div")
  frame.className = "doc-thumb-page"
  frame.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;overflow:hidden`
  frame.innerHTML = DOMPurify.sanitize(html)
  host.appendChild(frame)

  try {
    // Make sure embedded <img> elements are decoded before capture so the
    // rasterizer doesn't emit blank boxes for them.
    await Promise.all(
      Array.from(frame.querySelectorAll("img")).map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve()
                img.onerror = () => resolve()
              })
      )
    )
    return await toJpeg(frame, { width: THUMB_W, height: THUMB_H, quality: 0.82, backgroundColor: "#ffffff" })
  } catch {
    return null
  } finally {
    host.remove()
  }
}