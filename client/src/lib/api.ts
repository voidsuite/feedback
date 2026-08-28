const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const USER_KEY = 'va_user';

export interface ApiError {
  error: string;
  message?: string;
  details?: any;
  status?: number;
}

export class RateLimitError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, retryAfter = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

function generateUUID(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem('va_device_id');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('va_device_id', id);
  }
  return id;
}

export function getDeviceName(): string {
  return navigator.userAgent;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Remove Content-Type for FormData (browser sets it with boundary)
    if (options.body instanceof FormData) {
      delete (headers as any)['Content-Type'];
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Send cookies cross-origin
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        const err = new RateLimitError('Too many requests. Please wait before trying again.', retryAfter);
        (err as any).error = err.message;
        throw err;
      }

      if (response.status === 401 && !isRetry) {
        // Session expired — redirect to login, but only if we're not already
        // on the login page (prevents redirect loops when verifyAuth fails
        // immediately after a login POST).
        const onLoginPage = window.location.pathname === '/login' || window.location.pathname.startsWith('/login/');
        if (!onLoginPage) {
          clearAuth();
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        }
        throw new Error('Session expired');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return {} as T;
      }

      const data = await response.json();

      if (!response.ok) {
        const err = data as ApiError;
        err.status = response.status;
        throw err;
      }

      return data as T;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, { 
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// User display data storage (for instant UI rendering, NOT for auth)
export function storeUser(user: any): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): any | null {
  const userData = localStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
}

export function clearAuth(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('va_keep_logged_in');
}
