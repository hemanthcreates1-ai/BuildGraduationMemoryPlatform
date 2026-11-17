'use client'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useCallback, useEffect, useRef, useState } from 'react'

import { INK_COLORS, JERSEY_BRUSH_SIZES_MM, JERSEY_TEXTURE_SIZE } from '@/lib/constants'
import { apiUpload, newSubmissionId } from '@/lib/client/api'
import { deleteDraft, loadDraft, saveDraft } from '@/lib/client/drafts'
import type { JerseyLayer } from '@/lib/server/data'

import { buildGarment } from './engine/geometry'
import { regionOfUV, type Region } from './engine/pattern'
import { useToast } from '../ui/Toast'
import {
  CheckIcon,
  EraserIcon,
  EyeIcon,
  HandIcon,
  RedoIcon,
  RotateIcon,
  UndoIcon,
} from '../ui/Icons'

type Point = { u: number; v: number; pressure: number }
type Stroke = {
  mode: 'ink' | 'erase'
  color: string
  size: number
  points: Point[]
}
type Draft = { submissionId: string; strokes: Stroke[] }

type Runtime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mesh: THREE.Mesh
  texture: THREE.CanvasTexture
  display: HTMLCanvasElement
  base: HTMLCanvasElement
  ink: HTMLCanvasElement
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  frame: number | null
}

function canvas(size = JERSEY_TEXTURE_SIZE) {
  const value = document.createElement('canvas')
  value.width = size
  value.height = size
  return value
}

function drawCottonBase(target: HTMLCanvasElement) {
  const ctx = target.getContext('2d')!
  ctx.fillStyle = '#f7f5f0'
  ctx.fillRect(0, 0, target.width, target.height)
  const image = ctx.getImageData(0, 0, target.width, target.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 5
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + noise))
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + noise))
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + noise))
  }
  ctx.putImageData(image, 0, 0)
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return
  ctx.save()
  ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const radius = Math.max(1, (stroke.size / 1000) * JERSEY_TEXTURE_SIZE * 1.4)
  for (let index = 0; index < stroke.points.length; index++) {
    const point = stroke.points[index]!
    const x = point.u * ctx.canvas.width
    const y = (1 - point.v) * ctx.canvas.height
    const width = radius * (0.65 + point.pressure * 0.7)
    if (index === 0) {
      ctx.beginPath()
      ctx.arc(x, y, width / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const previous = stroke.points[index - 1]!
    // UV islands are discontinuous. Never connect a line across a jump; the next sample starts
    // on the adjacent island, so the mark stays on fabric rather than streaking across the atlas.
    if (Math.hypot(point.u - previous.u, point.v - previous.v) > 0.12) {
      ctx.beginPath()
      ctx.arc(x, y, width / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.lineWidth = width
    ctx.moveTo(previous.u * ctx.canvas.width, (1 - previous.v) * ctx.canvas.height)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.restore()
}

function composite(runtime: Runtime) {
  const ctx = runtime.display.getContext('2d')!
  ctx.clearRect(0, 0, runtime.display.width, runtime.display.height)
  ctx.drawImage(runtime.base, 0, 0)
  ctx.drawImage(runtime.ink, 0, 0)
  runtime.texture.needsUpdate = true
  requestRender(runtime)
}

function requestRender(runtime: Runtime) {
  if (runtime.frame !== null) return
  runtime.frame = requestAnimationFrame(() => {
    runtime.frame = null
    runtime.renderer.render(runtime.scene, runtime.camera)
  })
}

async function loadLayers(runtime: Runtime, layers: JerseyLayer[]) {
  const ctx = runtime.base.getContext('2d')!
  for (const layer of layers) {
    try {
      const blob = await fetch(layer.url, { credentials: 'same-origin' }).then((response) => {
        if (!response.ok) throw new Error('layer')
        return response.blob()
      })
      const bitmap = await createImageBitmap(blob)
      ctx.drawImage(bitmap, 0, 0, JERSEY_TEXTURE_SIZE, JERSEY_TEXTURE_SIZE)
      bitmap.close()
      composite(runtime)
    } catch {
      // One unavailable moderated/corrupt layer does not prevent the jersey loading.
    }
  }
}

export function JerseyStudio({
  roll,
  layers: initialLayers,
}: {
  roll: string
  layers: JerseyLayer[]
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const redoRef = useRef<Stroke[]>([])
  const activeRef = useRef<Stroke | null>(null)
  const submissionRef = useRef(newSubmissionId())
  const regionsRef = useRef(new Set<Region>())
  const toast = useToast()
  const [mode, setMode] = useState<'inspect' | 'draw'>('inspect')
  const [color, setColor] = useState<(typeof INK_COLORS)[number]['hex']>('#1f1b18')
  const [size, setSize] = useState<number>(7)
  const [eraser, setEraser] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draftKey = `jersey:${roll}`

  const replay = useCallback(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const ctx = runtime.ink.getContext('2d')!
    ctx.clearRect(0, 0, runtime.ink.width, runtime.ink.height)
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke)
    composite(runtime)
    setUndoCount(strokesRef.current.length)
    setRedoCount(redoRef.current.length)
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2),
      )
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      renderer.shadowMap.enabled = !matchMedia('(pointer: coarse)').matches
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#eee9e0')
      const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10)
      camera.position.set(0, 0.42, 1.65)
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0.36, 0)
      controls.enableDamping = true
      controls.minDistance = 0.75
      controls.maxDistance = 2.8
      controls.minPolarAngle = 0.18
      controls.maxPolarAngle = Math.PI - 0.18

      const garment = buildGarment()
      const base = canvas()
      const ink = canvas()
      const display = canvas()
      drawCottonBase(base)
      display.getContext('2d')!.drawImage(base, 0, 0)
      const texture = new THREE.CanvasTexture(display)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      const fabric = new THREE.MeshPhysicalMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.91,
        metalness: 0,
        sheen: 0.6,
        sheenColor: new THREE.Color('#eee8df'),
        sheenRoughness: 0.82,
        side: THREE.DoubleSide,
      })
      const collar = fabric.clone()
      collar.roughness = 0.96
      const mesh = new THREE.Mesh(garment.geometry, [fabric, collar])
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.y = -0.02
      scene.add(mesh)

      scene.add(new THREE.HemisphereLight(0xfffbf5, 0x5c6470, 2.1))
      const key = new THREE.DirectionalLight(0xfff8ed, 3.7)
      key.position.set(1.8, 2.4, 2.4)
      key.castShadow = renderer.shadowMap.enabled
      key.shadow.mapSize.set(1024, 1024)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0xdce7ff, 2)
      rim.position.set(-2, 1.4, -2)
      scene.add(rim)
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(0.48, 64),
        new THREE.ShadowMaterial({ color: 0x5f5142, opacity: 0.18 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.035
      ground.receiveShadow = true
      scene.add(ground)

      const runtime: Runtime = {
        renderer,
        scene,
        camera,
        controls,
        mesh,
        texture,
        display,
        base,
        ink,
        raycaster: new THREE.Raycaster(),
        pointer: new THREE.Vector2(),
        frame: null,
      }
      runtimeRef.current = runtime
      // The garment is ready now. Existing contribution layers continue loading progressively
      // and must never hold the studio behind a blocking overlay.
      const resize = () => {
        const rect = mount.getBoundingClientRect()
        renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
        camera.aspect = rect.width / Math.max(1, rect.height)
        camera.updateProjectionMatrix()
        requestRender(runtime)
      }
      const observer = new ResizeObserver(resize)
      observer.observe(mount)
      controls.addEventListener('change', () => requestRender(runtime))
      const animateDamping = () => {
        if (disposed) return
        if (controls.enabled && controls.update()) requestRender(runtime)
        requestAnimationFrame(animateDamping)
      }
      animateDamping()
      resize()
      void loadLayers(runtime, initialLayers)
      loadDraft<Draft>(draftKey).then((draft) => {
        if (!draft || disposed) return
        submissionRef.current = draft.submissionId
        strokesRef.current = draft.strokes
        replay()
        if (draft.strokes.length) toast.show('Your unsent jersey drawing was restored.', 'info')
      })

      return () => {
        disposed = true
        observer.disconnect()
        controls.dispose()
        garment.geometry.dispose()
        garment.paintGeometry.dispose()
        fabric.dispose()
        collar.dispose()
        texture.dispose()
        renderer.dispose()
        renderer.domElement.remove()
        runtimeRef.current = null
      }
    } catch (cause) {
      console.error(cause)
      setError(
        'This device could not start the 3D garment studio. Try a current Chrome or Safari browser.',
      )
    }
  }, [draftKey, initialLayers, replay, toast])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (runtime) runtime.controls.enabled = mode === 'inspect'
  }, [mode])

  function hit(event: PointerEvent): Point | null {
    const runtime = runtimeRef.current
    if (!runtime) return null
    const rect = runtime.renderer.domElement.getBoundingClientRect()
    runtime.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera)
    const intersection = runtime.raycaster.intersectObject(runtime.mesh, false)[0]
    if (!intersection?.uv || !intersection.face) return null
    regionsRef.current.add(regionOfUV(intersection.uv.x, intersection.uv.y))
    return {
      u: intersection.uv.x,
      v: intersection.uv.y,
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.65,
    }
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'draw' || busy || event.button !== 0) return
    const point = hit(event.nativeEvent)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeRef.current = { mode: eraser ? 'erase' : 'ink', color, size, points: [point] }
    const runtime = runtimeRef.current!
    drawStroke(runtime.ink.getContext('2d')!, activeRef.current)
    composite(runtime)
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const stroke = activeRef.current
    if (!stroke || mode !== 'draw') return
    const point = hit(event.nativeEvent)
    if (!point) return
    const previous = stroke.points[stroke.points.length - 1]!
    if (Math.hypot(point.u - previous.u, point.v - previous.v) < 0.0015) return
    stroke.points.push(point)
    const runtime = runtimeRef.current!
    drawStroke(runtime.ink.getContext('2d')!, { ...stroke, points: [previous, point] })
    composite(runtime)
  }

  function pointerUp() {
    const stroke = activeRef.current
    if (!stroke) return
    activeRef.current = null
    strokesRef.current.push(stroke)
    redoRef.current = []
    setUndoCount(strokesRef.current.length)
    setRedoCount(0)
    saveDraft<Draft>(draftKey, { submissionId: submissionRef.current, strokes: strokesRef.current })
  }

  function view(angle: number) {
    const runtime = runtimeRef.current
    if (!runtime) return
    const distance = runtime.camera.position.distanceTo(runtime.controls.target)
    runtime.camera.position.set(Math.sin(angle) * distance, 0.42, Math.cos(angle) * distance)
    runtime.camera.lookAt(runtime.controls.target)
    runtime.controls.update()
    requestRender(runtime)
  }

  async function submit() {
    const runtime = runtimeRef.current
    if (!runtime || !strokesRef.current.length) return
    setBusy(true)
    setError(null)
    const blob = await new Promise<Blob | null>((resolve) =>
      runtime.ink.toBlob(resolve, 'image/png'),
    )
    if (!blob) {
      setBusy(false)
      setError('The drawing could not be prepared for upload.')
      return
    }
    const form = new FormData()
    form.set('file', new File([blob], 'jersey-layer.png', { type: 'image/png' }))
    form.set('submissionId', submissionRef.current)
    form.set('strokeCount', String(strokesRef.current.length))
    form.set(
      'inkColors',
      [...new Set(strokesRef.current.filter((s) => s.mode === 'ink').map((s) => s.color))].join(
        ',',
      ),
    )
    form.set('regions', [...regionsRef.current].join(','))
    const result = await apiUpload<{ layer: JerseyLayer }>(
      `/api/lj/jersey/${encodeURIComponent(roll)}/artworks`,
      form,
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const base = runtime.base.getContext('2d')!
    base.drawImage(runtime.ink, 0, 0)
    strokesRef.current = []
    redoRef.current = []
    regionsRef.current.clear()
    submissionRef.current = newSubmissionId()
    runtime.ink.getContext('2d')!.clearRect(0, 0, JERSEY_TEXTURE_SIZE, JERSEY_TEXTURE_SIZE)
    composite(runtime)
    setUndoCount(0)
    setRedoCount(0)
    await deleteDraft(draftKey)
    toast.show('Your drawing is now permanently part of this jersey.', 'success')
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-sand/70 bg-[#eee9e0] shadow-lift">
      <div
        className="relative h-[60vh] min-h-[31rem] max-h-[50rem]"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div
          ref={mountRef}
          className={`absolute inset-0 ${mode === 'draw' ? 'touch-none cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        />
        <div className="absolute left-4 top-4 flex rounded-full border border-white/60 bg-paper/85 p-1 shadow-paper backdrop-blur">
          <button
            type="button"
            onClick={() => setMode('inspect')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${mode === 'inspect' ? 'bg-ink text-paper' : 'text-ink-soft'}`}
          >
            <EyeIcon size={16} /> Inspect
          </button>
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${mode === 'draw' ? 'bg-ink text-paper' : 'text-ink-soft'}`}
          >
            <HandIcon size={16} /> Draw
          </button>
        </div>
        <div className="absolute right-4 top-4 flex gap-1 rounded-full bg-paper/85 p-1 shadow-paper backdrop-blur">
          {(
            [
              ['Front', 0],
              ['Right', Math.PI / 2],
              ['Back', Math.PI],
              ['Left', -Math.PI / 2],
            ] as const
          ).map(([label, angle]) => (
            <button
              key={label}
              type="button"
              onClick={() => view(angle)}
              className="rounded-full px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-linen"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-paper/80 px-4 py-2 text-xs text-muted backdrop-blur">
          {mode === 'inspect'
            ? 'Drag to rotate · pinch or scroll to zoom'
            : 'Draw directly on the fabric · camera locked'}
        </p>
      </div>

      {mode === 'draw' && (
        <div className="border-t border-sand/70 bg-paper p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="scrollbar-none flex max-w-full gap-2 overflow-x-auto py-1">
              {INK_COLORS.map((ink) => (
                <button
                  key={ink.hex}
                  type="button"
                  onClick={() => {
                    setColor(ink.hex)
                    setEraser(false)
                  }}
                  title={ink.name}
                  aria-label={ink.name}
                  aria-pressed={!eraser && color === ink.hex}
                  className={`h-8 w-8 shrink-0 rounded-full border-2 transition ${!eraser && color === ink.hex ? 'scale-110 border-ink' : 'border-white shadow-sm'}`}
                  style={{ backgroundColor: ink.hex }}
                />
              ))}
            </div>
            <div className="flex gap-1 rounded-full bg-linen p-1">
              {JERSEY_BRUSH_SIZES_MM.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSize(value)}
                  className={`grid h-9 w-9 place-items-center rounded-full text-xs ${size === value ? 'bg-paper shadow-paper' : 'text-muted'}`}
                  aria-label={`${value} millimetre marker`}
                  aria-pressed={size === value}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: Math.max(3, value * 0.7), height: Math.max(3, value * 0.7) }}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEraser((value) => !value)}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm ${eraser ? 'bg-blush text-rose-deep' : 'bg-linen text-ink-soft'}`}
            >
              <EraserIcon size={16} /> Eraser
            </button>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                disabled={!undoCount}
                onClick={() => {
                  const value = strokesRef.current.pop()
                  if (value) redoRef.current.push(value)
                  replay()
                }}
                className="rounded-full p-2.5 text-ink-soft hover:bg-linen disabled:opacity-30"
                aria-label="Undo"
              >
                <UndoIcon size={18} />
              </button>
              <button
                type="button"
                disabled={!redoCount}
                onClick={() => {
                  const value = redoRef.current.pop()
                  if (value) strokesRef.current.push(value)
                  replay()
                }}
                className="rounded-full p-2.5 text-ink-soft hover:bg-linen disabled:opacity-30"
                aria-label="Redo"
              >
                <RedoIcon size={18} />
              </button>
              <button
                type="button"
                disabled={!undoCount || busy}
                onClick={submit}
                className="ml-2 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40"
              >
                <CheckIcon size={16} /> {busy ? 'Submitting…' : 'Preview & submit'}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-blush px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <RotateIcon size={14} /> Once submitted, artwork is permanent and cannot be edited or
            deleted.
          </p>
        </div>
      )}
    </section>
  )
}
