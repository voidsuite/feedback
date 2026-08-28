import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { DraggableCard } from './DraggableCard'

interface FlowStep {
  id: string
  type: string
  label: string
  icon: JSX.Element
  description: string
  config: Record<string, any>
}

const stepIcons = {
  authorize: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  consent: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  callback: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  token: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" />
    </svg>
  ),
  userinfo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
}

const AVAILABLE_STEPS: FlowStep[] = [
  { id: 'authorize', type: 'authorize', label: 'Authorize', icon: stepIcons.authorize, description: 'Redirect user to /oauth/authorize', config: { pkce: true, nonce: true, state: true } },
  { id: 'consent', type: 'consent', label: 'Consent Screen', icon: stepIcons.consent, description: 'User reviews permissions', config: { showScopes: true, showAppInfo: true } },
  { id: 'callback', type: 'callback', label: 'Callback', icon: stepIcons.callback, description: 'Receive auth code at redirect_uri', config: {} },
  { id: 'token', type: 'token', label: 'Token Exchange', icon: stepIcons.token, description: 'POST /oauth/token for access + refresh', config: { pkce: true } },
  { id: 'userinfo', type: 'userinfo', label: 'User Info', icon: stepIcons.userinfo, description: 'GET /oauth/userinfo with token', config: {} },
]

function CanvasDropZone({ children, flowSteps }: { children: React.ReactNode; flowSteps: FlowStep[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'flow-canvas' })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[300px] rounded-2xl border-2 border-dashed transition-colors p-4 ${
        isOver
          ? 'border-primary bg-primary/5'
          : flowSteps.length === 0
            ? 'border-border bg-muted/20 flex items-center justify-center'
            : 'border-transparent bg-muted/10'
      }`}
    >
      {children}
    </div>
  )
}

function SortableStep({ step, onRemove, onConfigChange }: {
  step: FlowStep
  onRemove: (id: string) => void
  onConfigChange: (id: string, config: Record<string, any>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const [expanded, setExpanded] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute left-6 -top-3 w-px h-3 bg-border" />

      <div className="bg-card border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
              <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
              <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
              <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
            </svg>
          </button>
          <span className="text-muted-foreground">{step.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{step.label}</p>
            <p className="text-[10px] text-muted-foreground truncate">{step.description}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(!expanded)} className="p-1 text-muted-foreground hover:text-foreground">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                <path d="M5 8l5 5 5-5" />
              </svg>
            </button>
            <button onClick={() => onRemove(step.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="pt-2 border-t border-border space-y-2">
            {step.type === 'authorize' && (
              <>
                <Toggle label="PKCE" checked={step.config.pkce} onChange={(v) => onConfigChange(step.id, { ...step.config, pkce: v })} />
                <Toggle label="Nonce" checked={step.config.nonce} onChange={(v) => onConfigChange(step.id, { ...step.config, nonce: v })} />
                <Toggle label="State" checked={step.config.state} onChange={(v) => onConfigChange(step.id, { ...step.config, state: v })} />
              </>
            )}
            {step.type === 'token' && (
              <Toggle label="PKCE (code_verifier)" checked={step.config.pkce} onChange={(v) => onConfigChange(step.id, { ...step.config, pkce: v })} />
            )}
            {step.type === 'consent' && (
              <>
                <Toggle label="Show scopes" checked={step.config.showScopes} onChange={(v) => onConfigChange(step.id, { ...step.config, showScopes: v })} />
                <Toggle label="Show app info" checked={step.config.showAppInfo} onChange={(v) => onConfigChange(step.id, { ...step.config, showAppInfo: v })} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span className="text-muted-foreground">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )
}

interface FlowBuilderProps {
  selectedApp: any
}

export function FlowBuilder({ selectedApp }: FlowBuilderProps) {
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
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

    if (over.id === 'flow-canvas') {
      const step = AVAILABLE_STEPS.find((s) => s.id === active.id)
      if (step && !flowSteps.find((s) => s.type === step.type)) {
        setFlowSteps([...flowSteps, { ...step, id: `${step.id}-${Date.now()}` }])
      }
      return
    }

    if (active.id !== over.id) {
      const oldIndex = flowSteps.findIndex((s) => s.id === active.id)
      const newIndex = flowSteps.findIndex((s) => s.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        setFlowSteps(arrayMove(flowSteps, oldIndex, newIndex))
      }
    }
  }

  const removeStep = (id: string) => {
    setFlowSteps(flowSteps.filter((s) => s.id !== id))
  }

  const updateStepConfig = (id: string, config: Record<string, any>) => {
    setFlowSteps(flowSteps.map((s) => s.id === id ? { ...s, config } : s))
  }

  const activeStep = AVAILABLE_STEPS.find((s) => s.id === activeId) || flowSteps.find((s) => s.id === activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps</h3>
          <p className="text-[10px] text-muted-foreground">Drag to canvas to build your flow</p>
          <div className="space-y-2">
            {AVAILABLE_STEPS.map((step) => (
              <DraggableCard key={step.id} id={step.id} data={step}>
                <div className="bg-card border border-border rounded-xl p-3 hover:border-foreground/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{step.icon}</span>
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                </div>
              </DraggableCard>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Flow</h3>
            {flowSteps.length > 0 && (
              <button onClick={() => setFlowSteps([])} className="text-[10px] text-muted-foreground hover:text-destructive">
                Clear all
              </button>
            )}
          </div>
          <CanvasDropZone flowSteps={flowSteps}>
            {flowSteps.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center">Drag steps here to build your OAuth flow</p>
            ) : (
              <SortableContext items={flowSteps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {flowSteps.map((step) => (
                    <SortableStep
                      key={step.id}
                      step={step}
                      onRemove={removeStep}
                      onConfigChange={updateStepConfig}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </CanvasDropZone>
        </div>
      </div>

      <DragOverlay>
        {activeStep ? (
          <div className="bg-card border border-primary rounded-xl p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{activeStep.icon}</span>
              <span className="text-xs font-medium">{activeStep.label}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
