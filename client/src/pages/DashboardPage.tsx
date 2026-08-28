import { useState, useEffect, useRef, useCallback } from "react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "@/contexts/auth"
import { getStoredUser } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { VoidLogo } from "@/components/VoidLogo"
import { 
  getConnectedApps, 
  revokeApp, 
  getUserProfile, 
  updateProfile,
  deleteAccount,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  setupTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
  getDeveloperApps,
  getDeveloperApp,
  createDeveloperApp,
  updateDeveloperApp,
  regenerateAppSecret,
  uploadAppLogo,
  uploadAvatar,
  getStorageUsage,
  getStorageFiles,
  uploadStorageFile,
  deleteStorageFile,
  getAllStorageAppData,
  deleteStorageAppData,
  listTwoFABackupCodes,
  generateTwoFABackupCodes,
  type ConnectedApp,
  type Passkey,
  type DeveloperApp,
  type StorageUsage,
  type StorageFile,
  type StorageAppDataItem,
} from "@/lib/auth"
import { cn } from "@/lib/utils"
import Dialog from '@/components/ui/dialog'
import { DeveloperPlayground } from '@/components/DeveloperPlayground'

const DEMO_OAUTH_URL =
  "/oauth?client_id=demo-app&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Foauth%2Fcallback&scope=profile%20email&state=demo123"

export function DashboardPage() {
  const { user, logout, refreshUser, isAdmin } = useAuth()
  const navigate = useNavigate()
  // Read display fields from localStorage to avoid React state timing issues
  // where setUser() hasn't flushed before navigation
  const localUser = getStoredUser()
  const avatarUrl = localUser?.avatarUrl ?? user?.avatarUrl ?? null
  const createdAt = localUser?.createdAt ?? user?.createdAt
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean>(false)
  const [twoFASecret, setTwoFASecret] = useState<string | null>(null)
  const [twoFAQr, setTwoFAQr] = useState<string | null>(null)
  const [showSecurityMenu, setShowSecurityMenu] = useState<boolean>(false)
  const [verifyInput, setVerifyInput] = useState<string>('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [existingBackupCodes, setExistingBackupCodes] = useState<{ id: string; used: boolean }[]>([])
  const [showExistingBackupCodes, setShowExistingBackupCodes] = useState(false)
  const [stats, setStats] = useState({ connectedApps: 0, activeSessions: 0 })

  const [pageLoading, setPageLoading] = useState(true)

  // Storage
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([])
  const [appDataItems, setAppDataItems] = useState<StorageAppDataItem[]>([])
  const [showStorage, setShowStorage] = useState(false)
  const [showAppData, setShowAppData] = useState(false)
  const [showIntegration, setShowIntegration] = useState(false)

  // Developer apps
  const [devApps, setDevApps] = useState<DeveloperApp[]>([])
  const [showDeleteDevApp, setShowDeleteDevApp] = useState<string | null>(null)

  // Create app dialog
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDesc, setCreateDesc] = useState("")
  const [createUris, setCreateUris] = useState("")
  const [createScopes, setCreateScopes] = useState<string[]>(["profile", "email"])
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit app dialog
  const [editAppId, setEditAppId] = useState<string | null>(null)
  const [editApp, setEditApp] = useState<DeveloperApp | null>(null)
  const [appEditName, setAppEditName] = useState("")
  const [appEditDesc, setAppEditDesc] = useState("")
  const [appEditUris, setAppEditUris] = useState("")
  const [appEditScopes, setAppEditScopes] = useState<string[]>([])
  const [appEditError, setAppEditError] = useState<string | null>(null)
  const [appEditSuccess, setAppEditSuccess] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const AVAILABLE_SCOPES = ["openid", "profile", "email", "read", "write"]

  // Avatar dropdown & edit profile
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPwd, setEditPwd] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)

  // Account management state
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const [formCurrentPassword, setFormCurrentPassword] = useState("")
  const [formNewPassword, setFormNewPassword] = useState("")
  const [formConfirmPassword, setFormConfirmPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDisableModal, setShowDisableModal] = useState(false)
  const [disablePwd, setDisablePwd] = useState("")
  const [showAddPasskeyModal, setShowAddPasskeyModal] = useState(false)
  const [newPasskeyName, setNewPasskeyName] = useState("")
  const [showDeletePasskeyId, setShowDeletePasskeyId] = useState<string | null>(null)

  const [avatarDragOver, setAvatarDragOver] = useState(false)
  const [editAvatarDragOver, setEditAvatarDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleDragOver = (setter: (v: boolean) => void) => (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setter(true) }
  const handleDragLeave = (setter: (v: boolean) => void) => (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setter(false) }
  const handleDrop = (setter: (v: boolean) => void) => async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setter(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setIsSubmitting(true)
    try {
      const result = await uploadAvatar(file)
      if ('avatarUrl' in result) refreshUser()
    } catch { /* ignore */ }
    finally { setIsSubmitting(false) }
  }

  const statusBadge: Record<string, "default" | "secondary" | "outline"> = {
    official: "default", verified: "secondary", unverified: "outline",
  }

  const loadData = useCallback(async () => {
    if (!user) return

    const [connectedApps, userPasskeys, profile, developerApps] = await Promise.all([
      getConnectedApps(),
      listPasskeys(),
      getUserProfile(),
      getDeveloperApps(),
    ])

    setApps(connectedApps)
    setPasskeys(userPasskeys)
    setDevApps(developerApps)
    if (profile && profile.user) {
      setTwoFAEnabled(!!profile.user.twoFactorEnabled)
    }
    setStats(profile?.stats ?? { connectedApps: connectedApps.length, activeSessions: 0 })

    const [storageUsage, sf, appData] = await Promise.all([
      getStorageUsage(),
      getStorageFiles(),
      getAllStorageAppData(),
    ])
    setStorage(storageUsage)
    setStorageFiles(sf.files)
    setAppDataItems(appData)
  }, [user])

  useEffect(() => {
    if (!user) return
    loadData().finally(() => setPageLoading(false))
  }, [user])


  // Close dropdown on outside click via overlay, not document listener
  const closeMenu = () => setShowUserMenu(false)

  if (!user) {
    void navigate("/login")
    return null
  }

  async function handleLogout() {
    await logout()
    void navigate("/login")
  }

  async function handleRevoke(appId: string) {
    try {
      const success = await revokeApp(appId)
      if (success) {
        const updatedApps = await getConnectedApps()
        setApps(updatedApps)
      }
    } catch (error) {
      console.error('Error revoking app:', error)
    }
  }

  async function handleDeleteDevApp(id: string) {
    await deleteDeveloperApp(id)
    setDevApps(devApps.filter(a => a.id !== id))
    setShowDeleteDevApp(null)
  }

  async function handleCreateApp(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const uris = createUris.split("\n").map(u => u.trim()).filter(Boolean)
    if (uris.length === 0) { setCreateError("At least one redirect URI is required"); return }
    setIsSubmitting(true)
    const result = await createDeveloperApp({ name: createName, description: createDesc || undefined, redirect_uris: uris, allowed_scopes: createScopes })
    if ('error' in result) {
      setCreateError(result.error); setIsSubmitting(false)
    } else {
      setDevApps(await getDeveloperApps()); setShowCreateApp(false); setIsSubmitting(false)
      setCreateName(""); setCreateDesc(""); setCreateUris(""); setCreateScopes(["profile", "email"])
    }
  }

  async function openEditApp(id: string) {
    const app = await getDeveloperApp(id)
    if (!app) return
    setEditApp(app); setEditAppId(id)
    setAppEditName(app.name); setAppEditDesc(app.description || "")
    setAppEditUris(app.redirectUris.join("\n")); setAppEditScopes(app.allowedScopes)
    setAppEditError(null); setAppEditSuccess(null); setNewSecret(null)
  }

  async function handleEditApp(e: React.FormEvent) {
    e.preventDefault()
    setAppEditError(null); setAppEditSuccess(null)
    const uris = appEditUris.split("\n").map(u => u.trim()).filter(Boolean)
    if (uris.length === 0) { setAppEditError("At least one redirect URI is required"); return }
    setIsSubmitting(true)
    const result = await updateDeveloperApp(editAppId!, { name: appEditName, description: appEditDesc || undefined, redirect_uris: uris, allowed_scopes: appEditScopes })
    if (result.success) {
      setAppEditSuccess("App updated"); setDevApps(await getDeveloperApps())
      if (editApp) { setEditApp({ ...editApp, name: appEditName, description: appEditDesc, allowedScopes: appEditScopes, redirectUris: uris }) }
    } else {
      setAppEditError(result.error || "Failed to update")
    }
    setIsSubmitting(false)
  }

  async function handleRegenerateSecret() {
    if (!editAppId) return
    const res = await regenerateAppSecret(editAppId)
    if ('clientSecret' in res) {
      setNewSecret(res.clientSecret)
    }
  }

  function toggleCreateScope(s: string) {
    setCreateScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function toggleEditScope(s: string) {
    setAppEditScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleViewBackupCodes() {
    if (showExistingBackupCodes) { setShowExistingBackupCodes(false); return }
    setShowExistingBackupCodes(true)
    const result = await listTwoFABackupCodes()
    if ('codes' in result) {
      setExistingBackupCodes(result.codes)
    } else {
      setFormError(result.error || 'Failed to load backup codes')
    }
  }

  async function handleRegenerateBackupCodes() {
    setIsSubmitting(true)
    const result = await generateTwoFABackupCodes()
    if ('codes' in result) {
      setBackupCodes(result.codes)
      setExistingBackupCodes([])
      setShowExistingBackupCodes(false)
      setFormSuccess('New backup codes generated')
    } else {
      setFormError(result.error || 'Failed to generate backup codes')
    }
    setIsSubmitting(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsSubmitting(true)
    try {
      const result = await uploadAvatar(file)
      if ('avatarUrl' in result) {
        refreshUser()
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  async function handleEditProfile(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    setEditSuccess(null)
    setIsSubmitting(true)
    try {
      const data: any = {}
      if (editName !== user.name) data.name = editName
      if (editEmail !== user.email) { data.email = editEmail; data.currentPassword = editPwd }
      if (Object.keys(data).length === 0) { setIsSubmitting(false); return }
      const result = await updateProfile(data)
      if (result.success) {
        refreshUser()
        setEditSuccess("Profile updated")
        setTimeout(() => { setShowEditProfile(false); setEditPwd("") }, 1500)
      } else {
        setEditError(result.error || "Failed to update")
      }
    } catch {
      setEditError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveName = () => { setEditName(user.name); setEditEmail(user.email); setEditPwd(""); setEditError(null); setEditSuccess(null); setShowUserMenu(false); setShowEditProfile(true) }

  const resetForms = () => {
    setIsChangingPassword(false)
    setIsDeletingAccount(false)
    setFormCurrentPassword("")
    setFormNewPassword("")
    setFormConfirmPassword("")
    setFormError(null)
    setFormSuccess(null)
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    if (formNewPassword !== formConfirmPassword) {
      setFormError("Passwords do not match")
      return
    }
    setIsSubmitting(true)
    try {
      const result = await updateProfile({
        currentPassword: formCurrentPassword,
        newPassword: formNewPassword
      })
      if (result.success) {
        refreshUser()
        setFormSuccess("Password updated successfully")
        setTimeout(resetForms, 2000)
      } else {
        setFormError(result.error || "Failed to update password")
      }
    } catch {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)
    try {
      const result = await deleteAccount(formCurrentPassword)
      if (result.success) void navigate("/login")
      else setFormError(result.error || "Failed to delete account")
    } catch {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddPasskey() {
    setFormError(null)
    setFormSuccess(null)
    setNewPasskeyName('')
    setShowAddPasskeyModal(true)
  }

  async function submitAddPasskey() {
    setFormError(null)
    setFormSuccess(null)
    setIsSubmitting(true)
    try {
      if (!newPasskeyName) { setFormError('Please provide a name'); return }
      const result = await registerPasskey(newPasskeyName)
      if (result.success) {
        setFormSuccess('Passkey added successfully')
        setPasskeys(await listPasskeys())
        setShowAddPasskeyModal(false)
      } else {
        setFormError(result.error || 'Failed to add passkey')
      }
    } catch (error: any) {
      setFormError(error.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleEnable2FA() {
    setFormError(null)
    setFormSuccess(null)
    setIsSubmitting(true)
    try {
      const res = await setupTwoFactor()
      if ('error' in res) setFormError(res.error)
      else { setTwoFASecret(res.secret); setTwoFAQr(res.qrCodeUrl); setFormSuccess('Scanned QR? Enter the code to confirm.') }
    } catch (e: any) { setFormError(e.message || 'Failed to start 2FA setup') }
    finally { setIsSubmitting(false) }
  }

  async function handleVerify2FA() {
    setFormError(null)
    setFormSuccess(null)
    setIsSubmitting(true)
    try {
      if (!twoFASecret) { setFormError('No 2FA setup in progress'); return }
      const res = await verifyTwoFactor(verifyInput.trim())
      if (res.success) {
        setTwoFAEnabled(true); setTwoFASecret(null); setTwoFAQr(null); setFormSuccess('2FA enabled')
        if (res.codes) setBackupCodes(res.codes)
      } else { setFormError(res.error || 'Failed to verify 2FA') }
    } catch (e: any) { setFormError(e.message || 'Verification failed') }
    finally { setIsSubmitting(false) }
  }

  async function handleDisable2FA() {
    setDisablePwd(''); setFormError(null); setFormSuccess(null); setShowDisableModal(true)
  }

  async function submitDisable2FA() {
    if (!disablePwd) return setFormError('Enter your current password')
    setFormError(null); setFormSuccess(null); setIsSubmitting(true)
    try {
      const res = await disableTwoFactor(disablePwd)
      if (res.success) { setTwoFAEnabled(false); setFormSuccess('2FA disabled'); setShowDisableModal(false) }
      else { setFormError(res.error || 'Failed to disable 2FA') }
    } catch (e: any) { setFormError(e.message || 'Failed to disable 2FA') }
    finally { setIsSubmitting(false) }
  }

  async function handleDeletePasskey(id: string) { setShowDeletePasskeyId(id) }

  async function submitDeletePasskey() {
    if (!showDeletePasskeyId) return
    try {
      await deletePasskey(showDeletePasskeyId)
      setPasskeys(await listPasskeys())
      setShowDeletePasskeyId(null)
    } catch (error) { console.error("Failed to delete passkey:", error) }
  }

  const joinDate = createdAt 
    ? new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Recently"

  const passChangedDate = user.passwordChangedAt
    ? new Date(user.passwordChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Recently"

  const initial = (user.name || user.email || "?").charAt(0).toUpperCase()

  const sectionAnimation = (index: number) =>
    `animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out [animation-fill-mode:backwards] [animation-delay:${index * 80}ms]`

  const statsDisplay = [
    { label: "Member since", value: joinDate },
    { label: "Account ID", value: user.id.slice(0, 10) + "…", mono: true },
    { label: "Connected apps", value: String(stats.connectedApps) },
  ]

  const profileRows = [
    { label: "Full name", value: user.name },
    { label: "Email", value: user.email },
    { label: "ID", value: user.id, mono: true },
    { label: "Joined", value: createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently" },
  ]

  return (
    <div className="min-h-svh">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <VoidLogo />
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/admin")}>
                Admin
              </Button>
            )}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <Avatar className="size-7">
                  <AvatarImage src={avatarUrl} alt={user.name} />
                  <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                </Avatar>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {user.email}
                </span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={closeMenu}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 z-30 rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs font-medium truncate">{user.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveName}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left transition-colors cursor-pointer"
                    >
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); handleLogout() }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 text-left transition-colors cursor-pointer"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl space-y-10 px-6 py-10">
        {pageLoading ? (
          <>
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
                  <Skeleton className="size-14 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-52" />
              </div>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <Skeleton className="size-4" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-52" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          </>
        ) : (
        <>
        {/* Hero */}
        <div className={sectionAnimation(0)}>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hey, {user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your Void account and connected applications.
          </p>
        </div>

        {/* Stats */}
        <div className={"grid grid-cols-3 gap-3 " + sectionAnimation(1)}>
          {statsDisplay.map((s) => (
            <div key={s.label} className="space-y-1.5 rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-sm font-medium", s.mono && "font-mono text-xs")}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Profile */}
        <section className={"space-y-3 " + sectionAnimation(2)}>
          <div>
            <h2 className="text-sm font-semibold">Profile</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Your account information</p>
          </div>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Avatar row */}
            <div className="flex items-center gap-4 px-4 py-4 border-b border-border">
              <div
                className="relative shrink-0"
                onDragOver={handleDragOver(setAvatarDragOver)}
                onDragLeave={handleDragLeave(setAvatarDragOver)}
                onDrop={handleDrop(setAvatarDragOver)}
              >
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className={`group relative size-14 rounded-full transition-all duration-200 ${avatarDragOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110' : ''}`}
                  title="Change avatar"
                >
                  <Avatar className="size-14">
                    <AvatarImage src={avatarUrl} alt={user.name} />
                    <AvatarFallback className="text-lg">{initial}</AvatarFallback>
                  </Avatar>
                  <div className={`absolute inset-0 flex items-center justify-center rounded-full transition-opacity duration-200 ${avatarDragOver ? 'bg-primary/80 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}>
                    <span className="text-[10px] text-white font-medium">{avatarDragOver ? 'Drop here' : 'Edit'}</span>
                  </div>
                </button>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            {/* Read-only rows */}
            <div className="divide-y divide-border">
              {profileRows.map(({ label, value, mono }) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
                  <span className={cn("text-sm", mono && "font-mono text-xs text-muted-foreground")}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Account Settings links */}
        <section className={"space-y-3 " + sectionAnimation(3)}>
          <div>
            <h2 className="text-sm font-semibold">Account Settings</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage recovery and notification preferences</p>
          </div>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            <Link
              to="/settings/recovery"
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Recovery Contacts</p>
                <p className="text-xs text-muted-foreground">Add trusted contacts to recover your account</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted-foreground shrink-0"><path d="m9 18 6-6-6-6"/></svg>
            </Link>
            <Link
              to="/settings/notifications"
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Notification Preferences</p>
                <p className="text-xs text-muted-foreground">Choose which emails you receive</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-muted-foreground shrink-0"><path d="m9 18 6-6-6-6"/></svg>
            </Link>
          </div>
        </section>

        {/* Security */}
        <section className={"space-y-3 " + sectionAnimation(4)}>
          <div>
            <h2 className="text-sm font-semibold">Security</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage your account credentials and security</p>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: !isChangingPassword && !isDeletingAccount ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Password</p>
                      <p className="text-xs text-muted-foreground">Last changed: {passChangedDate}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setIsChangingPassword(true)}>Change</Button>
                  </div>

                  <Link to="/settings/sessions" className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Active Sessions</p>
                      <p className="text-xs text-muted-foreground">{stats.activeSessions} active session{stats.activeSessions !== 1 ? "s" : ""}</p>
                    </div>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 text-muted-foreground"><path d="M7 4l6 6-6 6" /></svg>
                  </Link>

                  <div className="px-4 py-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium">Two-factor authentication</p>
                      <Button size="sm" variant="outline" onClick={() => setShowSecurityMenu(v => !v)}>{showSecurityMenu ? 'Close' : 'Manage'}</Button>
                    </div>

                    <div
                      className="grid transition-all duration-300 ease-out"
                      style={{ gridTemplateRows: showSecurityMenu ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-3 pt-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">TOTP 2FA</p>
                              <p className="text-xs text-muted-foreground">Time-based MFA using an authenticator app</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!twoFAEnabled ? (
                                <>
                                  <Button size="sm" variant="outline" onClick={handleEnable2FA} disabled={isSubmitting}>Start setup</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setVerifyInput('')}>Enter code</Button>
                                </>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <Button size="xs" variant="outline" onClick={handleViewBackupCodes} disabled={isSubmitting}>Codes</Button>
                                  <Button size="xs" variant="outline" onClick={handleRegenerateBackupCodes} disabled={isSubmitting}>Regenerate</Button>
                                  <Button size="xs" variant="ghost" onClick={handleDisable2FA} disabled={isSubmitting}>Disable</Button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div
                            className="grid transition-all duration-300 ease-out"
                            style={{ gridTemplateRows: twoFASecret && twoFAQr ? '1fr' : '0fr' }}
                          >
                            <div className="overflow-hidden">
                              <div className="flex items-start gap-3">
                                <img src={twoFAQr || ''} alt="2FA QR" className="w-28 h-28 rounded-md border" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Scan this QR in your authenticator app, or enter the secret below.</p>
                                  <div className="mt-2 rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs">{twoFASecret}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div
                            className="grid transition-all duration-300 ease-out"
                            style={{ gridTemplateRows: !twoFAEnabled && showSecurityMenu ? '1fr' : '0fr' }}
                          >
                            <div className="overflow-hidden">
                              <div className="flex items-center gap-2">
                                <Input placeholder="Enter 6-digit code" value={verifyInput} onChange={(e) => setVerifyInput(e.target.value)} />
                                <Button size="sm" onClick={async () => {
                                  setFormError(null); setFormSuccess(null); setIsSubmitting(true);
                                  try {
                                    const res = await verifyTwoFactor(verifyInput.trim());
                                    if (res.success) { setTwoFAEnabled(true); setTwoFASecret(null); setTwoFAQr(null); setFormSuccess('2FA enabled'); if (res.codes) setBackupCodes(res.codes) }
                                    else { setFormError(res.error || 'Invalid code') }
                                  } catch (err: any) { setFormError(err.message || 'Verification failed') }
                                  finally { setIsSubmitting(false) }
                                }}>Verify</Button>
                              </div>
                            </div>
                          </div>

                          <div
                            className="grid transition-all duration-300 ease-out"
                            style={{ gridTemplateRows: backupCodes.length > 0 ? '1fr' : '0fr' }}
                          >
                            <div className="overflow-hidden">
                              <div>
                                <p className="text-xs font-medium">New backup codes (store these safely)</p>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                                  {backupCodes.map(c => <div key={c} className="rounded border border-border p-2 bg-background animate-in fade-in slide-in-from-bottom-1 duration-300">{c}</div>)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div
                            className="grid transition-all duration-300 ease-out"
                            style={{ gridTemplateRows: showExistingBackupCodes && existingBackupCodes.length > 0 ? '1fr' : '0fr' }}
                          >
                            <div className="overflow-hidden">
                              <div>
                                <p className="text-xs font-medium">Your backup codes</p>
                                <div className="mt-2 space-y-1 text-xs">
                                  {existingBackupCodes.map(c => (
                                    <div key={c.id} className={`flex items-center justify-between rounded border border-border px-3 py-1.5 font-mono ${c.used ? 'text-muted-foreground/40 line-through' : ''}`}>
                                      <span>{c.id}</span>
                                      <span className={`text-[10px] ${c.used ? 'text-destructive/60' : 'text-green-600'}`}>{c.used ? 'Used' : 'Active'}</span>
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-2 text-[10px] text-muted-foreground">{existingBackupCodes.filter(c => !c.used).length} unused / {existingBackupCodes.length} total</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">Passkeys</p>
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleAddPasskey} disabled={isSubmitting}>
                          {isSubmitting ? "Working..." : "Add Passkey"}
                        </Button>
                      </div>
                      {passkeys.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No passkeys added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {passkeys.map((pk, i) => (
                            <div key={pk.id} className="flex items-center justify-between bg-background rounded-lg border border-border px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}>
                              <div className="space-y-0.5">
                                <p className="text-xs font-medium">{pk.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{pk.device_type}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-muted-foreground">{pk.last_used_at ? `Used ${new Date(pk.last_used_at).toLocaleDateString()}` : "Never used"}</span>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePasskey(pk.id)}>✕</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {formError && !isChangingPassword && !isDeletingAccount && <p className="mt-2 text-[10px] text-destructive font-medium">{formError}</p>}
                    {formSuccess && !isChangingPassword && !isDeletingAccount && <p className="mt-2 text-[10px] text-green-600 font-medium">{formSuccess}</p>}
                  </div>

                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-destructive">Delete account</p>
                      <p className="text-xs text-muted-foreground">Permanently remove your account and data</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-destructive hover:bg-destructive/10" onClick={() => setIsDeletingAccount(true)}>Delete</Button>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isChangingPassword || isDeletingAccount ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="p-4 space-y-4">
                  {formError && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{formError}</div>}
                  {formSuccess && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{formSuccess}</div>}

                  {isChangingPassword && (
                    <form onSubmit={handleUpdatePassword} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">Current password</Label>
                        <Input id="current-password" type="password" placeholder="••••••••" value={formCurrentPassword} onChange={(e) => setFormCurrentPassword(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New password</Label>
                        <Input id="new-password" type="password" placeholder="••••••••" value={formNewPassword} onChange={(e) => setFormNewPassword(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm new password</Label>
                        <Input id="confirm-password" type="password" placeholder="••••••••" value={formConfirmPassword} onChange={(e) => setFormConfirmPassword(e.target.value)} required />
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? "Updating..." : "Update password"}</Button>
                        <Button variant="ghost" size="sm" onClick={resetForms} disabled={isSubmitting}>Cancel</Button>
                      </div>
                    </form>
                  )}

                  {isDeletingAccount && (
                    <form onSubmit={handleDeleteAccount} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="rounded-lg bg-destructive/10 p-3">
                        <p className="text-xs font-medium text-destructive">Warning: This action is permanent and cannot be undone. All your data, including connected apps, will be deleted.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="delete-confirm-password">Enter password to confirm</Label>
                        <Input id="delete-confirm-password" type="password" placeholder="••••••••" value={formCurrentPassword} onChange={(e) => setFormCurrentPassword(e.target.value)} required />
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button type="submit" variant="destructive" size="sm" disabled={isSubmitting}>{isSubmitting ? "Deleting..." : "Permanently delete account"}</Button>
                        <Button variant="ghost" size="sm" onClick={resetForms} disabled={isSubmitting}>Cancel</Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connected Apps */}
        <section className={"space-y-3 " + sectionAnimation(5)}>
          <div>
            <h2 className="text-sm font-semibold">Connected applications</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Apps with access to your account</p>
          </div>
          {apps.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No connected applications yet.</p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link to={DEMO_OAUTH_URL}>Try the OAuth demo</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {apps.map((app) => (
                <div key={app.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {app.logoUrl ? (
                      <img src={app.logoUrl} alt={app.name} className="size-8 rounded-lg object-cover border border-border shrink-0" />
                    ) : (
                      <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground border border-border shrink-0">
                        {app.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                      <div className="flex flex-wrap gap-1">{app.scopes.map((s) => (<Badge key={s} variant="secondary">{s}</Badge>))}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-4">
                    <span className="hidden text-xs text-muted-foreground sm:block">{new Date(app.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => handleRevoke(app.id)}>Revoke</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Storage */}
        {storage && (
        <section className={"space-y-3 " + sectionAnimation(7)}>
            <div>
              <h2 className="text-sm font-semibold">Storage</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Your personal storage quota</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{((storage.used ?? 0) / 1048576).toFixed(1)} MB / {((storage.quota ?? 104857600) / 1048576).toFixed(0)} MB</span>
                <span className="text-xs text-muted-foreground">{storage.files} file{storage.files !== 1 ? 's' : ''}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, ((storage.used ?? 0) / (storage.quota ?? 104857600)) * 100)}%` }}
                />
              </div>
              {storageFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowStorage(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showStorage ? 'Hide files' : `View ${storageFiles.length} file${storageFiles.length !== 1 ? 's' : ''}`}
                </button>
              )}
              <div
                className="grid transition-all duration-300 ease-out"
                style={{ gridTemplateRows: showStorage ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 pt-2">
                    {storageFiles.map(f => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground font-mono shrink-0">
                            {f.mimeType.startsWith('image/') ? '🖼' : f.mimeType.startsWith('text/') ? '📄' : '📎'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{f.originalName}</p>
                            <p className="text-[10px] text-muted-foreground">{(f.sizeBytes / 1024).toFixed(1)} KB</p>
                            {f.clientName && <p className="text-[10px] text-muted-foreground/60">{f.clientName}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {f.mimeType.startsWith('image/') && (
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-foreground">View</a>
                          )}
                          <button
                            type="button"
                            className="text-[10px] text-destructive hover:text-destructive/80"
                            onClick={async () => {
                              const ok = await deleteStorageFile(f.id)
                              if (ok) {
                                setStorageFiles(prev => prev.filter(x => x.id !== f.id))
                                const u = await getStorageUsage()
                                setStorage(u)
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* App Data */}
              {appDataItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAppData(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAppData ? 'Hide app data' : `View ${appDataItems.length} app data entr${appDataItems.length !== 1 ? 'ies' : 'y'}`}
                </button>
              )}
              <div
                className="grid transition-all duration-300 ease-out"
                style={{ gridTemplateRows: showAppData && appDataItems.length > 0 ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 pt-2">
                    {appDataItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground font-mono shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{item.clientName || item.clientId}: <span className="font-mono">{item.key}</span></p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.valueSize < 1024 ? `${item.valueSize} B` : `${(item.valueSize / 1024).toFixed(1)} KB`}
                              {item.updatedAt && ` · ${new Date(item.updatedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-[10px] text-destructive hover:text-destructive/80 shrink-0 ml-2"
                          onClick={async () => {
                            if (!item.clientId) return
                            const ok = await deleteStorageAppData(item.clientId, item.key)
                            if (ok) {
                              setAppDataItems(prev => prev.filter(x => x.id !== item.id))
                              const u = await getStorageUsage()
                              setStorage(u)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Developer / Integration */}
        <section className={"space-y-3 " + sectionAnimation(6)}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Developer</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Your OAuth applications and integration guide</p>
            </div>
            <div className="flex items-center gap-2">
              {devApps.length > 0 && (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/playground">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                    </svg>
                    Playground
                  </Link>
                </Button>
              )}
              <Button size="sm" onClick={() => { setCreateName(""); setCreateDesc(""); setCreateUris(""); setCreateScopes(["profile", "email"]); setCreateError(null); setShowCreateApp(true) }}>Create App</Button>
            </div>
          </div>

          {devApps.length > 0 && (
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {devApps.map((app) => (
                <div key={app.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {app.logoUrl ? (
                        <img src={app.logoUrl} alt={app.name} className="size-8 rounded-lg object-cover border border-border" />
                      ) : (
                        <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground border border-border">
                          {app.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{app.name}</p>
                          <Badge variant={statusBadge[app.verificationStatus] || 'outline'}>{app.verificationStatus}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{app.clientId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="xs" onClick={() => openEditApp(app.id)}>Edit</Button>
                      <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setShowDeleteDevApp(app.id)}>Delete</Button>
                    </div>
                  </div>
                  {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Scopes: {app.allowedScopes.join(", ") || "none"}</span>
                    <span>·</span>
                    <span>{app.redirectUris.length} redirect URI(s)</span>
                    <span>·</span>
                    <span>Created {new Date(app.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modals */}
          {showDeletePasskeyId && (
            <Dialog open={!!showDeletePasskeyId} onOpenChange={(v: boolean) => { if (!v) setShowDeletePasskeyId(null) }} title="Delete passkey" description="Are you sure you want to delete this passkey? This action cannot be undone.">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowDeletePasskeyId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={submitDeletePasskey}>Delete</Button>
              </div>
            </Dialog>
          )}

          {showDisableModal && (
            <Dialog open={showDisableModal} onOpenChange={(v: boolean) => { if (!v) setShowDisableModal(false) }} title="Disable Two-factor authentication" description="Enter your current password to disable 2FA.">
              <div>
                <Label htmlFor="disable-pwd">Current password</Label>
                <Input id="disable-pwd" type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} />
                {formError && <div className="mt-2 text-xs text-destructive">{formError}</div>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setShowDisableModal(false); setDisablePwd(''); setFormError(null) }}>Cancel</Button>
                  <Button variant="destructive" onClick={submitDisable2FA} disabled={isSubmitting}>{isSubmitting ? 'Working…' : 'Disable 2FA'}</Button>
                </div>
              </div>
            </Dialog>
          )}

          {showAddPasskeyModal && (
            <Dialog open={showAddPasskeyModal} onOpenChange={(v: boolean) => { if (!v) setShowAddPasskeyModal(false) }} title="Add a new passkey" description="Give this passkey a name so you can identify the device later.">
              <div>
                <Label htmlFor="passkey-name">Name</Label>
                <Input id="passkey-name" value={newPasskeyName} onChange={(e) => setNewPasskeyName(e.target.value)} placeholder="My iPhone" />
                {formError && <div className="mt-2 text-xs text-destructive">{formError}</div>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setShowAddPasskeyModal(false); setNewPasskeyName(''); setFormError(null) }}>Cancel</Button>
                  <Button onClick={submitAddPasskey} disabled={isSubmitting}>{isSubmitting ? 'Adding…' : 'Add passkey'}</Button>
                </div>
              </div>
            </Dialog>
          )}

          {showEditProfile && (
            <Dialog open={showEditProfile} onOpenChange={(v: boolean) => { if (!v) { setShowEditProfile(false); setEditPwd("") } }} title="Edit Profile" description="Update your name, email, or avatar.">
              <form onSubmit={handleEditProfile} className="space-y-4">
                {editError && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{editError}</div>}
                {editSuccess && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{editSuccess}</div>}
                <div className="flex items-center gap-3">
                  <div
                    className="relative shrink-0"
                    onDragOver={handleDragOver(setEditAvatarDragOver)}
                    onDragLeave={handleDragLeave(setEditAvatarDragOver)}
                    onDrop={handleDrop(setEditAvatarDragOver)}
                  >
                    <button type="button" onClick={() => fileInputRef.current?.click()} className={`group relative size-12 rounded-full transition-all duration-200 ${editAvatarDragOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : ''}`}>
                      <Avatar className="size-12">
                        <AvatarImage src={avatarUrl} alt={user.name} />
                        <AvatarFallback>{initial}</AvatarFallback>
                      </Avatar>
                      <div className={`absolute inset-0 flex items-center justify-center rounded-full transition-opacity duration-200 ${editAvatarDragOver ? 'bg-primary/80 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}>
                        <span className="text-[9px] text-white font-medium">{editAvatarDragOver ? 'Drop here' : 'Edit'}</span>
                      </div>
                    </button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
                  <div>
                    <p className="text-xs font-medium">{user.name}</p>
                    <p className="text-[10px] text-muted-foreground">Click to change photo</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </div>
                {editEmail !== user.email && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-pwd">Current password (required to change email)</Label>
                    <Input id="edit-pwd" type="password" value={editPwd} onChange={(e) => setEditPwd(e.target.value)} placeholder="••••••••" required />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" type="button" onClick={() => { setShowEditProfile(false); setEditPwd("") }}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
                </div>
              </form>
            </Dialog>
          )}

          {showDeleteDevApp && (
            <Dialog open={!!showDeleteDevApp} onOpenChange={(v: boolean) => { if (!v) setShowDeleteDevApp(null) }} title="Delete app" description="Are you sure? This cannot be undone.">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowDeleteDevApp(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => handleDeleteDevApp(showDeleteDevApp)}>Delete</Button>
              </div>
            </Dialog>
          )}

          {devApps.length > 0 && devApps.map((app) => (
            <div key={app.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setShowIntegration(v => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{app.name}</span>
                  <span>Playground</span>
                </div>
                <svg
                  className={`size-3 transition-transform duration-200 ${showIntegration ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </button>
              <div
                className="grid transition-all duration-300 ease-out"
                style={{ gridTemplateRows: showIntegration ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-4">
                    <DeveloperPlayground app={app} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Create App dialog */}
        {showCreateApp && (
          <Dialog open={showCreateApp} onOpenChange={(v: boolean) => { if (!v) setShowCreateApp(false) }} title="Create Application" description="Register a new OAuth application.">
            <form onSubmit={handleCreateApp} className="space-y-4">
              {createError && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{createError}</div>}
              <div className="space-y-2">
                <Label htmlFor="create-name">Application Name</Label>
                <Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My App" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-desc">Description</Label>
                <Textarea id="create-desc" value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="What does your app do?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-uris">Redirect URIs (one per line)</Label>
                <Textarea id="create-uris" value={createUris} onChange={(e) => setCreateUris(e.target.value)} placeholder="http://localhost:3000/auth/callback" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Scopes</Label>
                <p className="text-xs text-muted-foreground">Select the permissions your app needs.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {AVAILABLE_SCOPES.map((s) => (
                    <button key={s} type="button" onClick={() => toggleCreateScope(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${createScopes.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-foreground"}`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" type="button" onClick={() => setShowCreateApp(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Application"}</Button>
              </div>
            </form>
          </Dialog>
        )}

        {/* Edit App dialog */}
        {editAppId && editApp && (
          <Dialog open={!!editAppId} onOpenChange={(v: boolean) => { if (!v) { setEditAppId(null); setEditApp(null); setNewSecret(null) } }} title={`Edit ${editApp.name}`} description={editApp.clientId} className="max-w-lg">
            <div className="space-y-5">
              {/* Credentials */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Credentials</h3>
                <div className="rounded-xl border border-border divide-y divide-border">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs text-muted-foreground">Client ID</span>
                    <span className="text-xs font-mono ml-4 truncate">{editApp.clientId}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs text-muted-foreground">Client Secret</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">••••••••••••••••••••••••••••</span>
                      <button type="button" onClick={handleRegenerateSecret} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0">Regenerate</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs text-muted-foreground">Verification</span>
                    <Badge variant={statusBadge[editApp.verificationStatus] || 'outline'} className="text-[10px] px-2 py-0">{editApp.verificationStatus}</Badge>
                  </div>
                </div>
                <div className="mt-3">
                  <Button
                    size="xs"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const firstUri = editApp.redirectUris[0]
                      const firstScope = editApp.allowedScopes.length > 0 ? editApp.allowedScopes.join(' ') : 'profile'
                      const previewUrl = `/oauth?client_id=${encodeURIComponent(editApp.clientId)}&redirect_uri=${encodeURIComponent(firstUri || 'http://localhost:5173')}&scope=${encodeURIComponent(firstScope)}&state=preview`
                      window.open(previewUrl, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    Preview consent
                  </Button>
                </div>
              </div>

              {newSecret && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-amber-600">New secret generated</p>
                    <p className="mt-0.5 font-mono text-[11px] break-all">{newSecret}</p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => { navigator.clipboard.writeText(newSecret); setNewSecret(null) }} className="shrink-0">Copy</Button>
                </div>
              )}

              {/* Logo */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Icon</h3>
                <div className="flex items-center gap-4">
                  {editApp.logoUrl ? (
                    <img src={editApp.logoUrl} alt={editApp.name} className="size-12 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="size-12 rounded-xl bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground border border-border">
                      {editApp.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="space-y-1">
                    <Button size="xs" variant="outline" onClick={() => document.getElementById('app-logo-input')?.click()}>
                      {editApp.logoUrl ? 'Change icon' : 'Upload icon'}
                    </Button>
                    {editApp.logoUrl && (
                      <Button size="xs" variant="ghost" className="text-destructive ml-2" onClick={async () => {
                        const result = await updateDeveloperApp(editAppId!, { logo_url: null });
                        if (result.success) {
                          setEditApp({ ...editApp, logoUrl: null });
                          setDevApps(await getDeveloperApps());
                        }
                      }}>Remove</Button>
                    )}
                    <p className="text-[10px] text-muted-foreground">JPEG, PNG, GIF, WebP.</p>
                  </div>
                  <input
                    id="app-logo-input"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const result = await uploadAppLogo(editAppId!, file);
                      if ('logoUrl' in result) {
                        setEditApp({ ...editApp, logoUrl: result.logoUrl });
                        setDevApps(await getDeveloperApps());
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <Separator />

              {/* Settings */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Settings</h3>
                <form onSubmit={handleEditApp} className="space-y-4">
                  {appEditError && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{appEditError}</div>}
                  {appEditSuccess && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{appEditSuccess}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input id="edit-name" value={appEditName} onChange={(e) => setAppEditName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-desc">Description</Label>
                    <Textarea id="edit-desc" value={appEditDesc} onChange={(e) => setAppEditDesc(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-uris">Redirect URIs (one per line)</Label>
                    <Textarea id="edit-uris" value={appEditUris} onChange={(e) => setAppEditUris(e.target.value)} rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {AVAILABLE_SCOPES.map((s) => (
                        <button key={s} type="button" onClick={() => toggleEditScope(s)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${appEditScopes.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-foreground"}`}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" type="button" onClick={() => { setEditAppId(null); setEditApp(null); setNewSecret(null) }}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
                  </div>
                </form>
              </div>
            </div>
          </Dialog>
        )}

        <Separator className={sectionAnimation(8)} />

        <div className={"flex items-center justify-between pb-6 " + sectionAnimation(8)}>
          <span className="text-xs text-muted-foreground">
            VoidAuth · Secure by default ·{" "}
            <a
              href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=voidauth`}
              className="underline"
            >
              Feedback
            </a>
          </span>
        </div>
        </>}
      </main>
    </div>
  )
}
