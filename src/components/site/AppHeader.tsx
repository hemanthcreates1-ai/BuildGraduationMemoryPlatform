import Link from 'next/link'

import type { AppUser } from '@/lib/app-auth'

import { GridIcon, PhotoIcon, ShieldIcon, ShirtIcon, UserIcon } from '../ui/Icons'
import { SessionKeeper } from './SessionKeeper'
import { SignOutButton } from './SignOutButton'
import { Wordmark } from './Wordmark'

export type Section = 'batch' | 'profile' | 'jersey' | 'memories'

export function AppHeader({ user, section }: { user: AppUser; section?: Section }) {
  const roll = user.rollNumber
  const links = [
    { href: '/', label: 'Batch Wall', key: 'batch', icon: GridIcon },
    ...(roll
      ? [
          { href: '/profile', label: 'My Profile', key: 'profile', icon: UserIcon },
          { href: `/jersey/${roll}`, label: 'My Jersey', key: 'jersey', icon: ShirtIcon },
        ]
      : []),
    { href: '/memories', label: 'Memory Wall', key: 'memories', icon: PhotoIcon },
  ] as const

  return (
    <header className="sticky top-0 z-40 max-w-full overflow-x-hidden border-b border-sand/60 bg-ivory/85 backdrop-blur-md">
      <SessionKeeper />
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Wordmark />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map(({ href, label, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={section === key ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition ${
                section === key
                  ? 'bg-paper text-ink shadow-paper'
                  : 'text-ink-soft hover:bg-paper/70 hover:text-ink'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user.role === 'admin' ? (
            <Link
              href="/hq"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold tracking-wide text-paper"
            >
              <ShieldIcon size={14} /> Admin
            </Link>
          ) : (
            <span className="hidden rounded-full bg-blush px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-rose-deep sm:inline">
              {roll}
            </span>
          )}
          <SignOutButton compact />
        </div>
      </div>
      <nav
        className="scrollbar-none mx-auto flex w-full max-w-full gap-1 overflow-x-auto px-3 pb-2 md:hidden"
        aria-label="Main (mobile)"
      >
        {links.map(({ href, label, key, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={section === key ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] transition ${
              section === key ? 'bg-paper text-ink shadow-paper' : 'text-ink-soft'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
