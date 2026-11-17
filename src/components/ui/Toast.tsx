'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { AlertIcon, CheckIcon, CloseIcon } from './Icons'

type Tone = 'success' | 'error' | 'info'
type ToastItem = { id: number; tone: Tone; message: string }
type ToastApi = { show: (message: string, tone?: Tone) => void }

const ToastContext = createContext<ToastApi>({ show: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((item) => item.id !== id)),
    [],
  )
  const show = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = nextId.current++
      setItems((list) => [...list.slice(-3), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200)
    },
    [dismiss],
  )
  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md animate-rise items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lift backdrop-blur ${
              item.tone === 'error'
                ? 'border-rose/60 bg-blush/95 text-ink'
                : item.tone === 'success'
                  ? 'border-sand bg-paper/95 text-ink'
                  : 'border-sand bg-paper/95 text-ink-soft'
            }`}
          >
            <span className={`mt-0.5 ${item.tone === 'error' ? 'text-rose-deep' : 'text-moss'}`}>
              {item.tone === 'error' ? <AlertIcon size={18} /> : <CheckIcon size={18} />}
            </span>
            <span className="flex-1 leading-snug">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-mr-1 rounded-full p-1 text-muted transition hover:bg-beige hover:text-ink"
              aria-label="Dismiss"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
