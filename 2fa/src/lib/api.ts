const API_URL = ""
const CLIENT_ID = import.meta.env.VITE_VOIDAUTH_CLIENT_ID || "authiov"
const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

export async function getAuthorizationURL(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`)
  const { authUrl } = await res.json()
  return authUrl
}

export async function exchangeCode(code: string, state: string, keepMeLoggedIn?: boolean) {
  const res = await fetch(`${API_URL}/api/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code, state, keepMeLoggedIn }),
  })
  const data = await res.json()
  if (!res.ok) throw { status: res.status, ...data }
  return data.user
}

async function authRequest<T>(endpoint: string, options: RequestInit = {}, retry = true): Promise<T> {
  const url = `${API_URL}${endpoint}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }

  const res = await fetch(url, { ...options, headers, credentials: "include" })
  if (!res.ok && res.status === 401 && retry) {
    const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    if (refreshRes.ok) return authRequest<T>(endpoint, options, false)
  }
  const data = await res.json()
  if (!res.ok) throw { status: res.status, ...data }
  return data as T
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    return res.ok
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  })
}

export async function getAuthUser(): Promise<{ id: string; name: string; email: string } | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.user || null
  } catch {
    return null
  }
}

export async function getStorageUsage() {
  return authRequest<{ used: number; quota: number; files: number }>("/api/storage/usage")
}

export async function getAppData(key: string): Promise<{ key: string; value: any; createdAt: string; updatedAt: string } | null> {
  try {
    return await authRequest(`/api/storage/data?client_id=${CLIENT_ID}&key=${encodeURIComponent(key)}`)
  } catch (e: any) {
    if (e?.status === 404) return null
    throw e
  }
}

export async function saveAppData(key: string, value: any) {
  return authRequest("/api/storage/data", {
    method: "POST",
    body: JSON.stringify({ client_id: CLIENT_ID, key, value }),
  })
}

export { CLIENT_ID, APP_URL }
