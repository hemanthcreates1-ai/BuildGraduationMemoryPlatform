import { CREDIT } from '@/lib/constants'

import { HeartIcon } from '../ui/Icons'

export function SiteFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`px-6 py-10 text-center ${className}`}>
      <p className="inline-flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.28em] text-muted">
        {CREDIT.toUpperCase().replace('FT.MIDDLEBENCHERS', 'ft.middlebenchers')}
        <HeartIcon size={14} className="text-rose-deep" aria-label="love" role="img" />
      </p>
    </footer>
  )
}
