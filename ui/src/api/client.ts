import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const TOKEN_KEY = 'dataop_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

export const api = axios.create({
  baseURL: '/api/v1',
})

// Attach the JWT to every request when present.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Single in-flight refresh shared by all concurrently-failing requests, so a
// burst of 401s triggers exactly one token exchange.
let refreshPromise: Promise<string> | null = null

function refreshToken(): Promise<string> {
  refreshPromise ??= axios
    .post<{ data: { token: string } }>(
      '/api/v1/auth/refresh',
      {},
      { headers: { Authorization: `Bearer ${getToken()}` } },
    )
    .then((res) => {
      const token = res.data.data.token
      setToken(token)
      return token
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

function redirectToLogin() {
  clearToken()
  if (!location.pathname.startsWith('/login')) {
    location.href = '/login'
  }
}

// On 401: try to refresh the (possibly expired) token once and replay the
// request. Only when the refresh itself fails is the session cleared. This
// keeps long-lived tabs logged in instead of bouncing users to /login the
// moment the JWT ttl elapses.
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<{ error?: string }>) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined
    if (error.response?.status === 401 && getToken() && original && !original._retried) {
      original._retried = true
      try {
        const token = await refreshToken()
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch {
        redirectToLogin()
      }
    } else if (error.response?.status === 401 && getToken()) {
      redirectToLogin()
    }
    const message =
      error.response?.data?.error ?? error.message ?? 'Something went wrong'
    return Promise.reject(new Error(message))
  },
)

/** Unwraps the backend's { data: ... } envelope. */
export async function unwrap<T>(p: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await p
  return res.data.data
}
