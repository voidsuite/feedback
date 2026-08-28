import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

interface ScopeChipProps {
  id: string
  scope: string
  label: string
  inBucket: 'available' | 'selected'
  onToggle?: () => void
}

const scopeColors: Record<string, { bg: string; text: string; border: string }> = {
  openid: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  profile: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
  email: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
  read: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
  write: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
}

export function ScopeChip({ id, scope, label, inBucket, onToggle }: ScopeChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { scope, label, from: inBucket },
  })

  const colors = scopeColors[scope] || { bg: 'bg-muted', text: 'text-foreground', border: 'border-border' }

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium cursor-grab active:cursor-grabbing select-none transition-colors hover:opacity-80 ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {label}
      {onToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="ml-0.5 opacity-50 hover:opacity-100"
        >
          {inBucket === 'selected' ? '×' : '+'}
        </button>
      )}
    </div>
  )
}

export const SCOPE_LABELS: Record<string, string> = {
  openid: 'OpenID',
  profile: 'Profile',
  email: 'Email',
  read: 'Read',
  write: 'Write',
}
