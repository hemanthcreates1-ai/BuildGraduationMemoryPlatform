import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-8 py-16 text-center">
      <p className="font-hand text-2xl text-rose-deep">lost in the hallway</p>
      <h1 className="mt-1 font-display text-4xl text-ink">Page not found</h1>
      <p className="mt-4 text-ink-soft">
        That page or classmate doesn&apos;t exist. Check the roll number and try again.
      </p>
      <Link
        className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper"
        href="/"
      >
        Back to the batch wall
      </Link>
    </main>
  )
}
