import type { ZodType } from 'zod'
import { tokenStore } from './token'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// one error type for everything: business failures, Spring errors, network errors and 401
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// set by the app so a 401 can sign the user out and show the session expired page
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn
}

type RequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** query string values, empty ones are skipped */
  params?: Record<string, string | number | boolean | null | undefined>
  /** checks the shape of the response, see src/api/schemas.ts */
  schema?: ZodType<T>
  /** true for the public endpoints (login, forgot password...), they never carry a token */
  public?: boolean
}

function buildUrl(path: string, params?: RequestOptions<unknown>['params']) {
  const url = `${BASE_URL}${path}`
  if (!params) return url
  const query = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') query.set(k, String(v))
  })
  const text = query.toString()
  return text ? `${url}?${text}` : url
}

export async function api<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, params, schema } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const token = tokenStore.get()
  if (token && !options.public) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }

  // the session ended: sign out, except on the public pages where a 401 is just a wrong answer
  if (res.status === 401 && !options.public) {
    onUnauthorized?.()
    throw new ApiError('Unauthorized or session expired', 401)
  }

  // the body can be empty or not JSON, so read it as text first
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null

  // the API reports business failures as { success: false, message }, sometimes with HTTP 200
  if (obj && obj.success === false) {
    throw new ApiError(String(obj.message ?? 'Something went wrong'), res.status)
  }

  if (!res.ok) {
    // Spring's default error shape is { timestamp, status, error, path }
    const message =
      (obj && typeof obj.message === 'string' && obj.message) ||
      (obj && typeof obj.error === 'string' && obj.error) ||
      `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }

  return schema ? schema.parse(data) : (data as T)
}