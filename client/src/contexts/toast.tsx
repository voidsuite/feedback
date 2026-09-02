import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface Toast {
  id: string
  message: string
  type: "success" | "error" | "info"
}

interface ToastContextType {
  addToast: (message: string, type?: Toast["type"]) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

const icons: Record<Toast["type"], string> = {
  success: "M20 6L9 17l-5-5",
  error: "M18 6L6 18M6 6l12 12",
  info: "M12 16v-4M12 8h.01",
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    return () => {
      for (const t of timeoutRefs.current.values()) {
        clearTimeout(t)
      }
      timeoutRefs.current.clear()
    }
  }, [])

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
      timeoutRefs.current.delete(id)
    }, 4000)
    timeoutRefs.current.set(id, t)
  }, [])

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right-4 fade-in duration-200",
              t.type === "success" && "border-green-500/30 bg-green-500/10 text-green-600",
              t.type === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
              t.type === "info" && "border-border bg-card text-foreground",
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0">
              <path d={icons[t.type]} />
            </svg>
            <p className="flex-1 text-xs">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-current opacity-50 hover:opacity-100 transition-opacity">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
