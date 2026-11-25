// 3000000 -> "TZS 3,000,000"
export function formatTzs(amount: number): string {
  return `TZS ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// Tanzania's NIDA number (NIN): 20 digits, written YYYYMMDD-XXXXX-XXXXX-XX
export const NIDA_DIGITS = 20
const NIDA_GROUPS = [8, 5, 5, 2]

// keeps the digits only (at most 20) and puts the hyphens between the groups as they fill up
export function formatNida(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, NIDA_DIGITS)
  const parts: string[] = []
  let at = 0
  for (const size of NIDA_GROUPS) {
    if (at >= digits.length) break
    parts.push(digits.slice(at, at + size))
    at += size
  }
  return parts.join('-')
}

// how many digits a NIDA number has, ignoring the hyphens
export const nidaDigitCount = (value: string) => value.replace(/\D/g, '').length