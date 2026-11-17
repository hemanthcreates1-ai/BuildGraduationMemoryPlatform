import { redirect } from 'next/navigation'

import { appAuth, type AppUser } from '../app-auth'
import { HttpError } from './http'

/** Route handlers: any signed-in app account. */
export async function requireUser(): Promise<AppUser> {
  const user = await appAuth.getCurrentUser()
  if (!user)
    throw new HttpError(401, 'Your session has ended. Please sign in again.', 'unauthenticated')
  return user
}

/** Route handlers: only classmates can contribute (the admin account manages, it doesn't post). */
export async function requireStudent(): Promise<AppUser> {
  const user = await requireUser()
  if (user.role !== 'student') {
    throw new HttpError(403, 'Only classmates can add contributions.', 'forbidden')
  }
  return user
}

/** Route handlers: administrator only. Role comes from the database, never from the client. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser()
  if (user.role !== 'admin') throw new HttpError(403, 'Administrator access required.', 'forbidden')
  return user
}

/** Pages: redirect anonymous visitors to the login page. */
export async function requirePageUser(nextPath: string): Promise<AppUser> {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return user
}

export async function requirePageAdmin(): Promise<AppUser> {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/hq/login')
  if (user.role !== 'admin') redirect('/')
  return user
}

export function actorLabel(user: AppUser | null | undefined) {
  if (!user) return 'anonymous'
  return user.role === 'admin' ? `admin:${user.username}` : (user.rollNumber ?? user.username)
}
