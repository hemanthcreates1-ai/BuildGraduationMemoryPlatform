'use client'

import { useState, type FormEvent } from 'react'

import { MESSAGE_MAX_LENGTH } from '@/lib/constants'
import { apiJson, newSubmissionId } from '@/lib/client/api'
import type { MessageCard } from '@/lib/server/data'

import { useToast } from '../ui/Toast'
import { ArrowRightIcon } from '../ui/Icons'

export function JerseyMessages({ roll, initial }: { roll: string; initial: MessageCard[] }) {
  const [messages, setMessages] = useState(initial)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!value.trim()) return setError('Write a message first.')
    setBusy(true)
    const result = await apiJson<{ message: MessageCard }>(
      `/api/lj/jersey/${encodeURIComponent(roll)}/messages`,
      'POST',
      { message: value, submissionId: newSubmissionId() },
    )
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setMessages((items) => [...items, result.message])
    setValue('')
    toast.show('Your message is now part of this jersey.', 'success')
  }

  return (
    <section className="mt-12" aria-labelledby="jersey-messages-heading">
      <div className="grid gap-7 lg:grid-cols-[22rem_1fr]">
        <form
          onSubmit={submit}
          className="h-fit rounded-[2rem] border border-sand/70 bg-paper p-6 shadow-paper"
        >
          <p className="font-hand text-2xl text-rose-deep">leave a note</p>
          <h2 id="jersey-messages-heading" className="font-display text-2xl text-ink">
            Jersey messages
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Typed messages are separate from the ink artwork and appear oldest first.
          </p>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, MESSAGE_MAX_LENGTH))}
            rows={6}
            placeholder="Write something they'll want to read ten years from now…"
            className="mt-5 w-full resize-none rounded-2xl border border-sand bg-ivory p-4 text-sm leading-relaxed outline-none focus:border-rose-deep focus:ring-4 focus:ring-blush"
          />
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>Anonymous to classmates</span>
            <span>
              {value.length}/{MESSAGE_MAX_LENGTH}
            </span>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-blush px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Leave this message'} <ArrowRightIcon size={16} />
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Messages are permanent after submission.
          </p>
        </form>

        <div>
          {messages.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-sand bg-linen/60 px-8 py-14 text-center">
              <p className="font-hand text-2xl text-muted">the first card is waiting</p>
              <p className="mt-1 text-sm text-ink-soft">
                Be the first to leave a message on this jersey.
              </p>
            </div>
          ) : (
            <ol className="grid gap-4 sm:grid-cols-2">
              {messages.map((message, index) => (
                <li
                  key={message.id}
                  className={`relative min-h-40 rounded-md border border-sand/50 bg-paper p-5 pb-10 shadow-paper paper-grain ${
                    index % 3 === 0 ? '-rotate-[0.5deg]' : index % 3 === 1 ? 'rotate-[0.6deg]' : ''
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-7 text-ink-soft">
                    {message.message}
                  </p>
                  <time className="absolute bottom-4 right-5 text-[0.65rem] font-semibold tracking-[0.16em] text-muted">
                    {new Intl.DateTimeFormat('en', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }).format(new Date(message.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
