import Link from 'next/link'

export function Wordmark({ href = '/', size = 'md' }: { href?: string; size?: 'md' | 'lg' }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-baseline gap-2"
      aria-label="THE LAST JERSEY — home"
    >
      <span
        className={`font-display font-semibold tracking-[0.18em] text-ink ${size === 'lg' ? 'text-2xl' : 'text-[0.95rem] sm:text-base'}`}
      >
        THE LAST JERSEY
      </span>
      <span className="hidden h-1.5 w-1.5 rounded-full bg-rose-deep transition group-hover:scale-125 sm:inline-block" />
    </Link>
  )
}
