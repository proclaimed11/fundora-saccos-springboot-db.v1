import { z } from 'zod'

// the API asks for at least 8 characters (minPasswordLength in /api/security/settings)
export const MIN_PASSWORD = 8

/* ---------- requests (also used to validate the forms) ---------- */

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})


export type LoginInput = z.infer<typeof loginSchema>

export const twoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})
export type TwoFactorInput = z.infer<typeof twoFactorSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    newPassword: z.string().min(MIN_PASSWORD, `New password must be at least ${MIN_PASSWORD} characters`),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'The two passwords do not match',
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/* ---------- responses ---------- */

export const permissionSchema = z.object({
  id: z.number(),
  area: z.string(),
  page: z.string().nullable().optional(),
  action: z.string(),
  label: z.string().optional(),
  kind: z.string().nullable().optional(),
})
export type Permission = z.infer<typeof permissionSchema>

// login answers with a token, or with requiresTwoFactor and a twoFactorToken
// (a failure never reaches here, the client turns { success: false } into an error)
export const loginResponseSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  userId: z.number(),
  username: z.string(),
  firstName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().optional(),
  role: z.string().nullable().optional(),
  token: z.string().optional(),
  permissions: z.array(permissionSchema).optional(),
  requiresTwoFactor: z.boolean().optional(),
  twoFactorToken: z.string().optional(),
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

// forgot password, reset password, logout and 2fa toggle all answer with { success, message }
export const messageResponseSchema = z.object({
  success: z.boolean().optional(),
  message: z.string(),
})
export type MessageResponse = z.infer<typeof messageResponseSchema>

// GET /api/users/{id}. zod drops fields it doesn't list, so passwordHash never reaches the UI state.
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  firstName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  roleId: z.number().nullable().optional(),
  // the Spring model may send the role as an object, so it is read by hand
  role: z.unknown().optional(),
  isTwoFactorEnabled: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
})

export type UserRecord = z.infer<typeof userSchema>