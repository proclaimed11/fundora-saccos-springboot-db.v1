import { api } from './client'
import { z } from 'zod'
import {
  loginResponseSchema,
  messageResponseSchema,
  permissionSchema,
  type LoginResponse,
  type MessageResponse,
  type Permission,
} from './schemas'

// what a role may do, read again on every page load so a change on the server shows up
export const rolePermissionsRequest = (roleId: number) =>
  api<Permission[]>(`/api/roles/${roleId}/permissions`, { schema: z.array(permissionSchema) })

// the login body key: the API document says "username", change to { email, password } if your server wants email
// the API document's login body is { email, password }
export const loginRequest = (email: string, password: string) =>
  api<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    schema: loginResponseSchema,
    public: true,
  })

export const logoutRequest = () =>
  api('/api/auth/logout', { method: 'POST', schema: messageResponseSchema })

export const forgotPasswordRequest = (email: string) =>
  api<MessageResponse>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
    schema: messageResponseSchema,
    public: true,
  })

export const resetPasswordRequest = (email: string, code: string, newPassword: string) =>
  api<MessageResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
    schema: messageResponseSchema,
    public: true,
  })

export const verifyTwoFactorRequest = (twoFactorToken: string, code: string) =>
  api<LoginResponse>('/api/auth/verify-2fa', {
    method: 'POST',
    body: { twoFactorToken, code },
    schema: loginResponseSchema,
    public: true,
  })

export const toggleTwoFactorRequest = (enabled: boolean) =>
  api<MessageResponse>('/api/auth/2fa/toggle', {
    method: 'POST',
    body: { enabled },
    schema: messageResponseSchema,
  })