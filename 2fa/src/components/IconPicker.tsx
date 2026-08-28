import { useState, useMemo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchIcon } from "@hugeicons/core-free-icons"
import { AppIcon } from "@/components/AppIcon"
import { searchIcons } from "@/lib/simpleIcons"

const HUGEICON_OPTIONS = [
  { value: "Shield02Icon", label: "Security/2FA" },
  { value: "GoogleIcon", label: "Google" },
  { value: "Github01Icon", label: "GitHub" },
  { value: "GitlabIcon", label: "GitLab" },
  { value: "MicrosoftIcon", label: "Microsoft" },
  { value: "Apple01Icon", label: "Apple" },
  { value: "Mail01Icon", label: "Email" },
  { value: "CloudIcon", label: "Cloud" },
  { value: "LockIcon", label: "Lock" },
  { value: "GlobeIcon", label: "Website" },
  { value: "Message01Icon", label: "Chat" },
  { value: "Video01Icon", label: "Video" },
  { value: "GamepadIcon", label: "Gaming" },
  { value: "ShoppingCart01Icon", label: "Shopping" },
  { value: "Dollar01Icon", label: "Finance" },
  { value: "Coins01Icon", label: "Crypto" },
  { value: "Wallet01Icon", label: "Wallet" },
  { value: "Task01Icon", label: "Tasks" },
  { value: "Calendar01Icon", label: "Calendar" },
  { value: "NoteIcon", label: "Notes" },
  { value: "BookOpen01Icon", label: "Docs" },
  { value: "FileIcon", label: "Files" },
  { value: "Image01Icon", label: "Images" },
  { value: "Camera01Icon", label: "Camera" },
  { value: "SearchIcon", label: "Search" },
  { value: "CodeIcon", label: "Code" },
  { value: "DatabaseIcon", label: "Database" },
  { value: "DashboardSquare02Icon", label: "Dashboard" },
  { value: "Link01Icon", label: "Links" },
  { value: "ContainerIcon", label: "Containers" },
  { value: "CpuIcon", label: "Infrastructure" },
  { value: "BodyPartMuscleIcon", label: "Health/Fitness" },
  { value: "BrainIcon", label: "AI/Mind" },
  { value: "HelpCircleIcon", label: "Help" },
  { value: "AlertTriangle", label: "Alert" },
  { value: "FolderCloudIcon", label: "Cloud Storage" },
  { value: "CloudSyncIcon", label: "Sync" },
  { value: "Blockchain01Icon", label: "Blockchain" },
  { value: "YoutubeIcon", label: "YouTube" },
  { value: "Linkedin01Icon", label: "LinkedIn" },
  { value: "Facebook01Icon", label: "Facebook" },
  { value: "InstagramIcon", label: "Instagram" },
  { value: "TwitterIcon", label: "Twitter/X" },
  { value: "RedditIcon", label: "Reddit" },
  { value: "SlackIcon", label: "Slack" },
  { value: "TelegramIcon", label: "Telegram" },
]

interface IconPickerProps {
  value: string
  onChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IconPicker({ value, onChange, open, onOpenChange }: IconPickerProps) {
  const [search, setSearch] = useState("")

  const combinedOptions = useMemo(() => {
    const hugeResults = search
      ? HUGEICON_OPTIONS.filter(
          (i) => i.label.toLowerCase().includes(search.toLowerCase()) || i.value.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 30)
      : HUGEICON_OPTIONS.slice(0, 12)

    const simpleResults = search ? searchIcons(search, 200) : searchIcons(search, 50)

    return {
      hugeicons: hugeResults.map((h) => ({ ...h, type: "hugeicons" as const })),
      simple: simpleResults.map((s) => ({ ...s, type: "simple-icons" as const })),
    }
  }, [search])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-10"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <HugeiconsIcon icon={SearchIcon} className="size-3.5 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search 500+ brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {combinedOptions.simple.length > 0 && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
              Brand Logos
            </div>
          )}
          {combinedOptions.simple.map((opt) => (
            <button
              key={opt.slug}
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                value === opt.slug ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onClick={() => { onChange(opt.slug); onOpenChange(false) }}
            >
              <div className={`flex size-7 items-center justify-center overflow-hidden rounded-md ${
                value === opt.slug ? "bg-muted/50" : "bg-muted"
              }`}>
                <AppIcon icon={opt.slug} className="size-4" />
              </div>
              <span className="truncate">{opt.title}</span>
            </button>
          ))}
          {combinedOptions.hugeicons.length > 0 && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
              Generic Icons
            </div>
          )}
          {combinedOptions.hugeicons.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                value === opt.value ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onClick={() => { onChange(opt.value); onOpenChange(false) }}
            >
              <div className={`flex size-7 items-center justify-center rounded-md ${
                value === opt.value ? "bg-primary/20" : "bg-muted"
              }`}>
                <AppIcon icon={opt.value} className="size-4" />
              </div>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
