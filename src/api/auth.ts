import { api } from './client'
import {
  loginResponseSchema,
  messageResponseSchema,
  type LoginResponse,
  type MessageResponse,
} from './schemas'

export const loginRequest = (username: string, password: string) =>
  api<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    schema: loginResponseSchema,
    public: true,
  })

export const logoutRequest = () =>
  api('/api/auth/logout', { method: 'POST', schema: messageResponseSchema })

// emails a 6-digit code, it expires after 5 minutes and works once
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

  // completes a 2FA sign-in, answers like the login does (with the session token)
export const verifyTwoFactorRequest = (twoFactorToken: string, code: string) =>
  api<LoginResponse>('/api/auth/verify-2fa', {
    method: 'POST',
    body: { twoFactorToken, code },
    schema: loginResponseSchema,
    public: true,
  })

// needs the session token, it changes the signed-in user's own account
export const toggleTwoFactorRequest = (enabled: boolean) =>
  api<MessageResponse>('/api/auth/2fa/toggle', {
    method: 'POST',
    body: { enabled },
    schema: messageResponseSchema,
  })