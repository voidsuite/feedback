// Production auth implementation using real backend API
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { apiClient, storeUser, getStoredUser, clearAuth, getDeviceId, getDeviceName } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  avatarUrl?: string;
  createdAt?: string;
  passwordChangedAt?: string;
  lastLoginAt?: string;
  twoFactorEnabled?: boolean;
}

export interface Passkey {
  id: string;
  name: string;
  device_type: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ConnectedApp {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  logoUrl?: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string;
}

export interface UserProfile {
  user: User;
  stats: {
    connectedApps: number;
    activeSessions: number;
  };
}

export interface OAuthClient {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  verification_status?: string;
  app_theme?: Record<string, any> | null;
}

export interface OAuthAuthorizeResponse {
  client: OAuthClient;
  requestedScopes: string[];
  alreadyAuthorized: boolean;
  existingScopes: string[];
}

export interface OAuthConsentResponse {
  redirectUrl: string;
  code: string;
}

export interface DeveloperApp {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
  description: string;
  logoUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  verificationStatus: string;
  isActive: boolean;
  appTheme: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  two_factor_enabled: boolean;
}

export interface AdminApp {
  id: string;
  client_id: string;
  name: string;
  description: string;
  redirect_uris: string;
  allowed_scopes: string;
  verification_status: string;
  is_active: boolean;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
}

export const SCOPE_LABELS: Record<string, string> = {
  openid: 'Sign in with Void (OIDC)',
  profile: 'View your name and profile',
  email: 'View your email address',
  read: 'Read your account data',
  write: 'Modify your account data',
};

// Get current user from stored data
export function getCurrentUser(): User | null {
  return getStoredUser();
}

// Register new user
export async function register(
  name: string,
  email: string,
  password: string
): Promise<{ user: User } | { error: string }> {
  try {
    const response = await apiClient.post<{
      user: User;
    }>('/auth/register', { name, email, password, device_id: getDeviceId(), device_name: getDeviceName() });

    // Store user display data (session cookie is set by server)
    storeUser(response.user);

    return { user: response.user };
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Registration failed:', error);
    return { error: error.error || 'Registration failed. Please try again.' };
  }
}

// Login user
export async function login(
  email: string,
  password: string,
  keepMeLoggedIn?: boolean
): Promise<{ user: User } | { error: string } | { mfaRequired: true; mfaToken: string }> {
  try {
    const response = await apiClient.post<any>('/auth/login', { email, password, keepMeLoggedIn, device_id: getDeviceId(), device_name: getDeviceName() });

    // If server requires MFA step, return token for client to complete second phase
    if (response && response.mfaRequired) {
      return { mfaRequired: true, mfaToken: response.mfaToken };
    }

    // Store user display data (session cookie is set by server)
    storeUser(response.user);

    return { user: response.user };
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Login failed:', error);
    return { error: error.error || 'Login failed. Please check your credentials.' };
  }
}

export async function loginWithMFA(mfaToken: string, code: string, keepMeLoggedIn?: boolean): Promise<{ user: User } | { error: string }> {
  try {
    const response = await apiClient.post('/auth/login/2fa', { mfa_token: mfaToken, code, keepMeLoggedIn, device_id: getDeviceId(), device_name: getDeviceName() });

    // Store user display data (session cookie is set by server)
    storeUser(response.user);

    return { user: response.user };
  } catch (error: any) {
    console.error('MFA login failed, attempting backup code fallback:', error);
    // If TOTP verification failed, try redeeming as a backup code
    try {
      const backupRes = await apiClient.post('/auth/login/2fa/backup', { mfa_token: mfaToken, code, keepMeLoggedIn, device_id: getDeviceId(), device_name: getDeviceName() });
      storeUser(backupRes.user);
      return { user: backupRes.user };
    } catch (err2: any) {
      console.error('Backup code fallback failed:', err2);
      return { error: error.error || err2.error || 'MFA verification failed' };
    }
  }
}

// Logout user
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch (error) {
    console.error('Logout request failed:', error);
  } finally {
    // Clear local user data
    clearAuth();
  }
}

// Get user profile with stats
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    return await apiClient.get<UserProfile>('/users/profile');
  } catch (error) {
    console.error('Failed to get user profile:', error);
    return null;
  }
}

// Get connected OAuth apps
export async function getConnectedApps(): Promise<ConnectedApp[]> {
  try {
    const response = await apiClient.get<{ apps: ConnectedApp[] }>('/users/apps');
    return response.apps;
  } catch (error) {
    console.error('Failed to get connected apps:', error);
    return [];
  }
}

// Revoke app access
export async function revokeApp(appId: string): Promise<boolean> {
  try {
    await apiClient.delete(`/users/apps/${appId}`);
    return true;
  } catch (error) {
    console.error('Failed to revoke app:', error);
    return false;
  }
}

// OAuth: Get authorization info
export async function getOAuthAuthorization(
  clientId: string,
  redirectUri: string,
  responseType: string,
  scope?: string,
  state?: string,
  nonce?: string
): Promise<OAuthAuthorizeResponse | { error: string }> {
  try {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType,
    });

    if (scope) params.set('scope', scope);
    if (state) params.set('state', state);
    if (nonce) params.set('nonce', nonce);

    return await apiClient.get<OAuthAuthorizeResponse>(`/oauth/authorize?${params}&_api=1`);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('OAuth authorization failed:', error);
    return { error: error.error || 'Failed to authorize application.' };
  }
}

// OAuth: Process user consent
export async function processOAuthConsent(
  clientId: string,
  redirectUri: string,
  scope: string,
  consent: boolean,
  state?: string,
  nonce?: string
): Promise<OAuthConsentResponse | { error: string }> {
  try {
    return await apiClient.post<OAuthConsentResponse>('/oauth/authorize', {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      consent,
      state,
      nonce,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('OAuth consent failed:', error);
    return { error: error.error || 'Failed to process consent.' };
  }
}

// Verify user is authenticated
export async function verifyAuth(): Promise<User | null> {
  try {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    const user = response.user;
    storeUser(user);
    return user;
  } catch (error: any) {
    console.error('Auth verification failed:', error);
    if (error?.maintenance) {
      return getCurrentUser();
    }
    clearAuth();
    return null;
  }
}

// Update user profile
export async function updateProfile(data: {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  avatar_url?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.patch('/users/profile', data);
    
    // Refresh user data in storage
    const profile = await getUserProfile();
    if (profile) {
      storeUser(profile.user);
    }
    
    return { success: true };
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Failed to update profile:', error);
    return { success: false, error: error.error || 'Failed to update profile' };
  }
}

// Upload avatar file
export async function uploadAvatar(file: File): Promise<{ avatarUrl: string } | { error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const result = await apiClient.upload<{ avatarUrl: string }>('/users/avatar', formData);
    // Update stored user with new avatar URL immediately
    const currentUser = getStoredUser();
    if (currentUser && 'avatarUrl' in result) {
      storeUser({ ...currentUser, avatarUrl: result.avatarUrl });
    }
    return result;
  } catch (error: any) {
    return { error: error.error || 'Failed to upload avatar' };
  }
}

// Passkey functions
export async function getPasskeyRegistrationOptions(): Promise<any> {
  return apiClient.get('/passkey/register-options');
}

export async function verifyPasskeyRegistration(body: any, name: string): Promise<any> {
  return apiClient.post(`/passkey/register-verify?name=${encodeURIComponent(name)}`, body);
}

export async function getPasskeyLoginOptions(email: string): Promise<any> {
  return apiClient.post('/passkey/login-options', { email });
}

export async function verifyPasskeyLogin(userId: string, email: string, body: any, keepMeLoggedIn?: boolean): Promise<any> {
  return apiClient.post('/passkey/login-verify', { userId, email, body, keepMeLoggedIn, device_id: getDeviceId(), device_name: getDeviceName() });
}

export async function listPasskeys(): Promise<Passkey[]> {
  try {
    const response = await apiClient.get<{ passkeys: Passkey[] }>('/passkey/list');
    return response.passkeys;
  } catch (error) {
    console.error('Failed to list passkeys:', error);
    return [];
  }
}

export async function deletePasskey(id: string): Promise<void> {
  await apiClient.delete(`/passkey/${id}`);
}

export async function registerPasskey(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const options = await getPasskeyRegistrationOptions();
    const attResp = await startRegistration(options);
    await verifyPasskeyRegistration(attResp, name);
    return { success: true };
  } catch (error: any) {
    console.error('Passkey registration failed:', error);
    return { success: false, error: error.error || error.message || 'Passkey registration failed' };
  }
}

export async function loginWithPasskey(email: string, keepMeLoggedIn?: boolean): Promise<{ user: User } | { error: string } | { mfaRequired: true; mfaToken: string }> {
  try {
    const { options, userId } = await getPasskeyLoginOptions(email);
    const asseResp = await startAuthentication(options);
    const response = await verifyPasskeyLogin(userId, email, asseResp, keepMeLoggedIn);

    // If server indicates MFA is required, surface that to the caller
    if (response && (response as any).mfaRequired) {
      return { mfaRequired: true, mfaToken: (response as any).mfaToken };
    }

    if (response.verified) {
      storeUser(response.user);
      return { user: response.user };
    }

    return { error: 'Passkey authentication failed' };
  } catch (error: any) {
    console.error('Passkey login failed:', error);
    return { error: error.error || error.message || 'Passkey login failed' };
  }
}

// Delete user account
export async function deleteAccount(currentPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.delete('/users/profile', { currentPassword });
    clearAuth();
    return { success: true };
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Failed to delete account:', error);
    return { success: false, error: error.error || 'Failed to delete account' };
  }
}

// 2FA functions
export interface TwoFASetupResult {
  secret: string;
  qrCodeUrl: string;
}

export async function setupTwoFactor(): Promise<TwoFASetupResult | { error: string }> {
  try {
    return await apiClient.post<TwoFASetupResult>('/auth/2fa/setup');
  } catch (error: any) {
    console.error('Failed to setup 2FA:', error);
    return { error: error.error || 'Failed to setup 2FA' };
  }
}

export async function verifyTwoFactor(code: string): Promise<{ success: boolean; codes?: string[]; error?: string }> {
  try {
    const res = await apiClient.post<{ success: boolean; codes?: string[] }>('/auth/2fa/verify', { code });
    return { success: !!res.success, codes: res.codes };
  } catch (error: any) {
    console.error('Failed to verify 2FA:', error);
    return { success: false, error: error.error || 'Failed to verify 2FA' };
  }
}

export async function disableTwoFactor(currentPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post('/auth/2fa/disable', { currentPassword });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to disable 2FA:', error);
    return { success: false, error: error.error || 'Failed to disable 2FA' };
  }
}

// 2FA backup codes
export async function generateTwoFABackupCodes(): Promise<{ codes: string[] } | { error: string }> {
  try {
    return await apiClient.post('/auth/2fa/backup/generate');
  } catch (error: any) {
    console.error('Failed to generate 2FA backup codes:', error);
    return { error: error.error || 'Failed to generate backup codes' };
  }
}

export async function listTwoFABackupCodes(): Promise<{ codes: { id: string; used: boolean }[] } | { error: string }> {
  try {
    return await apiClient.get('/auth/2fa/backup');
  } catch (error: any) {
    console.error('Failed to list 2FA backup codes:', error);
    return { error: error.error || 'Failed to list backup codes' };
  }
}

export async function useTwoFABackupCode(id: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await apiClient.post('/auth/2fa/backup/use', { id, code });
  } catch (error: any) {
    console.error('Failed to use 2FA backup code:', error);
    return { success: false, error: error.error || 'Failed to use backup code' };
  }
}

// Developer Apps API
export async function getDeveloperApps(): Promise<DeveloperApp[]> {
  try {
    const res = await apiClient.get<{ apps: DeveloperApp[] }>('/users/apps/manage');
    return res.apps;
  } catch (error) {
    console.error('Failed to get developer apps:', error);
    return [];
  }
}

export async function getDeveloperApp(id: string): Promise<DeveloperApp | null> {
  try {
    return await apiClient.get<DeveloperApp>(`/users/apps/manage/${id}`);
  } catch (error) {
    console.error('Failed to get developer app:', error);
    return null;
  }
}

export async function createDeveloperApp(data: {
  name: string;
  description?: string;
  redirect_uris: string[];
  allowed_scopes?: string[];
}): Promise<DeveloperApp | { error: string }> {
  try {
    return await apiClient.post<DeveloperApp>('/users/apps/manage', data);
  } catch (error: any) {
    return { error: error.error || 'Failed to create app' };
  }
}

export async function updateDeveloperApp(id: string, data: {
  name?: string;
  description?: string;
  logo_url?: string | null;
  redirect_uris?: string[];
  allowed_scopes?: string[];
  app_theme?: Record<string, any> | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.patch(`/users/apps/manage/${id}`, data);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to update app' };
  }
}

export async function deleteDeveloperApp(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.delete(`/users/apps/manage/${id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to delete app' };
  }
}

export async function regenerateAppSecret(id: string): Promise<{ clientSecret: string } | { error: string }> {
  try {
    return await apiClient.post(`/users/apps/manage/${id}/regenerate-secret`);
  } catch (error: any) {
    return { error: error.error || 'Failed to regenerate secret' };
  }
}

// Admin API
export async function getAdminDashboard(): Promise<any> {
  try {
    return await apiClient.get('/admin/dashboard');
  } catch (error) {
    console.error('Failed to get admin dashboard:', error);
    return null;
  }
}

export async function getAdminUsers(page = 1, limit = 20, search = ''): Promise<any> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    return await apiClient.get(`/admin/users?${params}`);
  } catch (error) {
    console.error('Failed to get admin users:', error);
    return null;
  }
}

export async function getAdminUser(id: string): Promise<any> {
  try {
    return await apiClient.get(`/admin/users/${id}`);
  } catch (error) {
    console.error('Failed to get admin user:', error);
    return null;
  }
}

export async function updateAdminUser(id: string, data: any): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.patch(`/admin/users/${id}`, data);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to update user' };
  }
}

export async function deleteAdminUser(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.delete(`/admin/users/${id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to delete user' };
  }
}

export async function getAdminApps(page = 1, limit = 20, search = '', status = ''): Promise<any> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return await apiClient.get(`/admin/apps?${params}`);
  } catch (error) {
    console.error('Failed to get admin apps:', error);
    return null;
  }
}

export async function getAdminApp(id: string): Promise<any> {
  try {
    return await apiClient.get(`/admin/apps/${id}`);
  } catch (error) {
    console.error('Failed to get admin app:', error);
    return null;
  }
}

export async function updateAdminApp(id: string, data: any): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.patch(`/admin/apps/${id}`, data);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to update app' };
  }
}

export async function deleteAdminApp(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.delete(`/admin/apps/${id}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to delete app' };
  }
}

// Admin: Force password reset
export async function forceResetPassword(id: string): Promise<{ tempPassword: string } | { error: string }> {
  try {
    return await apiClient.post(`/admin/users/${id}/force-reset-password`);
  } catch (error: any) {
    return { error: error.error || 'Failed to reset password' };
  }
}

// Admin: Get user sessions
export async function getAdminUserSessions(id: string): Promise<any[]> {
  try {
    const res = await apiClient.get<{ sessions: any[] }>(`/admin/users/${id}/sessions`);
    return res.sessions;
  } catch (error) {
    console.error('Failed to get user sessions:', error);
    return [];
  }
}

// User session management
export interface SessionInfo {
  id: string
  created_at: string
  expires_at: string
  ip_address?: string
  user_agent?: string
  device_id?: string
  device_name?: string
  location?: string
}

export async function getUserSessions(): Promise<SessionInfo[]> {
  try {
    const res = await apiClient.get<{ sessions: SessionInfo[] }>('/auth/sessions');
    return res.sessions;
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return [];
  }
}

export async function revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.delete(`/auth/sessions/${sessionId}`);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to revoke session:', error);
    return { success: false, error: error.error || 'Failed to revoke session' };
  }
}

// Upload app logo
export async function uploadAppLogo(appId: string, file: File): Promise<{ logoUrl: string } | { error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    return await apiClient.upload<{ logoUrl: string }>(`/users/apps/manage/${appId}/logo`, formData);
  } catch (error: any) {
    return { error: error.error || 'Failed to upload app logo' };
  }
}

// Storage API
export interface StorageUsage {
  used: number;
  quota: number;
  files: number;
}

export interface StorageFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
}

export interface StorageFileList {
  files: StorageFile[];
  total: number;
  page: number;
  limit: number;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  try {
    return await apiClient.get<StorageUsage>('/storage/usage');
  } catch (error) {
    console.error('Failed to get storage usage:', error);
    return { used: 0, quota: 104857600, files: 0 };
  }
}

export async function getStorageFiles(page = 1, limit = 50): Promise<StorageFileList> {
  try {
    return await apiClient.get<StorageFileList>(`/storage/files?page=${page}&limit=${limit}`);
  } catch (error) {
    console.error('Failed to get storage files:', error);
    return { files: [], total: 0, page, limit };
  }
}

export async function uploadStorageFile(file: File, clientId?: string): Promise<StorageFile | { error: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (clientId) formData.append('client_id', clientId);
    return await apiClient.upload<StorageFile>('/storage/files', formData);
  } catch (error: any) {
    return { error: error.error || 'Failed to upload file' };
  }
}

export async function deleteStorageFile(id: string): Promise<boolean> {
  try {
    await apiClient.delete(`/storage/files/${id}`);
    return true;
  } catch (error) {
    console.error('Failed to delete storage file:', error);
    return false;
  }
}

export interface StorageAppDataItem {
  id: string;
  clientId: string | null;
  clientName: string | null;
  key: string;
  value: any;
  valueSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorageAppDataList {
  items: StorageAppDataItem[];
}

export async function getAllStorageAppData(): Promise<StorageAppDataItem[]> {
  try {
    const result = await apiClient.get<StorageAppDataList>('/storage/data/all');
    return result.items || [];
  } catch (error) {
    console.error('Failed to get storage app data:', error);
    return [];
  }
}

export async function deleteStorageAppData(clientId: string, key: string): Promise<boolean> {
  try {
    await apiClient.delete(`/storage/data?client_id=${encodeURIComponent(clientId)}&key=${encodeURIComponent(key)}`);
    return true;
  } catch (error) {
    console.error('Failed to delete storage app data:', error);
    return false;
  }
}

export async function saveStorageAppData(clientId: string, key: string, value: any): Promise<boolean> {
  try {
    await apiClient.post('/storage/data', { client_id: clientId, key, value });
    return true;
  } catch (error) {
    console.error('Failed to save storage data:', error);
    return false;
  }
}

export async function getStorageAppData(clientId: string, key?: string): Promise<any> {
  try {
    if (key) {
      return await apiClient.get(`/storage/data?client_id=${encodeURIComponent(clientId)}&key=${encodeURIComponent(key)}`);
    }
    return await apiClient.get(`/storage/data?client_id=${encodeURIComponent(clientId)}`);
  } catch (error) {
    console.error('Failed to get storage data:', error);
    return null;
  }
}

// Auth settings
export async function getAuthSettings(): Promise<{ allow_signups: boolean }> {
  try {
    return await apiClient.get<{ allow_signups: boolean }>('/auth/settings');
  } catch (error) {
    console.error('Failed to get auth settings:', error);
    return { allow_signups: true };
  }
}

// Forgot password
export async function forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post('/auth/forgot-password', { email });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to send reset email' };
  }
}

// Reset password
export async function resetPassword(email: string, token: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post('/auth/reset-password', { email, token, password });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to reset password' };
  }
}

// Contact admin
export async function contactAdmin(name: string, email: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post('/auth/contact-admin', { name, email, message });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to send message' };
  }
}

// Admin: Impersonate user
export async function impersonateUser(id: string): Promise<{ token: string; user: any } | { error: string }> {
  try {
    return await apiClient.post(`/admin/users/${id}/impersonate`);
  } catch (error: any) {
    return { error: error.error || 'Failed to impersonate' };
  }
}

// Admin: Ban/unban user
export async function banUser(id: string, banned: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post(`/admin/users/${id}/ban`, { banned });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to update ban status' };
  }
}

// Admin: Get user's OAuth tokens
export async function getAdminUserTokens(id: string): Promise<any[]> {
  try {
    const res = await apiClient.get<{ tokens: any[] }>(`/admin/users/${id}/tokens`);
    return res.tokens;
  } catch { return []; }
}

// Admin: Get user's storage files
export async function getAdminUserStorageFiles(id: string): Promise<any[]> {
  try {
    const res = await apiClient.get<{ files: any[] }>(`/admin/users/${id}/storage-files`);
    return res.files;
  } catch { return []; }
}

// Admin: List all OAuth tokens
export async function getAdminTokens(page = 1, limit = 20, search = '', clientId = ''): Promise<any> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (clientId) params.set('client_id', clientId);
    return await apiClient.get(`/admin/tokens?${params}`);
  } catch { return null; }
}

// Admin: Revoke an OAuth token
export async function revokeAdminToken(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post(`/admin/tokens/${id}/revoke`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.error || 'Failed to revoke token' };
  }
}

// Admin: Get storage overview
export async function getAdminStorage(): Promise<any> {
  try {
    return await apiClient.get('/admin/storage');
  } catch { return null; }
}

// Admin: Regenerate app client secret
export async function regenerateAdminAppSecret(id: string): Promise<{ clientSecret: string } | { error: string }> {
  try {
    return await apiClient.post(`/admin/apps/${id}/regenerate-secret`);
  } catch (error: any) {
    return { error: error.error || 'Failed to regenerate secret' };
  }
}

// Admin: System health
export async function getAdminHealth() { return await apiClient.get('/admin/health'); }

// Admin: Audit log
export async function getAdminAuditLog(page = 1, limit = 50, action?: string, userId?: string) {
  let url = `/admin/audit-log?page=${page}&limit=${limit}`;
  if (action) url += `&action=${encodeURIComponent(action)}`;
  if (userId) url += `&user_id=${encodeURIComponent(userId)}`;
  return await apiClient.get(url);
}

// Admin: Feature flags
export async function getAdminFeatureFlags() { return await apiClient.get('/admin/feature-flags'); }
export async function updateAdminFeatureFlags(flags: Record<string, boolean>) { return await apiClient.patch('/admin/feature-flags', flags); }

// Admin: Maintenance mode
export async function getMaintenanceMode() { return await apiClient.get('/admin/maintenance-mode'); }
export async function setMaintenanceMode(enabled: boolean) { return await apiClient.post('/admin/maintenance-mode', { enabled }); }

// Admin: Email templates
export async function getEmailTemplates() { return await apiClient.get('/admin/email-templates'); }
export async function updateEmailTemplate(key: string, data: { subject: string; body_html: string; body_text?: string }) { return await apiClient.patch(`/admin/email-templates/${key}`, data); }

// Admin: Scheduled tasks
export async function getScheduledTasks() { return await apiClient.get('/admin/scheduled-tasks'); }
export async function runScheduledTask(name: string) { return await apiClient.post('/admin/scheduled-tasks/run', { name }); }

// Admin: Bulk user operations
export async function bulkDeleteUsers(ids: string[]) { return await apiClient.post('/admin/users/bulk-delete', { userIds: ids }); }
export async function bulkDisableUsers(ids: string[]) { return await apiClient.post('/admin/users/bulk-disable', { userIds: ids }); }

// Magic link login
export async function requestMagicLink(email: string): Promise<{ success: boolean }> {
  return await apiClient.post('/auth/magic-link/send', { email });
}

export async function verifyMagicLink(email: string, token: string): Promise<any> {
  return await apiClient.post('/auth/magic-link/verify', { email, token });
}

// Email OTP login
export async function requestOTP(email: string): Promise<{ success: boolean }> {
  return await apiClient.post('/auth/otp/send', { email });
}

export async function verifyOTP(email: string, code: string): Promise<any> {
  return await apiClient.post('/auth/otp/verify', { email, code });
}

// Password strength check
export async function checkPasswordStrength(password: string): Promise<{ score: number; warning: string }> {
  return await apiClient.post('/auth/password-strength', { password });
}

// Breach detection
export async function checkPasswordBreach(password: string): Promise<{ breached: boolean; safe: boolean }> {
  return await apiClient.post('/auth/check-password', { password });
}

// Login history
export interface LoginHistoryEntry {
  id: string
  ip_address: string
  user_agent: string
  method: string
  success: boolean
  created_at: string
}

export async function getLoginHistory(page = 1, limit = 20): Promise<{ entries: LoginHistoryEntry[]; total: number }> {
  return await apiClient.get(`/auth/login-history?page=${page}&limit=${limit}`);
}

// Step-up authentication (re-auth)
export async function performReAuth(password: string): Promise<{ stepUpToken: string }> {
  return await apiClient.post('/auth/re-auth', { password });
}

// Notification preferences
export interface NotificationPrefs {
  login_alert: boolean
  password_change: boolean
  new_app_connection: boolean
  storage_warning: boolean
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  return await apiClient.get('/auth/notifications');
}

export async function updateNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<{ success: boolean }> {
  return await apiClient.patch('/auth/notifications', prefs);
}

// Recovery contacts
export interface RecoveryContact {
  id: string
  contact_type: string
  contact_value: string
  verified: boolean
  created_at: string
}

export async function getRecoveryContacts(): Promise<RecoveryContact[] | { error: string }> {
  try {
    const res = await apiClient.get<{ contacts: RecoveryContact[] }>('/auth/recovery-contacts')
    return res.contacts
  } catch (error: any) {
    return { error: error.error || 'Failed to load recovery contacts' }
  }
}

export async function addRecoveryContact(type: string, value: string): Promise<{ id: string; code: string } | { error: string }> {
  try {
    return await apiClient.post('/auth/recovery-contacts', { contact_type: type, contact_value: value })
  } catch (error: any) {
    return { error: error.error || 'Failed to add recovery contact' }
  }
}

export async function verifyRecoveryContact(id: string, code: string): Promise<{ success: boolean } | { error: string }> {
  try {
    return await apiClient.post(`/auth/recovery-contacts/${id}/verify`, { code })
  } catch (error: any) {
    return { error: error.error || 'Failed to verify contact' }
  }
}

export async function deleteRecoveryContact(id: string): Promise<void> {
  await apiClient.delete(`/auth/recovery-contacts/${id}`)
}

// Email verification
export async function sendEmailVerification(): Promise<{ success: boolean }> {
  return await apiClient.post('/auth/verify-email/send');
}

export async function confirmEmailVerification(token: string): Promise<{ success: boolean }> {
  return await apiClient.post('/auth/verify-email/confirm', { token });
}


