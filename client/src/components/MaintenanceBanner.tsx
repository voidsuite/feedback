import { useAuth } from "@/contexts/auth"

export function MaintenanceBanner() {
  const { maintenanceMode, isAdmin } = useAuth()

  if (!maintenanceMode || !isAdmin) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-600 px-4 py-1.5 text-xs font-medium text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      VoidAuth is in maintenance mode. Non-admin users cannot access the platform.
    </div>
  )
}
