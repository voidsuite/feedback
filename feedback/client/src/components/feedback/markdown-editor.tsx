import * as React from "react"
import { Eye, Edit3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"

/**
 * Shared markdown editor: a textarea with a live preview toggle and a
 * compact cheat-sheet tooltip. Used by SubmitForm (issue body) and
 * LiveChat (reply body).
 *
 * The `value`/`onChange`/`placeholder`/`rows` props mirror the native
 * Textarea so this can drop in as a 1:1 replacement.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Markdown supported…",
  rows = 5,
  onKeyDown,
  autoFocus,
  className,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  autoFocus?: boolean
  className?: string
}) {
  const [preview, setPreview] = React.useState(false)

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <textarea
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className={cn(
            "min-h-[44px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            preview && "hidden"
          )}
          spellCheck
        />

        {preview && value.trim() && (
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
            <Markdown content={value} />
          </div>
        )}

        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setPreview((p) => !p)}
            className="rounded-md p-1 text-xs text-muted-foreground/60 opacity-0 hover:text-muted-foreground hover:opacity-100 focus:opacity-100 focus:outline-none"
            title={preview ? "Edit" : "Preview"}
          >
            {preview ? <Edit3 className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground/60">
        <MarkdownCheatsheet />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {preview ? "Edit mode" : "Preview mode"}
        </button>
      </div>
    </div>
  )
}

/** Compact markdown cheat-sheet shown below the editor. */
function MarkdownCheatsheet() {
  return (
    <span>
      <code className="rounded bg-muted/50 px-1 py-0.5">**bold**</code>, <code className="rounded bg-muted/50 px-1 py-0.5">`code`</code>,{" "}
      <code className="rounded bg-muted/50 px-1 py-0.5">```</code>, <code className="rounded bg-muted/50 px-1 py-0.5">1.</code>,{" "}
      <code className="rounded bg-muted/50 px-1 py-0.5">- list</code>
    </span>
  )
}
