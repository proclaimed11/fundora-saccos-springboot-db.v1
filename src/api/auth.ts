import { api } from './client'
import { loginResponseSchema, messageResponseSchema, type LoginResponse } from './schemas'

export const loginRequest = (email: string, password: string) =>
  api<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    schema: loginResponseSchema,
    public: true,
  })

export const logoutRequest = () =>
  api('/api/auth/logout', { method: 'POST', schema: messageResponseSchema })