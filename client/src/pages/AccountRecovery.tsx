import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "@/contexts/auth"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { VoidLogo } from "@/components/VoidLogo"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import Dialog from "@/components/ui/dialog"
import {
  getRecoveryContacts,
  addRecoveryContact,
  verifyRecoveryContact,
  deleteRecoveryContact,
  type RecoveryContact,
} from "@/lib/auth"

export function AccountRecovery() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<RecoveryContact[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [contactType, setContactType] = useState<"email" | "phone">("email")
  const [contactValue, setContactValue] = useState("")
  const [addError, setAddError] = useState("")
  const [addLoading, setAddLoading] = useState(false)

  const [verifyId, setVerifyId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [verifyError, setVerifyError] = useState("")
  const [verifyLoading, setVerifyLoading] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const [showCode, setShowCode] = useState<string | null>(null)

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase()

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    setLoading(true)
    const result = await getRecoveryContacts()
    if (Array.isArray(result)) {
      setContacts(result)
    }
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!contactValue.trim()) {
      setAddError("Please enter a contact value")
      return
    }
    setAddLoading(true)
    const result = await addRecoveryContact(contactType, contactValue.trim())
    setAddLoading(false)
    if ("error" in result) {
      setAddError(result.error)
    } else {
      setContactValue("")
      setShowAdd(false)
      setShowCode((result as any).code || null)
      loadContacts()
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!verifyId) return
    setVerifyError("")
    if (!verifyCode.trim()) {
      setVerifyError("Please enter the verification code")
      return
    }
    setVerifyLoading(true)
    const result = await verifyRecoveryContact(verifyId, verifyCode.trim())
    setVerifyLoading(false)
    if ("error" in result) {
      setVerifyError(result.error)
    } else {
      setVerifyId(null)
      setVerifyCode("")
      loadContacts()
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleteLoading(true)
    setDeleteError("")
    try {
      await deleteRecoveryContact(deleteId)
      setDeleteId(null)
      loadContacts()
    } catch (err: any) {
      setDeleteError(err.error || "Failed to delete")
    }
    setDeleteLoading(false)
  }

  if (!user) {
    void navigate("/login")
    return null
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <VoidLogo />
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <div>
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Recovery Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add trusted contacts to help you recover your account if you get locked out.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">Your recovery contacts</p>
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setContactType("email"); setContactValue(""); setAddError("") }}>
              Add contact
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center italic">
              No recovery contacts added yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {c.contact_type === "email" ? c.contact_value : c.contact_value}
                      </p>
                      <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {c.contact_type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.verified ? (
                        <span className="text-green-500">Verified</span>
                      ) : (
                        <span className="text-amber-500">Pending verification</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!c.verified && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => { setVerifyId(c.id); setVerifyCode(""); setVerifyError("") }}
                      >
                        Verify
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(c.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      {/* Add contact dialog */}
      {showAdd && (
        <Dialog open={showAdd} onOpenChange={(v: boolean) => { if (!v) setShowAdd(false) }} title="Add recovery contact" description="Add an email or phone number as a recovery contact.">
          <form onSubmit={handleAdd} className="space-y-4">
            {addError && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{addError}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="contact-type">Type</Label>
              <div className="flex gap-2">
                {(["email", "phone"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setContactType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                      contactType === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-value">
                {contactType === "email" ? "Email" : "Phone number"}
              </Label>
              <Input
                id="contact-value"
                type={contactType === "email" ? "email" : "tel"}
                placeholder={contactType === "email" ? "you@example.com" : "+1555123456"}
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? "Adding..." : "Add contact"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Verify dialog */}
      {verifyId && (
        <Dialog open={!!verifyId} onOpenChange={(v: boolean) => { if (!v) setVerifyId(null) }} title="Verify contact" description="Enter the verification code sent to your contact.">
          <form onSubmit={handleVerify} className="space-y-4">
            {verifyError && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{verifyError}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="verify-code">Verification code</Label>
              <Input
                id="verify-code"
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setVerifyId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={verifyLoading || verifyCode.length < 6}>
                {verifyLoading ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <Dialog open={!!deleteId} onOpenChange={(v: boolean) => { if (!v) setDeleteId(null) }} title="Remove contact" description="Are you sure you want to remove this recovery contact?">
          {deleteError && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive mb-3">{deleteError}</div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Removing..." : "Remove"}
            </Button>
          </div>
        </Dialog>
      )}

      {/* Verification code display */}
      {showCode && (
        <Dialog open={!!showCode} onOpenChange={(v: boolean) => { if (!v) setShowCode(null) }} title="Verify your contact" description="Use this code to verify your recovery contact. The code expires in 15 minutes.">
          <div className="space-y-4">
            <div className="rounded-lg bg-muted px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Verification code</p>
              <p className="text-2xl font-mono font-bold tracking-widest select-all">{showCode}</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Enter this code in the verify dialog for your new contact.
            </p>
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShowCode(null)}>
                Got it
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
