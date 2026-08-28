import { useDroppable } from '@dnd-kit/core'

interface DropZoneProps {
  id: string
  children: React.ReactNode
  className?: string
  label?: string
}

export function DropZone({ id, children, className = '', label }: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[120px] rounded-2xl border-2 border-dashed transition-colors ${
        isOver
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/20'
      } ${className}`}
    >
      {label && (
        <div className="absolute top-2 left-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
