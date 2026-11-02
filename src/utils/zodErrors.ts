import type { ZodType } from 'zod'

export type FieldErrors<T> = Partial<Record<keyof T & string, string>>

/**
 * Validates form values with a Zod schema.
 * Returns { data } when valid, or { errors } with the first message of each field.
 */
export function validateForm<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  values: unknown,
): { data: T; errors?: undefined } | { data?: undefined; errors: FieldErrors<T> } {
  const result = schema.safeParse(values)
  if (result.success) return { data: result.data }

  const errors: FieldErrors<T> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '') as keyof T & string
    if (key && !errors[key]) errors[key] = issue.message
  }
  return { errors }
}