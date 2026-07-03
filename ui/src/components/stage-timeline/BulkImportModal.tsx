import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { recordApi } from '../../api/resources'
import type { BulkImportResult, Campaign, Stage } from '../../api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { sortStageFields } from '@/lib/stageFields'

/** Modal for bulk-importing records into the first stage.
 * Each non-empty line becomes one record (one value per line for a single field;
 * CSV rows when the stage has multiple fields).
 * - Cannot be dismissed while import is in progress.
 * - Backdrop click and Escape are blocked when the textarea has content.
 * - After import, displays per-line results; failed lines can be retried. */
export function BulkImportModal({
  campaign,
  stage,
  open,
  onClose,
}: {
  campaign: Campaign
  stage: Stage
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const fields = useMemo(() => sortStageFields(stage.fields), [stage.fields])
  const isMultiField = fields.length > 1
  const field = fields[0]

  type Phase = 'edit' | 'importing' | 'done'
  const [phase, setPhase] = useState<Phase>('edit')
  const [text, setText] = useState('')
  const [result, setResult] = useState<BulkImportResult | null>(null)
  // Original lines submitted (parallel to result.failed[*].index)
  const [submittedLines, setSubmittedLines] = useState<string[]>([])

  // Reset state when modal opens.
  useEffect(() => {
    if (open) {
      setPhase('edit')
      setText('')
      setResult(null)
      setSubmittedLines([])
    }
  }, [open])

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const hasContent = lines.length > 0

  const blockClose = phase === 'importing' || (phase === 'edit' && hasContent)

  const handleInteractOutside = (e: Event) => {
    if (blockClose) e.preventDefault()
  }
  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    if (blockClose) e.preventDefault()
  }

  const handleImport = async () => {
    if (lines.length === 0 || phase === 'importing') return
    setPhase('importing')
    setSubmittedLines(lines)
    try {
      const res = await recordApi.bulkImport(campaign.id, lines)
      setResult(res)
      setPhase('done')
      qc.invalidateQueries({ queryKey: ['records', campaign.id] })
    } catch (e) {
      // Unexpected top-level error (auth, network, etc.)
      setResult({ succeeded: 0, failed: lines.map((_, i) => ({ index: i, error: (e as Error).message })) })
      setPhase('done')
    }
  }

  const handleRetryFailed = () => {
    if (!result) return
    const failed = result.failed ?? []
    const failedLines = failed.map((f) => submittedLines[f.index]).filter(Boolean)
    setText(failedLines.join('\n'))
    setResult(null)
    setPhase('edit')
  }

  const failedEntries = result?.failed ?? []
  const allSucceeded = result != null && failedEntries.length === 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !blockClose) onClose() }}>
      <DialogContent
        className="max-w-lg"
        showCloseButton={phase !== 'importing'}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Bulk Add — {stage.name}</DialogTitle>
          {phase === 'edit' && (
            <DialogDescription>
              {isMultiField ? (
                <>
                  Paste CSV lines, one record per line. Each non-empty line creates a new record.
                </>
              ) : (
                <>
                  Paste entries for{' '}
                  <span className="font-medium text-foreground">
                    {field?.label ?? 'the field'}
                    {field?.required && <span className="text-destructive">*</span>}
                  </span>
                  , one per line. Each non-empty line creates a new record.
                </>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ---- Edit phase ---- */}
        {(phase === 'edit' || phase === 'importing') && (
          <div className="flex flex-col gap-2">
            {phase === 'edit' && isMultiField && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Column order: </span>
                {fields.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 && ', '}
                    <span className="font-medium text-foreground">
                      {f.label}
                      {f.required && <span className="text-destructive">*</span>}
                    </span>
                  </span>
                ))}
                <p className="mt-1">
                  Use semicolons within a cell for multiselect or repeatable fields.
                </p>
              </div>
            )}
            <textarea
              className="min-h-48 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={
                isMultiField
                  ? `${fields.map((f) => f.label).join(', ')}\n(one CSV row per line…)`
                  : `One ${field?.label ?? 'value'} per line…`
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase === 'importing'}
              autoFocus
            />
            {phase === 'edit' && lines.length > 0 && (
              <p className="text-xs text-muted-foreground">{lines.length} {lines.length === 1 ? 'entry' : 'entries'} detected</p>
            )}
            {phase === 'importing' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Importing {submittedLines.length} {submittedLines.length === 1 ? 'entry' : 'entries'}…
              </div>
            )}
          </div>
        )}

        {/* ---- Done phase ---- */}
        {phase === 'done' && result && (
          <div className="flex flex-col gap-3">
            {/* Summary banner */}
            <div className={cn(
              'flex items-start gap-2 rounded-md border p-3 text-sm',
              allSucceeded
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
            )}>
              {allSucceeded
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
              <span>
                {result.succeeded > 0 && (
                  <><strong>{result.succeeded}</strong> {result.succeeded === 1 ? 'entry' : 'entries'} added successfully{failedEntries.length > 0 ? '; ' : '.'}</>
                )}
                {failedEntries.length > 0 && (
                  <><strong>{failedEntries.length}</strong> {failedEntries.length === 1 ? 'entry' : 'entries'} failed.</>
                )}
              </span>
            </div>

            {/* Failed entries list */}
            {failedEntries.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border">
                <div className="border-b bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Failed entries
                </div>
                <ul className="max-h-48 overflow-y-auto divide-y">
                  {failedEntries.map((f) => (
                    <li key={f.index} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-mono text-destructive">
                        #{f.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{submittedLines[f.index]}</p>
                        <p className="text-xs text-muted-foreground">{f.error}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'edit' && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={lines.length === 0}>
                Import {lines.length > 0 && `${lines.length} ${lines.length === 1 ? 'entry' : 'entries'}`}
              </Button>
            </>
          )}
          {phase === 'importing' && (
            <Button disabled>
              <Loader2 className="animate-spin" /> Importing…
            </Button>
          )}
          {phase === 'done' && (
            <>
              {result && failedEntries.length > 0 && (
                <Button variant="outline" onClick={handleRetryFailed}>
                  Edit failed entries
                </Button>
              )}
              <Button onClick={onClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
