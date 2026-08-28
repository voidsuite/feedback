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
import { ScopeChip, SCOPE_LABELS } from './ScopeChip'

interface ConfigBuilderProps {
  selectedApp: any
  onConfigChange?: (config: any) => void
}

const ALL_SCOPES = ['openid', 'profile', 'email', 'read', 'write']

export function ConfigBuilder({ selectedApp, onConfigChange }: ConfigBuilderProps) {
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    selectedApp?.allowedScopes || ['openid', 'profile', 'email']
  )
  const [availableScopes, setAvailableScopes] = useState<string[]>(
    ALL_SCOPES.filter((s) => !(selectedApp?.allowedScopes || ['openid', 'profile', 'email']).includes(s))
  )
  const [redirectUri, setRedirectUri] = useState(selectedApp?.redirectUris?.[0] || 'http://localhost:5173/callback')
  const [pkce, setPkce] = useState(true)
  const [nonce, setNonce] = useState(true)
  const [state, setState] = useState(true)
  const [tokenLifetime, setTokenLifetime] = useState(3600)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const emitChange = (scopes: string[], opts: Partial<typeof config> = {}) => {
    const config = {
      scopes,
      redirectUri,
      pkce,
      nonce,
      state,
      tokenLifetime,
      ...opts,
    }
    onConfigChange?.(config)
  }

  const moveToSelected = (scope: string) => {
    const newAvail = availableScopes.filter((s) => s !== scope)
    const newSelected = [...selectedScopes, scope]
    setAvailableScopes(newAvail)
    setSelectedScopes(newSelected)
    emitChange(newSelected, { availableScopes: newAvail })
  }

  const moveToAvailable = (scope: string) => {
    const newSelected = selectedScopes.filter((s) => s !== scope)
    const newAvail = [...availableScopes, scope]
    setSelectedScopes(newSelected)
    setAvailableScopes(newAvail)
    emitChange(newSelected, { availableScopes: newAvail })
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const scope = active.data.current?.scope as string
    const from = active.data.current?.from as string

    if (over.id === 'selected-bucket' && from === 'available') {
      moveToSelected(scope)
    } else if (over.id === 'available-bucket' && from === 'selected') {
      moveToAvailable(scope)
    }
  }

  const config = { scopes: selectedScopes, redirectUri, pkce, nonce, state, tokenLifetime }
  const activeScope = ALL_SCOPES.find((s) => s === activeId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Scopes */}
        <div className="space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scopes</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Drag scopes between buckets or click +/- to toggle</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Available */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium">Available</p>
              <div
                id="available-bucket"
                className="min-h-[80px] rounded-xl border-2 border-dashed border-border bg-muted/10 p-3 flex flex-wrap gap-2 content-start"
              >
                {availableScopes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground w-full text-center py-2">All scopes selected</p>
                ) : (
                  availableScopes.map((s) => (
                    <ScopeChip key={s} id={`scope-${s}`} scope={s} label={SCOPE_LABELS[s] || s} inBucket="available" onToggle={() => moveToSelected(s)} />
                  ))
                )}
              </div>
            </div>

            {/* Selected */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium">Selected</p>
              <div
                id="selected-bucket"
                className="min-h-[80px] rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-3 flex flex-wrap gap-2 content-start"
              >
                {selectedScopes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground w-full text-center py-2">No scopes selected</p>
                ) : (
                  selectedScopes.map((s) => (
                    <ScopeChip key={s} id={`scope-${s}`} scope={s} label={SCOPE_LABELS[s] || s} inBucket="selected" onToggle={() => moveToAvailable(s)} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Redirect URI */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Redirect URI</h3>
          <input
            value={redirectUri}
            onChange={(e) => { setRedirectUri(e.target.value); emitChange(selectedScopes, { redirectUri: e.target.value }) }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
            placeholder="https://yourapp.com/callback"
          />
        </div>

        {/* Options */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Options</h3>
          <div className="space-y-2">
            <OptionToggle label="PKCE (Proof Key for Code Exchange)" checked={pkce} onChange={(v) => { setPkce(v); emitChange(selectedScopes, { pkce: v }) }} />
            <OptionToggle label="Nonce (OIDC replay protection)" checked={nonce} onChange={(v) => { setNonce(v); emitChange(selectedScopes, { nonce: v }) }} />
            <OptionToggle label="State (CSRF protection)" checked={state} onChange={(v) => { setState(v); emitChange(selectedScopes, { state: v }) }} />
          </div>
        </div>

        {/* Token Lifetime */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Token Lifetime</h3>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={300}
              max={86400}
              step={300}
              value={tokenLifetime}
              onChange={(e) => { const v = Number(e.target.value); setTokenLifetime(v); emitChange(selectedScopes, { tokenLifetime: v }) }}
              className="flex-1"
            />
            <span className="text-xs font-mono text-muted-foreground w-20 text-right">
              {tokenLifetime < 3600 ? `${tokenLifetime / 60}m` : `${tokenLifetime / 3600}h`}
            </span>
          </div>
        </div>

        {/* Live Config Preview */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generated Config</h3>
          <pre className="rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      </div>

      <DragOverlay>
        {activeScope ? (
          <div className="bg-primary/10 border border-primary rounded-full px-3 py-1.5 text-xs font-medium text-primary shadow-lg">
            {SCOPE_LABELS[activeScope] || activeScope}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function OptionToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </div>
  )
}
