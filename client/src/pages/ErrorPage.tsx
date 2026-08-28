import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { VoidLogo } from "@/components/VoidLogo"

interface ErrorPageProps {
  code: number
  title?: string
  description?: string
}

const errorConfig: Record<number, { title: string; description: string; icon: JSX.Element }> = {
  404: {
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has been moved.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-12 text-muted-foreground">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path d="m8 11 6 0" />
      </svg>
    ),
  },
  403: {
    title: "Access denied",
    description: "You don't have permission to access this page.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-12 text-destructive">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  500: {
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again later.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-12 text-destructive">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
}

export function ErrorPage({ code, title, description }: ErrorPageProps) {
  const config = errorConfig[code] || errorConfig[500]

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-6 text-center">
        <VoidLogo size="md" />
        <div className="space-y-3">
          {config.icon}
          <p className="text-5xl font-bold tracking-tight text-muted-foreground">{code}</p>
          <h1 className="text-lg font-semibold">{title || config.title}</h1>
          <p className="text-sm text-muted-foreground">
            {description || config.description}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
