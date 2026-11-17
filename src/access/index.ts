import type { Access, FieldAccess, PayloadRequest } from 'payload'

type MaybeUser = {
  collection?: string
  id?: number | string
  role?: string | null
} | null

const userOf = (req: PayloadRequest): MaybeUser => (req.user as MaybeUser) ?? null

/** CMS editors who sign in to Payload Admin with Figma SSO. */
export const isCmsAdmin = (req: PayloadRequest) => userOf(req)?.collection === 'admins'

/** The app administrator account (HEMANTHHK.7) in the app `users` collection. */
export const isAppAdmin = (req: PayloadRequest) => {
  const user = userOf(req)
  return user?.collection === 'users' && user.role === 'admin'
}

export const isStudent = (req: PayloadRequest) => {
  const user = userOf(req)
  return user?.collection === 'users' && user.role === 'student'
}

export const isAdmin = (req: PayloadRequest) => isCmsAdmin(req) || isAppAdmin(req)

export const adminsOnly: Access = ({ req }) => isAdmin(req)
export const adminField: FieldAccess = ({ req }) => isAdmin(req)
export const nobody: Access = () => false

/**
 * Server-owned fields: writable by administrators, or by the app's own route handlers which
 * mark trusted writes with `context.serverWrite`. Request context can't be set by a client.
 */
export const serverOwned: FieldAccess = ({ req }) =>
  isAdmin(req) || (req.context as { serverWrite?: boolean } | undefined)?.serverWrite === true

/** Students may create contributions; the server derives the contributor from the session. */
export const studentsOrAdminsCreate: Access = ({ req }) => isStudent(req) || isAdmin(req)

/** Students see published entries only; administrators see everything including removed entries. */
export const publishedOrAdmin: Access = ({ req }) => {
  if (isAdmin(req)) return true
  if (isStudent(req)) return { status: { equals: 'published' } }
  return false
}

/** Any signed-in classmate or administrator. */
export const signedIn: Access = ({ req }) => isStudent(req) || isAdmin(req)
