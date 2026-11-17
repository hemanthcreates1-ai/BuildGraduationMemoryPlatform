export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6" role="status" aria-label="Loading">
      <div className="h-12 w-72 animate-pulse rounded-2xl bg-beige/70" />
      <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-beige/60" />
      <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="rounded-md bg-white p-2.5 shadow-polaroid">
            <div className="aspect-[4/5] animate-pulse rounded-sm bg-linen" />
            <div className="mx-auto mt-3 h-4 w-24 animate-pulse rounded bg-beige/70" />
          </div>
        ))}
      </div>
    </div>
  )
}
