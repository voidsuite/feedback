import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DraggableCard } from './DraggableCard'

interface CanvasComponent {
  id: string
  type: string
  label: string
  props: Record<string, any>
}

const COMPONENT_LIBRARY: CanvasComponent[] = [
  { id: 'login-btn', type: 'login-btn', label: 'Login Button', props: { text: 'Sign in with Void', theme: 'dark' } },
  { id: 'consent-card', type: 'consent-card', label: 'Consent Card', props: { showScopes: true, showAppInfo: true } },
  { id: 'user-card', type: 'user-card', label: 'User Card', props: { showAvatar: true, showEmail: true } },
  { id: 'token-display', type: 'token-display', label: 'Token Display', props: { format: 'jwt' } },
  { id: 'scope-list', type: 'scope-list', label: 'Scope List', props: { style: 'chips' } },
]

function ComponentCanvas({ children, canvasItems }: { children: React.ReactNode; canvasItems: CanvasComponent[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'component-canvas' })

  return (
    <div
      ref={setNodeRef}
      className={`grid grid-cols-2 gap-4 min-h-[300px] rounded-2xl border-2 border-dashed transition-colors p-4 ${
        isOver
          ? 'border-primary bg-primary/5'
          : canvasItems.length === 0
            ? 'border-border bg-muted/20 flex items-center justify-center'
            : 'border-transparent bg-muted/10'
      }`}
    >
      {children}
    </div>
  )
}

function LoginButtonPreview({ props }: { props: Record<string, any> }) {
  return (
    <div className="flex justify-center py-4">
      <button className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
        props.theme === 'dark' ? 'bg-primary text-primary-foreground' : 'bg-background border border-border text-foreground'
      }`}>
        {props.text}
      </button>
    </div>
  )
}

function ConsentCardPreview({ props }: { props: Record<string, any> }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-lg">A</div>
        <div>
          <p className="text-sm font-medium">My App</p>
          <p className="text-[10px] text-muted-foreground">wants to access your account</p>
        </div>
      </div>
      {props.showScopes && (
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px]">profile</span>
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px]">email</span>
        </div>
      )}
      <div className="flex gap-2">
        <button className="flex-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-muted text-muted-foreground">Cancel</button>
        <button className="flex-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary text-primary-foreground">Allow</button>
      </div>
    </div>
  )
}

function UserCardPreview({ props }: { props: Record<string, any> }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      {props.showAvatar && (
        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">U</div>
      )}
      <div>
        <p className="text-sm font-medium">User Name</p>
        {props.showEmail && <p className="text-[10px] text-muted-foreground">user@example.com</p>}
      </div>
    </div>
  )
}

function TokenDisplayPreview({ props }: { props: Record<string, any> }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Access Token</p>
      <div className="font-mono text-[10px] text-muted-foreground bg-muted rounded-lg p-2 break-all">
        eyJhbGciOiJSUzI1NiIs...{props.format === 'jwt' ? '.eyJzdWIiOiIxMjM0In0.signature' : ''}
      </div>
    </div>
  )
}

function ScopeListPreview({ props }: { props: Record<string, any> }) {
  const scopes = ['openid', 'profile', 'email']
  if (props.style === 'chips') {
    return (
      <div className="flex flex-wrap gap-1.5">
        {scopes.map((s) => (
          <span key={s} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{s}</span>
        ))}
      </div>
    )
  }
  return (
    <ul className="space-y-1">
      {scopes.map((s) => (
        <li key={s} className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-green-500" />{s}
        </li>
      ))}
    </ul>
  )
}

const PREVIEW_MAP: Record<string, React.FC<{ props: Record<string, any> }>> = {
  'login-btn': LoginButtonPreview,
  'consent-card': ConsentCardPreview,
  'user-card': UserCardPreview,
  'token-display': TokenDisplayPreview,
  'scope-list': ScopeListPreview,
}

function SortableCanvasItem({ item, onRemove, onPropsChange }: {
  item: CanvasComponent
  onRemove: (id: string) => void
  onPropsChange: (id: string, props: Record<string, any>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [expanded, setExpanded] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const Preview = PREVIEW_MAP[item.type]

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
              <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
              <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
              <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
            </svg>
          </button>
          <span className="text-xs font-medium flex-1">{item.label}</span>
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
              <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
            </svg>
          </button>
          <button onClick={() => onRemove(item.id)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {Preview && <Preview props={item.props} />}
        {expanded && (
          <div className="px-3 py-2 border-t border-border space-y-2">
            {Object.entries(item.props).map(([key, val]) => (
              <label key={key} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{key}</span>
                {typeof val === 'boolean' ? (
                  <div
                    onClick={() => onPropsChange(item.id, { ...item.props, [key]: !val })}
                    className={`w-7 h-3.5 rounded-full transition-colors cursor-pointer relative ${val ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-transform ${val ? 'translate-x-3' : 'translate-x-0.5'}`} />
                  </div>
                ) : (
                  <input
                    value={String(val)}
                    onChange={(e) => onPropsChange(item.id, { ...item.props, [key]: e.target.value })}
                    className="w-24 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-right"
                  />
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ComponentPickerProps {
  selectedApp: any
}

export function ComponentPicker({ selectedApp }: ComponentPickerProps) {
  const [canvasItems, setCanvasItems] = useState<CanvasComponent[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    if (over.id === 'component-canvas' && active.id !== 'component-canvas') {
      const comp = COMPONENT_LIBRARY.find((c) => c.id === active.id)
      if (comp) {
        setCanvasItems([...canvasItems, { ...comp, id: `${comp.id}-${Date.now()}` }])
      }
      return
    }

    if (active.id !== over.id) {
      const oldIndex = canvasItems.findIndex((c) => c.id === active.id)
      const newIndex = canvasItems.findIndex((c) => c.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        setCanvasItems(arrayMove(canvasItems, oldIndex, newIndex))
      }
    }
  }

  const removeItem = (id: string) => {
    setCanvasItems(canvasItems.filter((c) => c.id !== id))
  }

  const updateProps = (id: string, props: Record<string, any>) => {
    setCanvasItems(canvasItems.map((c) => c.id === id ? { ...c, props } : c))
  }

  const activeItem = COMPONENT_LIBRARY.find((c) => c.id === activeId) || canvasItems.find((c) => c.id === activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6">
        {/* Component Library */}
        <div className="w-44 shrink-0 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Components</h3>
          <p className="text-[10px] text-muted-foreground">Drag onto canvas</p>
          <div className="space-y-2">
            {COMPONENT_LIBRARY.map((comp) => (
              <DraggableCard key={comp.id} id={comp.id} data={comp}>
                <div className="bg-card border border-border rounded-xl p-3 hover:border-foreground/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {comp.type === 'login-btn' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                      )}
                      {comp.type === 'consent-card' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      )}
                      {comp.type === 'user-card' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
                      )}
                      {comp.type === 'token-display' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      )}
                      {comp.type === 'scope-list' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                      )}
                    </span>
                    <span className="text-xs font-medium">{comp.label}</span>
                  </div>
                </div>
              </DraggableCard>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Canvas</h3>
            {canvasItems.length > 0 && (
              <button onClick={() => setCanvasItems([])} className="text-[10px] text-muted-foreground hover:text-destructive">
                Clear all
              </button>
            )}
          </div>
          <ComponentCanvas canvasItems={canvasItems}>
            {canvasItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center col-span-2">Drag components here to build your UI</p>
            ) : (
              <SortableContext items={canvasItems.map((c) => c.id)} strategy={rectSortingStrategy}>
                {canvasItems.map((item) => (
                  <SortableCanvasItem
                    key={item.id}
                    item={item}
                    onRemove={removeItem}
                    onPropsChange={updateProps}
                  />
                ))}
              </SortableContext>
            )}
          </ComponentCanvas>
        </div>
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="bg-card border border-primary rounded-xl p-3 shadow-lg">
            <span className="text-xs font-medium">{activeItem.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
