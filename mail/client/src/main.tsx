import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/contexts/toast"
import { SettingsProvider } from "@/contexts/settings"
import { AuthProvider } from "@/contexts/auth"
import { MailProvider } from "@/contexts/mail"
import { SyncProvider } from "@/contexts/sync"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <ToastProvider>
          <AuthProvider>
            <MailProvider>
              <SyncProvider>
                <App />
              </SyncProvider>
            </MailProvider>
          </AuthProvider>
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)

// Offline-first: register the service worker in production builds only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}