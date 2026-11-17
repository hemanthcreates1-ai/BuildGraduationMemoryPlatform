import { EXPECTED_STUDENT_COUNT } from '@/lib/constants'

/** Typographic scrapbook collage: a signed jersey sketch with pinned polaroid notes. */
export function LoginHero() {
  return (
    <div className="relative mx-auto aspect-[4/3.4] w-full max-w-xl select-none" aria-hidden="true">
      <div className="absolute inset-[8%_14%_4%_14%] rounded-[2.5rem] bg-paper/70 shadow-paper paper-grain" />
      <svg viewBox="0 0 400 340" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="tee" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#f3ece1" />
          </linearGradient>
        </defs>
        <path
          d="M148 52c12 14 30 20 52 20s40-6 52-20l58 26 26 58-38 16-10-14v170H112V138l-10 14-38-16 26-58 58-26Z"
          fill="url(#tee)"
          stroke="#d8cab3"
          strokeWidth="2"
        />
        <path
          d="M148 52c12 14 30 20 52 20s40-6 52-20"
          fill="none"
          stroke="#cdbfa7"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M112 300h176" stroke="#e5dac7" strokeWidth="2" strokeDasharray="3 4" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M140 132c10-14 22-16 26-4s-14 26-6 28 22-26 30-22-6 24 2 24 16-14 22-12"
            stroke="#1e2f6b"
            strokeWidth="2.6"
          />
          <path
            d="M214 120c16-6 30 0 26 10s-22 8-18 16 26 2 34-6"
            stroke="#e0486f"
            strokeWidth="2.4"
          />
          <path d="M150 196c18-8 40-10 60-4" stroke="#1f6b3a" strokeWidth="2.2" />
          <path
            d="M224 190c4 10 14 14 22 6s2-20 12-18 6 18 14 14"
            stroke="#6d3fc0"
            strokeWidth="2.2"
          />
          <path
            d="M168 238c6-6 14-6 16 2s-10 12-2 14 18-12 26-10"
            stroke="#b3202b"
            strokeWidth="2.2"
          />
          <path d="M236 246l8-14 8 14 6-10" stroke="#2459d6" strokeWidth="2.2" />
          <path
            d="M196 158c-6-8-18-2-12 8l12 12 12-12c6-10-6-16-12-8Z"
            stroke="#f08fb0"
            strokeWidth="2.2"
          />
        </g>
      </svg>
      <figure className="absolute left-[2%] top-[14%] w-[24%] -rotate-[8deg] rounded-sm bg-white p-2 pb-7 shadow-polaroid">
        <div className="flex aspect-[4/5] items-center justify-center bg-linen font-display text-3xl font-light text-ink-soft">
          {EXPECTED_STUDENT_COUNT}
        </div>
        <figcaption className="absolute inset-x-0 bottom-1 text-center font-hand text-lg text-ink-soft">
          people
        </figcaption>
      </figure>
      <figure className="absolute right-[2%] top-[8%] w-[22%] rotate-[7deg] rounded-sm bg-white p-2 pb-7 shadow-polaroid">
        <div className="flex aspect-[4/5] items-center justify-center bg-blush font-display text-3xl font-light text-rose-deep">
          1
        </div>
        <figcaption className="absolute inset-x-0 bottom-1 text-center font-hand text-lg text-ink-soft">
          batch
        </figcaption>
      </figure>
      <figure className="absolute bottom-[4%] right-[8%] w-[23%] -rotate-[4deg] rounded-sm bg-white p-2 pb-7 shadow-polaroid">
        <div className="flex aspect-[4/5] items-center justify-center bg-beige font-display text-4xl font-light text-ink-soft">
          ∞
        </div>
        <figcaption className="absolute inset-x-0 bottom-1 text-center font-hand text-lg text-ink-soft">
          memories
        </figcaption>
      </figure>
      <span className="absolute left-[30%] top-[3%] h-6 w-24 -rotate-6 bg-rose/40 shadow-sm" />
      <span className="absolute bottom-[10%] left-[10%] h-6 w-20 rotate-12 bg-sand/60 shadow-sm" />
    </div>
  )
}
