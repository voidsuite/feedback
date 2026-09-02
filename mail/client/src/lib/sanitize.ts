import DOMPurify from "dompurify"

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "small", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd",
      "blockquote", "pre", "code", "hr", "a", "img", "table", "thead", "tbody", "tfoot",
      "tr", "th", "td", "caption", "colgroup", "col", "span", "div", "font", "center",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "width", "height", "align", "color", "bgcolor",
      "cite", "colspan", "rowspan", "headers", "scope", "summary", "border",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim()
}