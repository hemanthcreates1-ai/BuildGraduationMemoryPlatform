'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'

import {
  MEMORY_PHOTO_MAX_BYTES,
  PHOTO_ACCEPT_ATTRIBUTE,
  polaroidFrameSize,
  WALL,
} from '@/lib/constants'
import { apiGet, apiJson, apiUpload, newSubmissionId } from '@/lib/client/api'
import type { WallPhoto } from '@/lib/server/data'

import { useToast } from '../ui/Toast'
import {
  CheckIcon,
  CloseIcon,
  ExpandIcon,
  MapIcon,
  MinusIcon,
  PhotoIcon,
  PlusIcon,
  RotateIcon,
  UploadIcon,
} from '../ui/Icons'

type View = { x: number; y: number; zoom: number }
type Drag =
  | {
      kind: 'pan'
      pointer: number
      sx: number
      sy: number
      view: View
      active: boolean
    }
  | {
      kind: 'photo'
      pointer: number
      id: string
      sx: number
      sy: number
      x: number
      y: number
      currentX: number
      currentY: number
      rotation: number
      zoom: number
      active: boolean
    }
  | {
      kind: 'photo-view'
      pointer: number
      id: string
      sx: number
      sy: number
      active: boolean
    }
type Pinch = {
  distance: number
  worldX: number
  worldY: number
  zoom: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const DRAG_THRESHOLD = 6

export function MemoryWall({ initial }: { initial: WallPhoto[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<Pinch | null>(null)
  const [photos, setPhotos] = useState(initial)
  const latest = [...initial].reverse().find((photo) => !photo.draft) ?? initial[initial.length - 1]
  const [view, setView] = useState<View>({
    x: latest?.x ?? WALL.width / 2,
    y: latest?.y ?? WALL.height / 2,
    zoom: 0.3,
  })
  const viewRef = useRef(view)
  viewRef.current = view
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const savingPhotoIdsRef = useRef(new Set<string>())
  const [savingPhotoIds, setSavingPhotoIds] = useState<Set<string>>(() => new Set())
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selected, setSelected] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewFrame, setPreviewFrame] = useState<{ width: number; height: number }>({
    width: WALL.frameWidth,
    height: WALL.frameHeight,
  })
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<WallPhoto | null>(null)
  const toast = useToast()

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const result = await apiGet<{ photos: WallPhoto[] }>('/api/lj/memories')
      if (result.ok) {
        setPhotos((current) => {
          const ownDrafts = current.filter((item) => item.draft)
          const published = result.photos.filter((item) => !item.draft)
          const returnedDrafts = result.photos.filter((item) => item.draft)
          const activeId = dragRef.current?.kind === 'photo' ? dragRef.current.id : null
          const drafts = (returnedDrafts.length ? returnedDrafts : ownDrafts).map((item) =>
            item.id === activeId
              ? (ownDrafts.find((draft) => draft.id === activeId) ?? item)
              : item,
          )
          return [...published, ...drafts]
        })
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const worldStyle = useMemo(
    () => ({
      width: WALL.width,
      height: WALL.height,
      transform: `translate(calc(50vw), calc(50vh)) scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)`,
      transformOrigin: '0 0',
    }),
    [view],
  )

  function zoomAt(nextZoom: (current: number) => number, clientX?: number, clientY?: number) {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const px = clientX ?? rect.left + rect.width / 2
    const py = clientY ?? rect.top + rect.height / 2
    setView((old) => {
      const zoom = clamp(nextZoom(old.zoom), 0.06, 2.2)
      const wx = old.x + (px - rect.left - rect.width / 2) / old.zoom
      const wy = old.y + (py - rect.top - rect.height / 2) / old.zoom
      return {
        zoom,
        x: clamp(wx - (px - rect.left - rect.width / 2) / zoom, 0, WALL.width),
        y: clamp(wy - (py - rect.top - rect.height / 2) / zoom, 0, WALL.height),
      }
    })
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    zoomAt((zoom) => zoom * Math.exp(-event.deltaY * 0.0014), event.clientX, event.clientY)
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const values = [...pointers.current.values()]
      const centerX = (values[0]!.x + values[1]!.x) / 2
      const centerY = (values[0]!.y + values[1]!.y) / 2
      const rect = event.currentTarget.getBoundingClientRect()
      const currentView = viewRef.current
      if (dragRef.current?.kind === 'photo' && dragRef.current.active) {
        const interrupted = dragRef.current
        setPhotos((items) =>
          items.map((item) =>
            item.id === interrupted.id ? { ...item, x: interrupted.x, y: interrupted.y } : item,
          ),
        )
      }
      pinchRef.current = {
        distance: Math.hypot(values[0]!.x - values[1]!.x, values[0]!.y - values[1]!.y),
        worldX: currentView.x + (centerX - rect.left - rect.width / 2) / currentView.zoom,
        worldY: currentView.y + (centerY - rect.top - rect.height / 2) / currentView.zoom,
        zoom: currentView.zoom,
      }
      dragRef.current = null
      for (const pointerId of pointers.current.keys()) {
        event.currentTarget.setPointerCapture(pointerId)
      }
      return
    }

    const target = event.target instanceof Element ? event.target : null
    const photoButton = target?.closest<HTMLButtonElement>('[data-wall-photo-id]')
    const photo = photoButton
      ? photos.find((item) => item.id === photoButton.dataset.wallPhotoId)
      : undefined
    if (photo) {
      setSelectedPhotoId(photo.id)
      event.currentTarget.setPointerCapture(event.pointerId)
      if (!photo.draft) {
        dragRef.current = {
          kind: 'photo-view',
          pointer: event.pointerId,
          id: photo.id,
          sx: event.clientX,
          sy: event.clientY,
          active: false,
        }
        return
      }
      if (savingPhotoIdsRef.current.has(photo.id)) return
      dragRef.current = {
        kind: 'photo',
        pointer: event.pointerId,
        id: photo.id,
        sx: event.clientX,
        sy: event.clientY,
        x: photo.x,
        y: photo.y,
        currentX: photo.x,
        currentY: photo.y,
        rotation: photo.rotation,
        zoom: viewRef.current.zoom,
        active: false,
      }
      return
    }

    setSelectedPhotoId(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'pan',
      pointer: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      view: viewRef.current,
      active: false,
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinchRef.current) {
      const values = [...pointers.current.values()]
      const distance = Math.hypot(values[0]!.x - values[1]!.x, values[0]!.y - values[1]!.y)
      const centerX = (values[0]!.x + values[1]!.x) / 2
      const centerY = (values[0]!.y + values[1]!.y) / 2
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const pinch = pinchRef.current
      const zoom = clamp(pinch.zoom * (distance / Math.max(1, pinch.distance)), 0.06, 2.2)
      setView({
        zoom,
        x: clamp(pinch.worldX - (centerX - rect.left - rect.width / 2) / zoom, 0, WALL.width),
        y: clamp(pinch.worldY - (centerY - rect.top - rect.height / 2) / zoom, 0, WALL.height),
      })
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    const dx = event.clientX - drag.sx
    const dy = event.clientY - drag.sy
    if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    drag.active = true
    if (drag.kind === 'pan') {
      setView({
        ...drag.view,
        x: clamp(drag.view.x - dx / drag.view.zoom, 0, WALL.width),
        y: clamp(drag.view.y - dy / drag.view.zoom, 0, WALL.height),
      })
    } else if (drag.kind === 'photo') {
      const x = clamp(drag.x + dx / drag.zoom, 0, WALL.width)
      const y = clamp(drag.y + dy / drag.zoom, 0, WALL.height)
      drag.currentX = x
      drag.currentY = y
      setPhotos((items) => items.map((item) => (item.id === drag.id ? { ...item, x, y } : item)))
    }
  }

  async function saveDraggedPhoto(drag: Extract<Drag, { kind: 'photo' }>) {
    savingPhotoIdsRef.current.add(drag.id)
    setSavingPhotoIds(new Set(savingPhotoIdsRef.current))
    try {
      const result = await apiJson<{ photo: WallPhoto }>(`/api/lj/memories/${drag.id}`, 'PATCH', {
        x: drag.currentX,
        y: drag.currentY,
        rotation: drag.rotation,
        publish: false,
      })
      if (!result.ok) {
        setPhotos((items) =>
          items.map((item) => (item.id === drag.id ? { ...item, x: drag.x, y: drag.y } : item)),
        )
        toast.show('That position could not be saved. The photograph was put back.', 'error')
        return
      }
      setPhotos((items) => items.map((item) => (item.id === drag.id ? result.photo : item)))
    } finally {
      savingPhotoIdsRef.current.delete(drag.id)
      setSavingPhotoIds(new Set(savingPhotoIdsRef.current))
    }
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, save: boolean) {
    const wasPinching = pinchRef.current !== null || pointers.current.size > 1
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) {
      pinchRef.current = null
    }
    if (wasPinching) {
      dragRef.current = null
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    dragRef.current = null
    if (drag.kind === 'photo-view') {
      if (save && !drag.active) {
        const photo = photos.find((item) => item.id === drag.id)
        if (photo) setLightbox(photo)
      }
      return
    }
    if (drag.kind !== 'photo' || !drag.active) return
    if (save) {
      void saveDraggedPhoto(drag)
    } else {
      setPhotos((items) =>
        items.map((item) => (item.id === drag.id ? { ...item, x: drag.x, y: drag.y } : item)),
      )
    }
  }

  function choose(file: File | undefined) {
    setError(null)
    if (!file) return
    const supportedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    const supportedName = /\.(?:jpe?g|png|webp)$/i.test(file.name)
    if (!supportedType && !supportedName) return setError('Choose a JPG, PNG or WebP photograph.')
    if (file.size > MEMORY_PHOTO_MAX_BYTES)
      return setError('This photograph is too large. Choose one up to 15 MB.')
    if (preview) URL.revokeObjectURL(preview)
    const objectURL = URL.createObjectURL(file)
    setSelected(file)
    setPreview(objectURL)
    const probe = new window.Image()
    probe.onload = () => setPreviewFrame(polaroidFrameSize(probe.naturalWidth, probe.naturalHeight))
    probe.src = objectURL
  }

  async function upload() {
    if (!selected) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.set('file', selected)
    form.set('submissionId', newSubmissionId())
    form.set('x', String(view.x))
    form.set('y', String(view.y))
    form.set('rotation', String((Math.random() - 0.5) * 8))
    form.set('clientOriginalBytes', String(selected.size))
    const result = await apiUpload<{ photo: WallPhoto }>('/api/lj/memories', form, setProgress)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setPhotos((items) => [...items.filter((item) => item.id !== result.photo.id), result.photo])
    setUploadOpen(false)
    setSelected(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setProgress(0)
    toast.show('Photo uploaded. Drag and rotate it, then pin it permanently.', 'success')
  }

  async function publish(photo: WallPhoto) {
    setBusy(true)
    const result = await apiJson<{ photo: WallPhoto }>(`/api/lj/memories/${photo.id}`, 'PATCH', {
      x: photo.x,
      y: photo.y,
      rotation: photo.rotation,
      publish: true,
    })
    setBusy(false)
    if (!result.ok) return toast.show(result.error, 'error')
    setPhotos((items) => items.map((item) => (item.id === photo.id ? result.photo : item)))
    toast.show('Your polaroid is pinned permanently.', 'success')
  }

  async function discard(photo: WallPhoto) {
    const result = await apiJson(`/api/lj/memories/${photo.id}`, 'DELETE')
    if (!result.ok) return toast.show(result.error, 'error')
    setPhotos((items) => items.filter((item) => item.id !== photo.id))
  }

  return (
    <div className="relative h-[calc(100dvh-7.2rem)] min-h-[32rem] overflow-hidden bg-beige md:h-[calc(100dvh-4.4rem)]">
      <div
        ref={viewportRef}
        onWheel={wheel}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(event) => finishPointer(event, true)}
        onPointerCancel={(event) => finishPointer(event, false)}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden plaster active:cursor-grabbing"
      >
        <div className="absolute left-0 top-0 will-change-transform" style={worldStyle}>
          <div className="pointer-events-none absolute inset-0 border-[20px] border-white/25" />
          <p className="pointer-events-none absolute left-[1200px] top-[700px] -rotate-6 font-hand text-[120px] text-rose-deep/20">
            remember when…
          </p>
          <p className="pointer-events-none absolute left-[11600px] top-[7600px] rotate-3 font-display text-[90px] text-ink/10">
            ONE SHARED HISTORY
          </p>
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              data-wall-photo-id={photo.id}
              onClick={(event) => {
                event.stopPropagation()
                setSelectedPhotoId(photo.id)
                if (event.detail === 0 && !photo.draft) setLightbox(photo)
              }}
              aria-pressed={selectedPhotoId === photo.id}
              className={`absolute origin-center rounded-sm bg-white p-[14px] pb-[44px] text-left shadow-polaroid transition-shadow hover:z-20 hover:shadow-lift ${photo.draft ? 'z-30 ring-[8px] ring-rose/60' : ''}`}
              style={{
                width: photo.w,
                height: photo.h,
                left: photo.x - photo.w / 2,
                top: photo.y - photo.h / 2,
                transform: `rotate(${photo.rotation}deg)`,
                zIndex: photo.draft ? 1000 : index + 1,
              }}
              aria-label={photo.draft ? 'Drag your draft photo' : `Open memory photo ${index + 1}`}
            >
              <span className="relative block h-full w-full overflow-hidden bg-white">
                <Image
                  src={photo.fullSrc ?? photo.src}
                  alt={`Batch memory ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 240px, 480px"
                  placeholder={photo.placeholder ? 'blur' : 'empty'}
                  blurDataURL={photo.placeholder ?? undefined}
                  className="object-contain"
                />
              </span>
              {photo.draft && (
                <span className="absolute inset-x-0 bottom-3 text-center font-hand text-[18px] text-rose-deep">
                  drag me
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-2xl border border-white/50 bg-paper/90 px-4 py-3 shadow-paper backdrop-blur">
          <p className="font-display text-lg text-ink">The Memory Wall</p>
          <p className="text-xs text-muted">
            {photos.filter((photo) => !photo.draft).length} pinned memories · pan anywhere
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper shadow-lift"
        >
          <UploadIcon size={17} /> Add a photograph
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1 rounded-full border border-white/50 bg-paper/90 p-1 shadow-paper backdrop-blur">
        <button
          type="button"
          onClick={() => zoomAt((zoom) => zoom / 1.25)}
          className="rounded-full p-2.5 hover:bg-linen"
          aria-label="Zoom out"
        >
          <MinusIcon size={17} />
        </button>
        <span className="min-w-14 text-center text-xs font-semibold text-muted">
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomAt((zoom) => zoom * 1.25)}
          className="rounded-full p-2.5 hover:bg-linen"
          aria-label="Zoom in"
        >
          <PlusIcon size={17} />
        </button>
        <button
          type="button"
          onClick={() => setView({ x: WALL.width / 2, y: WALL.height / 2, zoom: 0.07 })}
          className="rounded-full p-2.5 hover:bg-linen"
          aria-label="See whole wall"
        >
          <MapIcon size={17} />
        </button>
      </div>

      {photos
        .filter((photo) => photo.draft)
        .map((photo) => (
          <div
            key={`draft-controls-${photo.id}`}
            className="absolute bottom-4 right-4 z-50 w-[min(22rem,calc(100%-2rem))] rounded-[1.5rem] border border-rose/50 bg-paper p-4 shadow-lift"
          >
            <p className="font-display text-lg">Position your photograph</p>
            <p className="mt-1 text-xs text-muted">
              Drag it anywhere. Rotate it, then confirm; after that it cannot be moved or deleted.
            </p>
            <label className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted">
              <RotateIcon size={16} />
              <input
                type="range"
                min={-WALL.maxRotation}
                max={WALL.maxRotation}
                step="1"
                value={photo.rotation}
                onChange={(event) =>
                  setPhotos((items) =>
                    items.map((item) =>
                      item.id === photo.id
                        ? { ...item, rotation: Number(event.target.value) }
                        : item,
                    ),
                  )
                }
                className="flex-1 accent-rose-deep"
              />
              {Math.round(photo.rotation)}°
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => discard(photo)}
                className="rounded-full border border-sand px-4 py-2 text-xs font-semibold text-muted"
              >
                Discard draft
              </button>
              <button
                type="button"
                disabled={busy || savingPhotoIds.has(photo.id)}
                onClick={() => publish(photo)}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper disabled:opacity-50"
              >
                <CheckIcon size={14} />{' '}
                {savingPhotoIds.has(photo.id) ? 'Saving position…' : 'Pin permanently'}
              </button>
            </div>
          </div>
        ))}

      {uploadOpen && (
        <div
          className="absolute inset-0 z-[70] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Upload photograph"
        >
          <div className="w-full max-w-lg animate-pop rounded-[2rem] bg-paper p-6 shadow-lift sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-hand text-2xl text-rose-deep">add a memory</p>
                <h2 className="font-display text-2xl">Choose a photograph</h2>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-full p-2 text-muted hover:bg-linen"
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[12rem_1fr]">
              <div className="flex min-h-72 items-center justify-center">
                <div
                  className="relative overflow-hidden rounded-sm bg-white p-[10px] pb-[30px] shadow-polaroid"
                  style={{
                    width:
                      previewFrame.width *
                      Math.min(192 / previewFrame.width, 288 / previewFrame.height),
                    height:
                      previewFrame.height *
                      Math.min(192 / previewFrame.width, 288 / previewFrame.height),
                  }}
                >
                  {preview ? (
                    <span className="relative block h-full w-full overflow-hidden bg-white">
                      <Image
                        src={preview}
                        alt="Complete upload preview"
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </span>
                  ) : (
                    <div className="grid h-full place-items-center bg-linen text-muted">
                      <PhotoIcon size={40} />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm leading-relaxed text-ink-soft">
                  Your complete photo will be auto-oriented and placed in a Polaroid frame that
                  follows its original shape. Nothing is cropped or stretched.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-sand px-4 py-2.5 text-sm font-semibold">
                  <UploadIcon size={16} /> Choose JPG, PNG or WebP
                  <input
                    type="file"
                    accept={PHOTO_ACCEPT_ATTRIBUTE}
                    className="sr-only"
                    onChange={(event) => choose(event.target.files?.[0])}
                  />
                </label>
                <p className="mt-2 text-xs text-muted">Maximum 15 MB</p>
                {error && (
                  <p role="alert" className="mt-3 rounded-xl bg-blush px-3 py-2 text-sm">
                    {error}
                  </p>
                )}
                {busy && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-beige">
                    <div
                      className="h-full bg-rose-deep"
                      style={{ width: `${Math.max(4, progress * 100)}%` }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  disabled={!selected || busy}
                  onClick={upload}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper disabled:opacity-40"
                >
                  {busy ? 'Uploading…' : 'Upload & position'} <ExpandIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-ink/80 p-5 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label="Full photograph"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-full bg-paper/90 p-3 text-ink"
            aria-label="Close"
          >
            <CloseIcon size={20} />
          </button>
          <div className="relative h-[85vh] w-[90vw]" onClick={(event) => event.stopPropagation()}>
            <Image
              src={lightbox.fullSrc ?? lightbox.src}
              alt="Full batch memory"
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
