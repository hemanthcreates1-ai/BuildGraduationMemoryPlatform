import Link from 'next/link'

import type { AppUser } from '@/lib/app-auth'

import { CloudIcon, GridIcon, NotebookIcon, PhotoIcon, ShieldIcon } from '../ui/Icons'
import { SignOutButton } from '../site/SignOutButton'
import { Wordmark } from '../site/Wordmark'

const links = [
  { href: '/hq', label: 'Overview', icon: GridIcon },
  { href: '/hq/roster', label: 'Profiles & roster', icon: PhotoIcon },
  { href: '/hq/contributions', label: 'Contributions', icon: NotebookIcon },
  { href: '/hq/system', label: 'Logs & backups', icon: CloudIcon },
]

export function AdminNav({ user }: { user: AppUser }) {
  return (
    <header className="sticky top-0 z-50 border-b border-sand/70 bg-ink text-paper">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Wordmark href="/hq" />
        <span className="hidden items-center gap-1 rounded-full bg-paper/10 px-3 py-1 text-xs sm:inline-flex">
          <ShieldIcon size={14} /> administrator
        </span>
        <nav className="scrollbar-none ml-2 hidden gap-1 overflow-x-auto lg:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm text-paper/75 hover:bg-paper/10 hover:text-paper"
            >
              <Icon size={15} /> {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <SignOutButton redirectTo="/hq/login" />
        </div>
      </div>
      <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-paper/5 px-3 py-1.5 text-xs text-paper/80"
          >
            <Icon size={14} /> {label}
          </Link>
        ))}
      </nav>
      <span className="sr-only">Signed in as {user.username}</span>
    </header>
  )
}
