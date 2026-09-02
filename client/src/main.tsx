/**
 * Void Feedback entry point.
 *
 * Provider order matters:
 *   ThemeProvider → SettingsProvider → TooltipProvider → ToastProvider → AuthProvider
 * The router (RouterProvider) is created inside App, so providers sit outside it.
 * AuthProvider must not use router hooks at the top level (it doesn't).
 */

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import "@/index.css"
import { ThemeProvider } from "@/components/theme-provider"
import { SettingsProvider } from "@/contexts/settings"
import { ToastProvider } from "@/contexts/toast"
import { AuthProvider } from "@/contexts/auth"
import { TooltipProvider } from "@/components/ui/tooltip"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <TooltipProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </TooltipProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>
)
