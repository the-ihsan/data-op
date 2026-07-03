import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, FileText, Loader2, Play, Square, Trash2 } from 'lucide-react'
import { recordApi } from '../../api/resources'
import type { Campaign, RecordRow, Stage } from '../../api/types'
import { Button } from '@/components/ui/button'

/** Context menu for record actions, rendered in a portal right beside the
 * cursor (opened via right-click on the row or the row's "…" button).
 * Stays put until the user clicks an action, clicks outside, presses Escape
 * or scrolls; failed actions keep it open and show the error inline. */
export function RowActionsMenu({
  campaign,
  record,
  nextStage,
  position,
  onClose,
  onDone,
  onDetails,
  onBeforeAdvance,
}: {
  campaign: Campaign
  record: RecordRow
  nextStage?: Stage
  position: { x: number; y: number }
  onClose: () => void
  onDone: () => void
  onDetails: () => void
  onBeforeAdvance?: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    left: position.x + 4,
    top: position.y + 4,
    visibility: 'hidden',
  })

  // Clamp to the viewport once the menu has been measured.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 8
    setStyle({
      position: 'fixed',
      left: Math.min(position.x + 4, window.innerWidth - width - pad),
      top: Math.min(position.y + 4, window.innerHeight - height - pad),
      visibility: 'visible',
    })
  }, [position])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const wrap = (name: string, fn: () => Promise<unknown>) => async () => {
    setPendingAction(name)
    setError(null)
    try {
      await fn()
      onDone()
      onClose()
    } catch (e) {
      setPendingAction(null)
      setError((e as Error).message)
    }
  }
  const processing = record.status === 'processing'
  const finished = record.status === 'finished'
  const busy = pendingAction !== null

  const markProcessing = wrap('processing', () => recordApi.markProcessing(campaign.id, record.id))
  const release = wrap('release', () => recordApi.release(campaign.id, record.id))
  const advance = wrap('advance', async () => {
    await onBeforeAdvance?.()
    await recordApi.advance(campaign.id, record.id)
  })
  const remove = () => {
    if (!window.confirm('Delete this record permanently?')) return
    void wrap('delete', () => recordApi.remove(campaign.id, record.id))()
  }

  return createPortal(
    <div ref={ref} style={style} className="z-50" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex min-w-44 flex-col gap-0.5 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
        {error && <div className="max-w-56 px-1 pb-1 text-[11px] text-destructive">{error}</div>}
        <Button variant="ghost" size="sm" className="justify-start" onClick={onDetails} disabled={busy}>
          <FileText /> Details
        </Button>
        <div className="my-0.5 h-px bg-border" />
        {!finished && (
          <>
            {processing ? (
              <Button variant="ghost" size="sm" className="justify-start" onClick={release} disabled={busy}>
                {pendingAction === 'release' ? <Loader2 className="animate-spin" /> : <Square />} Unmark processing
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="justify-start" onClick={markProcessing} disabled={busy}>
                {pendingAction === 'processing' ? <Loader2 className="animate-spin" /> : <Play />} Mark processing
              </Button>
            )}
            <Button variant="ghost" size="sm" className="justify-start" onClick={advance} disabled={busy}>
              {pendingAction === 'advance' ? <Loader2 className="animate-spin" /> : <ChevronRight />}
              {' '}{nextStage ? `Move to ${nextStage.name}` : 'Finish'}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-destructive hover:text-destructive"
          onClick={remove}
          disabled={busy}
        >
          {pendingAction === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
        </Button>
      </div>
    </div>,
    document.body,
  )
}
