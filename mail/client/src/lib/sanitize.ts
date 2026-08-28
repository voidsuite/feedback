/**
 * Tiny HTML sanitizer for message bodies. Removes scriptable and dangerous
 * content while keeping basic formatting. It is deliberately conservative:
 * if something looks off, it is dropped.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code", "hr", "a", "img", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "caption", "colgroup", "col", "span", "div", "font", "center",
])

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "align", "color", "bgcolor",
  "cite", "colspan", "rowspan", "headers", "scope", "summary", "border",
])

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "cid:"])

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  sanitizeNode(doc.body)
  return doc.body.innerHTML
}

function sanitizeNode(node: Element | null): void {
  if (!node) return
  const children = Array.from(node.children)
  for (const child of children) {
    const tag = child.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) {
      // Replace disallowed elements with their text content (inlines the text)
      const parent = child.parentNode
      while (child.firstChild) parent?.insertBefore(child.firstChild, child)
      parent?.removeChild(child)
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      if (!ALLOWED_ATTRS.has(name)) {
        child.removeAttribute(attr.name)
        continue
      }
      if (name === "href" || name === "src") {
        let value = attr.value.trim().toLowerCase()
        if (!value.startsWith("data:")) {
          const protocol = new URL(attr.value, window.location.href).protocol
          if (!ALLOWED_PROTOCOLS.has(protocol)) {
            child.removeAttribute(attr.name)
            continue
          }
        }
        // Never allow javascript: or similar
        if (value.includes("javascript:")) {
          child.removeAttribute(attr.name)
          continue
        }
      }
      if (name === "src" && !ALLOWED_PROTOCOLS.has(new URL(attr.value, window.location.href).protocol)) {
        child.removeAttribute(attr.name)
      }
    }
    // Strip inline event handlers
    for (const attr of Array.from(child.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) child.removeAttribute(attr.name)
    }
    sanitizeNode(child)
  }
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim()
}