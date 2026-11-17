'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PHOTO_ACCEPT_ATTRIBUTE } from '@/lib/constants'
import { apiJson, apiUpload } from '@/lib/client/api'

import { useToast } from '../ui/Toast'
import { CheckIcon, DownloadIcon, RefreshIcon, TrashIcon, UploadIcon } from '../ui/Icons'

export function ProfileAdminActions({ roll, hasPhoto }: { roll: string; hasPhoto: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.set('file', file)
    form.set('roll', roll)
    const result = await apiUpload(`/api/lj/admin/profile-photos`, form)
    setBusy(false)
    if (!result.ok) return toast.show(result.error, 'error')
    toast.show(`Profile photo saved for ${roll}.`, 'success')
    router.refresh()
  }
  async function remove() {
    if (!confirm(`Remove the profile photograph for ${roll}?`)) return
    setBusy(true)
    const result = await apiJson('/api/lj/admin/profile-photos', 'DELETE', { roll })
    setBusy(false)
    if (!result.ok) return toast.show(result.error, 'error')
    toast.show(`Profile photo removed for ${roll}.`, 'success')
    router.refresh()
  }
  return (
    <div className="flex flex-wrap gap-2">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-sand px-3 py-1.5 text-xs font-semibold hover:border-rose">
        {hasPhoto ? <RefreshIcon size={14} /> : <UploadIcon size={14} />}{' '}
        {hasPhoto ? 'Replace' : 'Upload'}
        <input
          type="file"
          accept={PHOTO_ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={busy}
          onChange={(event) => upload(event.target.files?.[0])}
        />
      </label>
      {hasPhoto && (
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose/50 px-3 py-1.5 text-xs text-rose-deep"
        >
          <TrashIcon size={14} /> Remove
        </button>
      )}
    </div>
  )
}

export function UnlockButton({ id, roll }: { id: string; roll: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const result = await apiJson('/api/lj/admin/unlock', 'POST', { id })
        setBusy(false)
        toast.show(
          result.ok ? `${roll} is unlocked.` : result.error,
          result.ok ? 'success' : 'error',
        )
      }}
      className="rounded-full border border-sand px-3 py-1.5 text-xs text-ink-soft"
    >
      {busy ? 'Unlocking…' : 'Unlock'}
    </button>
  )
}

export function ModerateButton({
  collection,
  id,
  removed,
}: {
  collection: string
  id: string
  removed: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const reason = removed
          ? ''
          : (prompt('Reason for removal (stored in the audit log):') ?? '')
        if (!removed && !reason) return
        setBusy(true)
        const result = await apiJson('/api/lj/admin/moderate', 'POST', {
          collection,
          id,
          action: removed ? 'restore' : 'remove',
          reason,
        })
        setBusy(false)
        if (!result.ok) return toast.show(result.error, 'error')
        toast.show(removed ? 'Contribution restored.' : 'Contribution removed.', 'success')
        router.refresh()
      }}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${removed ? 'border-moss/60 text-moss' : 'border-rose/60 text-rose-deep'}`}
    >
      {busy ? 'Saving…' : removed ? 'Restore' : 'Remove'}
    </button>
  )
}

export function SystemActions() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper">
        <h2 className="font-display text-2xl">Roster import</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Validate pins.csv before applying. Existing students are preserved; PINs reset only when
          explicitly selected.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const submitter = (event.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null
            form.set('mode', submitter?.value === 'apply' ? 'apply' : 'preview')
            setBusy('roster')
            const result = await apiUpload<{ summary: Record<string, unknown> }>(
              '/api/lj/admin/roster',
              form,
            )
            setBusy(null)
            if (!result.ok) return toast.show(result.error, 'error')
            setReport(result.summary)
          }}
        >
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-xl border border-sand bg-ivory p-3 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="resetPins" value="1" /> Reset existing PINs when applied
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              value="preview"
              disabled={busy === 'roster'}
              className="inline-flex items-center gap-2 rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink"
            >
              <CheckIcon size={15} /> Validate CSV
            </button>
            <button
              type="submit"
              value="apply"
              disabled={busy === 'roster'}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
            >
              <UploadIcon size={15} /> Validate & apply
            </button>
          </div>
        </form>
        {report && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-linen p-4 text-xs">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </section>
      <section className="rounded-[1.5rem] border border-sand bg-paper p-6 shadow-paper">
        <h2 className="font-display text-2xl">Database backup</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Creates a private JSON snapshot of records and file references. Password hashes and active
          sessions are excluded.
        </p>
        <button
          type="button"
          disabled={busy === 'backup'}
          onClick={async () => {
            setBusy('backup')
            const result = await apiJson<{ backup: { url: string; label: string } }>(
              '/api/lj/admin/backups',
              'POST',
            )
            setBusy(null)
            if (!result.ok) return toast.show(result.error, 'error')
            toast.show('Backup created in persistent storage.', 'success')
            router.refresh()
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
        >
          <DownloadIcon size={16} /> {busy === 'backup' ? 'Creating…' : 'Create backup'}
        </button>
      </section>
    </div>
  )
}
