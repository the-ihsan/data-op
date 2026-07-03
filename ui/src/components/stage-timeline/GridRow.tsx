import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, MoreHorizontal } from 'lucide-react'
import { recordApi } from '../../api/resources'
import type { Campaign, RecordRow, Stage, StageField } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  fieldValuesEqual,
  focusNextEditableField,
  missingRequiredError,
  rowSaveStateClass,
  valuesForStage,
  type CellValues,
  type RowSaveState,
} from './helpers'
import { GridCell } from './cells'
import { StatusBadge } from './StatusBadge'
import { RowActionsMenu } from './RowActionsMenu'
import { RecordDetailsModal } from './RecordDetailsModal'

export function GridRow({
  campaign,
  stage,
  nextStage,
  fields,
  record,
  orderedStages,
}: {
  campaign: Campaign
  stage: Stage
  nextStage?: Stage
  fields: StageField[]
  record: RecordRow
  orderedStages: Stage[]
}) {
  const qc = useQueryClient()
  const uid = useAuth().user?.id
  const savedValues = useMemo(() => valuesForStage(record, stage.id), [record, stage.id])
  const [local, setLocal] = useState<CellValues>(() => savedValues)
  const [savedSnapshot, setSavedSnapshot] = useState<CellValues>(() => savedValues)
  // Server values that arrived (via heartbeat refetch) for fields the user is
  // currently editing; surfaced as a per-field "apply" notice instead of
  // overwriting their input.
  const [pendingUpdates, setPendingUpdates] = useState<CellValues>({})
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const fieldRefs = useRef<Record<number, HTMLElement | null>>({})

  const openMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const isFieldFocused = (f: StageField) => {
    const el = fieldRefs.current[f.id]
    const active = document.activeElement
    return !!el && !!active && (el === active || el.contains(active))
  }

  // Reconcile refetched server state (heartbeat or invalidation) without
  // disturbing the user: fields they haven't touched update silently; fields
  // with unsaved edits (or the field they're focused in) keep the local value
  // and get a pending "apply" notice instead. The snapshot only moves once a
  // field is reconciled, so an untouched-but-focused field never turns dirty
  // and can't save stale data on blur.
  useEffect(() => {
    const nextLocal = { ...local }
    const nextSnapshot = { ...savedSnapshot }
    const nextPending = { ...pendingUpdates }
    let localChanged = false
    let snapshotChanged = false
    let pendingChanged = false

    for (const f of fields) {
      const server = savedValues[f.key] ?? []
      const snap = savedSnapshot[f.key] ?? []
      const loc = local[f.key] ?? []

      if (fieldValuesEqual(server, snap)) {
        // Server hasn't moved since we last reconciled (or reverted back).
        if (nextPending[f.key]) {
          delete nextPending[f.key]
          pendingChanged = true
        }
        continue
      }

      if (fieldValuesEqual(loc, snap) && !isFieldFocused(f)) {
        // Untouched and not being edited: apply silently.
        nextLocal[f.key] = server
        nextSnapshot[f.key] = server
        localChanged = true
        snapshotChanged = true
        if (nextPending[f.key]) {
          delete nextPending[f.key]
          pendingChanged = true
        }
      } else if (fieldValuesEqual(loc, server)) {
        // Local edits already match the server value: just reconcile.
        nextSnapshot[f.key] = server
        snapshotChanged = true
        if (nextPending[f.key]) {
          delete nextPending[f.key]
          pendingChanged = true
        }
      } else {
        // User has (or is making) a conflicting edit: offer the update.
        nextPending[f.key] = server
        pendingChanged = true
      }
    }

    if (localChanged) setLocal(nextLocal)
    if (snapshotChanged) setSavedSnapshot(nextSnapshot)
    if (pendingChanged) setPendingUpdates(nextPending)
    // Reconciliation must only re-run when fresh server data arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedValues])

  const applyPendingUpdate = (key: string) => {
    const server = pendingUpdates[key]
    if (!server) return
    setLocal((prev) => ({ ...prev, [key]: server }))
    setSavedSnapshot((prev) => ({ ...prev, [key]: server }))
    setPendingUpdates((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const rowDirty = useMemo(
    () => fields.some((f) => !f.prev_stage_key && !fieldValuesEqual(local[f.key], savedSnapshot[f.key])),
    [fields, local, savedSnapshot],
  )

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['records', campaign.id] })
  }

  const save = useMutation({
    mutationFn: (vals: CellValues) => recordApi.saveValues(campaign.id, record.id, vals),
    onSuccess: (_data, vals) => {
      setError(null)
      setSavedSnapshot(vals)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1500)
      invalidate()
    },
    onError: (e) => setError((e as Error).message),
  })

  // Partial data saves fine on an existing record at its current stage;
  // required fields are only enforced on create and advance.
  const setCell = (key: string, arr: string[], commit = false) => {
    const next = { ...local, [key]: arr }
    setLocal(next)
    if (commit) save.mutate(next)
  }

  const commitRow = () => {
    if (rowDirty && !save.isPending && !disabled) save.mutate(local)
  }

  const rowSaveState = useMemo((): RowSaveState => {
    if (error && rowDirty) return 'error'
    if (save.isPending && rowDirty) return 'saving'
    if (justSaved) return 'saved'
    if (rowDirty) return 'dirty'
    return 'clean'
  }, [error, rowDirty, save.isPending, justSaved])

  const finished = record.status === 'finished'
  const lockedByOther = !campaign.allow_concurrent_edit && record.locked_by != null && record.locked_by !== uid
  const disabled = finished || lockedByOther

  return (
    <TableRow className={cn('group relative', rowSaveStateClass(rowSaveState))} onContextMenu={openMenu}>
      <TableCell className="text-center text-xs text-muted-foreground">{record.id}</TableCell>
      {fields.map((f, fieldIndex) => {
        const inherited = f.prev_stage_key !== ''
        const isLastEditable = !fields.slice(fieldIndex + 1).some((nf) => !nf.prev_stage_key)
        return (
          <TableCell
            key={f.id}
            className={cn('p-1 align-middle', inherited && 'bg-muted/40')}
            title={inherited ? `Inherited from previous stage (${f.prev_stage_key})` : undefined}
          >
            {inherited ? (
              <span className="block truncate px-2 py-1.5 text-sm text-muted-foreground">
                {(local[f.key] ?? []).join(', ')}
              </span>
            ) : (
              <>
                <GridCell
                  field={f}
                  value={local[f.key] ?? []}
                  disabled={disabled}
                  saveOnBlur
                  inputRef={(el) => { fieldRefs.current[f.id] = el }}
                  onEnter={() => {
                    if (isLastEditable) commitRow()
                    else focusNextEditableField(fields, fieldRefs, fieldIndex)
                  }}
                  onChange={(arr, commit) => setCell(f.key, arr, commit)}
                  onCommit={commitRow}
                />
                {pendingUpdates[f.key] && (
                  <div className="px-2 pb-0.5 text-[11px] leading-tight text-amber-600 dark:text-amber-500">
                    This field has new update{' '}
                    <button
                      type="button"
                      className="cursor-pointer font-medium underline underline-offset-2"
                      title={`Replace with: ${pendingUpdates[f.key].join(', ') || '(empty)'}`}
                      // Runs before the input's blur commit; keep mouse focus
                      // from triggering a save of the value we're replacing.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyPendingUpdate(f.key)}
                    >
                      apply
                    </button>
                  </div>
                )}
              </>
            )}
          </TableCell>
        )
      })}
      <TableCell>
        <StatusBadge status={record.status} locked={lockedByOther} />
        {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
      </TableCell>
      <TableCell className="p-0">
        <button
          className="mx-auto flex size-7 items-center justify-center rounded hover:bg-muted"
          title="Record actions"
          onClick={openMenu}
          disabled={save.isPending}
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : record.status === 'finished' ? (
            <Check className="size-4 text-muted-foreground" />
          ) : (
            <MoreHorizontal className="size-4 text-muted-foreground/60" />
          )}
        </button>
        {menuPos && (
          <RowActionsMenu
            campaign={campaign}
            record={record}
            nextStage={nextStage}
            position={menuPos}
            onClose={() => setMenuPos(null)}
            onDone={invalidate}
            onDetails={() => { setMenuPos(null); setDetailsOpen(true) }}
            onBeforeAdvance={async () => {
              // Persist any unsaved edits first (partial data is allowed), then
              // block the advance client-side if required fields are missing —
              // the backend re-checks on advance either way.
              if (rowDirty && !disabled) {
                await recordApi.saveValues(campaign.id, record.id, local)
                setSavedSnapshot(local)
                setError(null)
              }
              const requiredError = missingRequiredError(fields, local)
              if (requiredError) throw new Error(requiredError)
            }}
          />
        )}
        <RecordDetailsModal
          campaign={campaign}
          record={record}
          orderedStages={orderedStages}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
        />
      </TableCell>
    </TableRow>
  )
}
