'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

import { PHOTO_ACCEPT_ATTRIBUTE, PHOTO_DIRECT_UPLOAD_MAX_BYTES } from '@/lib/constants'
import { apiUpload } from '@/lib/client/api'
import type { RosterEntry } from '@/lib/server/data'

import { useToast } from '../ui/Toast'
import { CheckIcon, PhotoIcon, RefreshIcon, UploadIcon } from '../ui/Icons'

type LoadedImage = {
  file: File
  src: string
  image: HTMLImageElement
  width: number
  height: number
}

const FRAME_W = 320
const FRAME_H = 400

export function ProfileEditor({
  initial,
  setup = false,
}: {
  initial: RosterEntry
  setup?: boolean
}) {
  const toast = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const [current, setCurrent] = useState(initial.photo)
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseDimensions = useCallback(() => {
    if (!loaded) return { w: FRAME_W, h: FRAME_H }
    const scale = Math.max(FRAME_W / loaded.width, FRAME_H / loaded.height)
    return { w: loaded.width * scale, h: loaded.height * scale }
  }, [loaded])

  const clampOffset = useCallback(
    (next: { x: number; y: number }, nextZoom = zoom) => {
      const base = baseDimensions()
      const maxX = Math.max(0, (base.w * nextZoom - FRAME_W) / 2)
      const maxY = Math.max(0, (base.h * nextZoom - FRAME_H) / 2)
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      }
    },
    [baseDimensions, zoom],
  )

  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return
    const base = baseDimensions()
    const w = base.w * zoom
    const h = base.h * zoom
    context.clearRect(0, 0, FRAME_W, FRAME_H)
    context.drawImage(
      loaded.image,
      (FRAME_W - w) / 2 + offset.x,
      (FRAME_H - h) / 2 + offset.y,
      w,
      h,
    )
  }, [baseDimensions, loaded, offset, zoom])

  useEffect(
    () => () => {
      if (loaded) URL.revokeObjectURL(loaded.src)
    },
    [loaded],
  )

  function choose(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPG, PNG or WebP photograph.')
      return
    }
    if (file.size > PHOTO_DIRECT_UPLOAD_MAX_BYTES) {
      setError('This photograph is too large. Please choose one under 4.4 MB.')
      return
    }
    const src = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      if (loaded) URL.revokeObjectURL(loaded.src)
      setLoaded({ file, src, image, width: image.naturalWidth, height: image.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    image.onerror = () => {
      URL.revokeObjectURL(src)
      setError('This photograph could not be read.')
    }
    image.src = src
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!loaded || busy) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    }
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    setOffset(
      clampOffset({
        x: drag.ox + event.clientX - drag.x,
        y: drag.oy + event.clientY - drag.y,
      }),
    )
  }

  function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null
  }

  async function save() {
    if (!loaded) return
    setBusy(true)
    setProgress(0)
    setError(null)
    const base = baseDimensions()
    const renderedW = base.w * zoom
    const renderedH = base.h * zoom
    const centerX = Math.max(0, Math.min(1, 0.5 - offset.x / renderedW))
    const centerY = Math.max(0, Math.min(1, 0.5 - offset.y / renderedH))
    const form = new FormData()
    form.set('file', loaded.file)
    form.set('centerX', String(centerX))
    form.set('centerY', String(centerY))
    form.set('zoom', String(zoom))
    // No roll number is sent: the server resolves the owner from the session.
    const result = await apiUpload<{ profile: RosterEntry }>('/api/lj/profile', form, setProgress)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCurrent(result.profile.photo)
    setLoaded(null)
    setProgress(0)
    toast.show(
      current ? 'Your profile photograph was replaced.' : 'Your profile is ready.',
      'success',
    )
    if (setup) window.location.assign('/')
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-[2rem] border border-sand/70 bg-paper p-5 shadow-paper sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-hand text-2xl text-rose-deep">
              {loaded ? 'crop & position' : 'your photograph'}
            </p>
            <h2 className="font-display text-2xl text-ink">
              {loaded
                ? 'Make it yours'
                : current
                  ? 'Current profile'
                  : 'Choose a profile photograph'}
            </h2>
          </div>
          <span className="rounded-full bg-blush px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-rose-deep">
            {initial.rollNumber}
          </span>
        </div>

        <div className="mx-auto mt-7 w-full max-w-[20rem]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border-[6px] border-white bg-linen shadow-polaroid">
            {loaded ? (
              <canvas
                ref={canvasRef}
                width={FRAME_W}
                height={FRAME_H}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                aria-label="Drag to reposition your photograph"
              />
            ) : current ? (
              <Image
                src={current.url}
                alt={`Portrait of ${initial.rollNumber}`}
                fill
                sizes="320px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted">
                <PhotoIcon size={42} />
                <p className="font-hand text-2xl">your face belongs here</p>
              </div>
            )}
            {loaded && (
              <>
                <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-white/50" />
                <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-dashed border-white/50" />
                <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-dashed border-white/50" />
                <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-dashed border-white/50" />
              </>
            )}
          </div>
          {loaded && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold tracking-[0.14em] text-muted">
                <span>ZOOM</span>
                <span>{zoom.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="0.05"
                value={zoom}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setZoom(next)
                  setOffset((value) => clampOffset(value, next))
                }}
                className="mt-2 w-full accent-rose-deep"
              />
              <p className="mt-2 text-center text-xs text-muted">
                Drag the photo to reposition it inside the frame.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-blush px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}
        {busy && (
          <div className="mt-5" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-beige">
              <div
                className="h-full rounded-full bg-rose-deep transition-[width]"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-muted">
              Uploading and optimizing… {Math.round(progress * 100)}%
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-sand bg-paper px-5 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-rose hover:text-ink">
            {current ? <RefreshIcon size={17} /> : <UploadIcon size={17} />}
            {current ? 'Choose replacement' : 'Choose photograph'}
            <input
              type="file"
              accept={PHOTO_ACCEPT_ATTRIBUTE}
              className="sr-only"
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </label>
          {loaded && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-paper disabled:opacity-60"
            >
              <CheckIcon size={17} />
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[1.5rem] border border-sand/70 bg-linen p-5 paper-grain">
          <p className="font-display text-xl text-ink">Private ownership</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            This page can update only the profile linked to your signed-in account. Your roll number
            is permanent and is never taken from the upload form.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-sand/70 bg-paper p-5 shadow-paper">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted">PHOTO TIPS</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
            <li>Use a clear photo where your face is visible.</li>
            <li>JPG, PNG and WebP are supported.</li>
            <li>The yearbook crop is 4:5 and saved in persistent storage.</li>
            <li>Your untouched original remains private to you and the administrator.</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
