/**
 * Markdown rendering for card descriptions and comments.
 * marked parses, DOMPurify sanitizes — never render raw user markdown.
 */

import { marked } from "marked"
import DOMPurify from "dompurify"

marked.setOptions({
  gfm: true,
  breaks: false,
})

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md || "", { async: false }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"],
  })
}