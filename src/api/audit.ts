import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { AuditLog } from '../pages/administration/audit/auditData'

/* ---------- GET /api/audit-logs ---------- */

// old and new values are JSON text in the API document, an object is accepted too
const jsonText = z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]).nullish()

const auditRowSchema = z.object({
  id: z.number(),
  userId: z.number().nullish(),
  action: z.string().nullish(),
  entityType: z.string().nullish(),
  entityId: z.number().nullish(),
  oldValues: jsonText,
  newValues: jsonText,
  ipAddress: z.string().nullish(),
  createdAt: z.string().nullish(),
})

type AuditRow = z.infer<typeof auditRowSchema>

// the document shows { success, message, data: [...] }, a plain array is accepted too
const auditListSchema = z.union([z.array(auditRowSchema), z.object({ data: z.array(auditRowSchema) })])

const asText = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v))

// the table row -> the shape the Audit page uses
const toAuditLog = (r: AuditRow): AuditLog => ({
  id: r.id,
  userId: r.userId ?? null,
  action: (r.action ?? '').toUpperCase(),
  entityType: r.entityType ?? '',
  entityId: r.entityId ?? null,
  oldValues: asText(r.oldValues),
  newValues: asText(r.newValues),
  ipAddress: r.ipAddress ?? '',
  createdAt: r.createdAt ?? '',
})

// every filter is optional, none is sent here, the page filters what it loaded
export async function getAuditLogs(): Promise<AuditLog[]> {
  const res = await api('/api/audit-logs', { schema: auditListSchema })
  return (Array.isArray(res) ? res : res.data).map(toAuditLog)
}

/* ---------- GET /api/audit-logs/summary ---------- */

const summarySchema = z.object({
  data: z.object({
    totalLogs: z.number(),
    byAction: z.record(z.string(), z.number()).nullish(),
    byEntityType: z.record(z.string(), z.number()).nullish(),
  }),
})

export const getAuditSummary = async () => (await api('/api/audit-logs/summary', { schema: summarySchema })).data

/* ---------- hooks ---------- */

export const auditKeys = {
  list: ['audit-logs'] as const,
  summary: ['audit-logs', 'summary'] as const,
}

// an audit trail must never be stale, so it is read again every time the page opens
export const useAuditLogs = () => useQuery({ queryKey: auditKeys.list, queryFn: getAuditLogs, staleTime: 0 })

// only feeds the key numbers, the page falls back to counting the rows if this fails
export const useAuditSummary = () => useQuery({ queryKey: auditKeys.summary, queryFn: getAuditSummary, staleTime: 0 })