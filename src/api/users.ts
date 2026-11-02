import { api } from './client'
import { userSchema, type UserRecord } from './schemas'

// raw CRUD, needs the session token
export const getUserRequest = (id: number) => api<UserRecord>(`/api/users/${id}`, { schema: userSchema })