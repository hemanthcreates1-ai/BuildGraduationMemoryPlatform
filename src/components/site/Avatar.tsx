import Image from 'next/image'

import type { PhotoRef } from '@/lib/server/data'

const TINTS = ['#f3dfe3', '#efe3cf', '#e5e9dc', '#e6e1ef', '#f2e5d6', '#e2ebee']

/** Portrait from the admin-managed photo, or a soft monogram built from the roll number. */
export function Avatar({
  roll,
  photo,
  size = 40,
  className = '',
}: {
  roll: string
  photo: PhotoRef
  size?: number
  className?: string
}) {
  if (photo) {
    return (
      <Image
        src={photo.url}
        alt={`Portrait of ${roll}`}
        width={size * 2}
        height={Math.round(size * 2.5)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  const tint = TINTS[roll.charCodeAt(roll.length - 1) % TINTS.length]
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-medium text-ink-soft ${className}`}
      style={{ width: size, height: size, background: tint, fontSize: size * 0.36 }}
    >
      {roll.slice(-2)}
    </span>
  )
}

/** Large yearbook fallback when a portrait hasn't been uploaded yet. */
export function PortraitFallback({ roll }: { roll: string }) {
  const tint = TINTS[roll.charCodeAt(roll.length - 1) % TINTS.length]
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1"
      style={{ background: `linear-gradient(160deg, ${tint}, #fbf7f0 85%)` }}
    >
      <span className="font-display text-4xl font-light tracking-tight text-ink-soft/80">
        {roll.slice(-3)}
      </span>
      <span className="font-hand text-lg text-muted">photo coming soon</span>
    </div>
  )
}
