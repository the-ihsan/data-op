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
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const fieldRefs = useRef<Record<number, HTMLElement | null>>({})

  const openMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  // Re-sync when the record changes underneath us (e.g. after advance/refetch).
  useEffect(() => {
    setLocal(savedValues)
    setSavedSnapshot(savedValues)
    setJustSaved(false)
  }, [savedValues])

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
