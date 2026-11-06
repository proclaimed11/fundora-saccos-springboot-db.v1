type NameParts = { firstName?: string | null; middleName?: string | null; lastName?: string | null }

// John Mwita Doe -> "John M. Doe", no middle name -> "John Doe", nothing at all -> the fallback
export function formatUserName(parts: NameParts, fallback = ''): string {
  const first = parts.firstName?.trim() ?? ''
  const middle = parts.middleName?.trim() ?? ''
  const last = parts.lastName?.trim() ?? ''
  const initial = middle ? `${middle.charAt(0).toUpperCase()}.` : ''
  return [first, initial, last].filter(Boolean).join(' ') || fallback
}