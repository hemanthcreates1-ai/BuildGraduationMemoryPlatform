'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import type { RosterEntry } from '@/lib/server/data'

import { PortraitFallback } from '../site/Avatar'
import { CloseIcon, SearchIcon, ShirtIcon } from '../ui/Icons'

const TILTS = [
  '-rotate-[1.2deg]',
  'rotate-[0.8deg]',
  '-rotate-[0.4deg]',
  'rotate-[1.4deg]',
  'rotate-0',
  '-rotate-[1deg]',
]

export function BatchWall({
  roster,
  viewerRoll,
}: {
  roster: RosterEntry[]
  viewerRoll: string | null
}) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const needle = deferred.replace(/\s+/g, '').toUpperCase()
    if (!needle) return roster
    return roster.filter((student) => student.rollNumber.includes(needle))
  }, [deferred, roster])

  return (
    <section
      className="relative mx-auto max-w-7xl px-4 sm:px-6"
      aria-labelledby="classmates-heading"
    >
      <div className="sticky top-[7.25rem] z-30 -mx-4 mb-6 bg-gradient-to-b from-ivory via-ivory/95 to-ivory/0 px-4 pb-4 pt-2 sm:top-[4.1rem] sm:-mx-6 sm:px-6 md:top-[4.4rem]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search by roll number</span>
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by roll number…"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-full border border-sand bg-paper py-3.5 pl-11 pr-11 text-[0.95rem] tracking-[0.06em] text-ink shadow-paper outline-none transition placeholder:tracking-normal placeholder:text-taupe focus:border-rose-deep focus:ring-4 focus:ring-blush"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-beige hover:text-ink"
                aria-label="Clear search"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </label>
          <p id="classmates-heading" className="shrink-0 text-sm text-ink-soft" aria-live="polite">
            <span className="font-display text-xl text-ink">{results.length}</span>
            {results.length === roster.length ? ' classmates' : ` of ${roster.length} classmates`}
          </p>
        </div>
      </div>

      {roster.length === 0 ? (
        <EmptyState
          title="The roster is empty"
          body="The administrator hasn't imported the class list yet."
        />
      ) : results.length === 0 ? (
        <EmptyState
          title="No one matches that roll number"
          body="Check the digits and try again."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((student, index) => (
            <li
              key={student.id}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(index, 18) * 25}ms` }}
            >
              <StudentCard
                student={student}
                tilt={TILTS[student.rosterOrder % TILTS.length]!}
                isViewer={student.rollNumber === viewerRoll}
                priority={index < 6}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StudentCard({
  student,
  tilt,
  isViewer,
  priority,
}: {
  student: RosterEntry
  tilt: string
  isViewer: boolean
  priority: boolean
}) {
  const { rollNumber, photo } = student
  return (
    <article className={`group relative ${tilt} transition duration-300 hover:rotate-0`}>
      <Link
        href={`/jersey/${rollNumber}`}
        className="block rounded-[0.35rem] bg-white p-2.5 pb-3 shadow-polaroid transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift"
        aria-label={`Open the jersey of ${rollNumber}`}
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-[0.2rem] bg-linen">
          {photo ? (
            <Image
              src={photo.url}
              alt={`Portrait of ${rollNumber}`}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 28vw, 16vw"
              priority={priority}
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <PortraitFallback roll={rollNumber} />
          )}
          {isViewer && (
            <span className="absolute left-2 top-2 rounded-full bg-paper/90 px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.18em] text-rose-deep shadow-sm">
              YOU
            </span>
          )}
        </div>
        <p className="mt-3 text-center font-display text-[1.05rem] font-medium tracking-[0.12em] text-ink">
          {rollNumber}
        </p>
      </Link>
      <div className="mt-2 flex justify-center">
        <Link
          href={`/jersey/${rollNumber}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-sand/80 bg-paper px-3 py-1.5 text-[0.72rem] font-semibold text-ink-soft transition hover:border-rose hover:text-ink"
        >
          <ShirtIcon size={14} /> Jersey
        </Link>
      </div>
      <span className="pointer-events-none absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-3 bg-rose/35 opacity-0 transition group-hover:opacity-100" />
    </article>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-dashed border-sand bg-paper/60 px-8 py-14 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-soft">{body}</p>
    </div>
  )
}
