import * as React from "react"
import { Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MarkdownEditor } from "./markdown-editor"
import { api, type ThreadType, type ThreadPriority, type ThreadDetail, type UploadResult } from "@/lib/api"
import { PRIORITY_LABEL } from "@/lib/types"

const SOURCE_APP_LABELS: Record<string, string> = {
  board: "Board",
  "2fa": "2FA",
  docs: "Docs",
  mail: "Mail",
  client: "VoidAuth",
  feedback: "Void Feedback",
}

export function SubmitForm({ sourceApp, onCreated, autoFocus }: { sourceApp?: string | null; onCreated: (thread: ThreadDetail) => void; autoFocus?: boolean }) {
  const [type, setType] = React.useState<ThreadType>("question")
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [priority, setPriority] = React.useState<ThreadPriority>("medium")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  async function uploadImage(file: File): Promise<string> {
    const result: UploadResult = await api.uploadImage(file)
    return `![${file.name}](${result.url})`
  }

  async function submit() {
    if (!title.trim()) {
      setError("Please add a short title.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const { thread } = await api.createThread({
        type,
        sourceApp: sourceApp ?? null,
        title: title.trim(),
        bodyMarkdown: body,
        priority,
      })
      setTitle("")
      setBody("")
      onCreated(thread)
    } catch (e: any) {
      setError(e?.message || "Failed to submit")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="fb-title">Title</Label>
          <Input
            id="fb-title"
            autoFocus={autoFocus}
            placeholder="Short summary of your feedback"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit()
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ThreadType)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="feature">Feature request</SelectItem>
              <SelectItem value="bug">Bug report</SelectItem>
              <SelectItem value="support">Support chat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fb-body">Details</Label>
        <MarkdownEditor
          id="fb-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onImageUpload={uploadImage}
          placeholder="Add context, steps to reproduce, or the feature you'd love to see. Markdown supported. Drag images or click the toolbar buttons to format."
          rows={5}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as ThreadPriority)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{PRIORITY_LABEL.low}</SelectItem>
              <SelectItem value="medium">{PRIORITY_LABEL.medium}</SelectItem>
              <SelectItem value="high">{PRIORITY_LABEL.high}</SelectItem>
              <SelectItem value="urgent">{PRIORITY_LABEL.urgent}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sourceApp ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Reporting from: {SOURCE_APP_LABELS[sourceApp] || sourceApp}
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Public feedback helps the whole Void suite</span>
        )}

        <Button onClick={submit} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit feedback
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
