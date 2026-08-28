import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Shield02Icon, CloudIcon, LockIcon, Mail01Icon, GlobeIcon,
  Message01Icon, Video01Icon, GamepadIcon, ShoppingCart01Icon,
  Dollar01Icon, Coins01Icon, Wallet01Icon, Task01Icon,
  Calendar01Icon, NoteIcon, BookOpen01Icon, FileIcon,
  Image01Icon, Camera01Icon, SearchIcon, CodeIcon,
  DatabaseIcon, DashboardSquare02Icon, Link01Icon,
  ContainerIcon, CpuIcon, BodyPartMuscleIcon, BrainIcon,
  HelpCircleIcon, AlertTriangle, FolderCloudIcon,
  CloudSyncIcon, Blockchain01Icon,
  YoutubeIcon, Linkedin01Icon, Facebook01Icon,
  InstagramIcon, TwitterIcon, RedditIcon, SlackIcon,
  Github01Icon, GitlabIcon, MicrosoftIcon, Apple01Icon,
  GoogleIcon, TelegramIcon,
} from "@hugeicons/core-free-icons"
import { getSimpleIconUrl, getIconTitle } from "@/lib/simpleIcons"

const ICON_MAP: Record<string, any> = {
  Shield02Icon, CloudIcon, LockIcon, Mail01Icon, GlobeIcon,
  Message01Icon, Video01Icon, GamepadIcon, ShoppingCart01Icon,
  Dollar01Icon, Coins01Icon, Wallet01Icon, Task01Icon,
  Calendar01Icon, NoteIcon, BookOpen01Icon, FileIcon,
  Image01Icon, Camera01Icon, SearchIcon, CodeIcon,
  DatabaseIcon, DashboardSquare02Icon, Link01Icon,
  ContainerIcon, CpuIcon, BodyPartMuscleIcon, BrainIcon,
  HelpCircleIcon, AlertTriangle, FolderCloudIcon,
  CloudSyncIcon, Blockchain01Icon,
  YoutubeIcon, Linkedin01Icon, Facebook01Icon,
  InstagramIcon, TwitterIcon, RedditIcon, SlackIcon,
  Github01Icon, GitlabIcon, MicrosoftIcon, Apple01Icon,
  GoogleIcon, TelegramIcon,
}

function isHugeicon(name: string): boolean {
  return name.endsWith("Icon") || name === "AlertTriangle" || name === "MoreHorizontal"
}

interface AppIconProps {
  icon?: string
  className?: string
}

export function AppIcon({ icon, className }: AppIconProps) {
  const name = icon || "Shield02Icon"
  const [imgError, setImgError] = useState(false)

  if (isHugeicon(name)) {
    const iconComponent = ICON_MAP[name] || Shield02Icon
    return <HugeiconsIcon icon={iconComponent} className={className} />
  }

  if (imgError) {
    return <HugeiconsIcon icon={Shield02Icon} className={className} />
  }

  return (
    <img
      src={getSimpleIconUrl(name, getIconTitle(name))}
      alt={name}
      className={className}
      onError={() => setImgError(true)}
      style={{ borderRadius: "6px" }}
    />
  )
}

export { ICON_MAP }
