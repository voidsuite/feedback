import { useState, useEffect } from "react"
import { generateCode, getCountdown, type TOTPAccount } from "@/lib/totp"

interface TOTPCodeProps {
  account: TOTPAccount
  large?: boolean
}

export function TOTPCode({ account, large }: TOTPCodeProps) {
  const [code, setCode] = useState("")
  const [countdown, setCountdown] = useState(() => getCountdown(account))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const tick = async () => {
      setCode(await generateCode(account))
      setCountdown(getCountdown(account))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [account])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const formatted = large
    ? code
    : `${code.slice(0, 3)} ${code.slice(3)}`

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="group relative w-full text-center font-mono tabular-nums tracking-[0.25em] transition-colors select-all cursor-pointer"
      >
        <span className={large ? "text-5xl font-bold" : "text-3xl font-bold"}>
          {formatted || "------"}
        </span>
        {copied && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Copied
            </span>
          </span>
        )}
      </button>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${countdown.progress * 100}%` }}
        />
      </div>
      <p className="mt-1 text-center text-xs tabular-nums text-muted-foreground">
        {countdown.seconds}s
      </p>
    </div>
  )
}
