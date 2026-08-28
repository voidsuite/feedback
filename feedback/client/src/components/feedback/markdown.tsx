import * as React from "react"
import { renderMarkdown } from "@/lib/markdown"
import { cn } from "@/lib/utils"

/** Render sanitized markdown (server-stored, user-authored). */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = React.useMemo(() => renderMarkdown(content), [content])
  return (
    <div
      className={cn("vb-markdown", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
