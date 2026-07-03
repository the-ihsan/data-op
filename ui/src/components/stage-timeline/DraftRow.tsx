import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { recordApi } from '../../api/resources'
import { defaultValuesForFields, type Campaign, type StageField } from '../../api/types'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  focusNextEditableField,
  missingRequiredError,
  rowSaveStateClass,
  type CellValues,
  type RowSaveState,
} from './helpers'
import { GridCell } from './cells'

/** A permanently-present empty row; pressing Enter on the last field creates a new record. */
export function DraftRow({
  campaign,
  fields,
  onCreated,
}: {
  campaign: Campaign
  fields: StageField[]
  onCreated: () => void
}) {
  const qc = useQueryClient()
  const [local, setLocal] = useState<CellValues>(() => defaultValuesForFields(fields))
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const fieldRefs = useRef<Record<number, HTMLElement | null>>({})

  const create = useMutation({
    mutationFn: async (vals: CellValues) => {
      const rec = await recordApi.create(campaign.id)
      try {
        return await recordApi.saveValues(campaign.id, rec.id, vals)
      } catch (e) {
        // Roll back the just-created record so a failed save doesn't leave an
        // empty row behind; keep the draft values so the user can fix them.
        await recordApi.remove(campaign.id, rec.id).catch(() => {})
        throw e
      }
    },
    onSuccess: () => {
      setLocal(defaultValuesForFields(fields))
      setError(null)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 1500)
      onCreated()
      qc.invalidateQueries({ queryKey: ['records', campaign.id] })
    },
    onError: (e) => setError((e as Error).message),
  })

  const hasContent = (vals: CellValues) =>
    Object.values(vals).some((arr) => arr.some((v) => v && v.trim() !== ''))

  const commit = (vals: CellValues) => {
    // An untouched draft is a no-op; only validate once the user typed something.
    if (!hasContent(vals) || create.isPending) return
    const requiredError = missingRequiredError(fields, vals)
    if (requiredError) {
      setError(requiredError)
      return
    }
    create.mutate(vals)
  }

  const draftDirty = useMemo(() => hasContent(local), [local])

  const rowSaveState = useMemo((): RowSaveState => {
    if (error && draftDirty) return 'error'
    if (create.isPending && draftDirty) return 'saving'
    if (justSaved) return 'saved'
    if (draftDirty) return 'dirty'
    return 'clean'
  }, [error, draftDirty, create.isPending, justSaved])

  return (
    <TableRow className={cn('bg-primary/3', rowSaveStateClass(rowSaveState))}>
      <TableCell className="text-center text-muted-foreground">
        <Plus className="mx-auto size-4" />
      </TableCell>
      {fields.map((f, fieldIndex) => {
        const isLastEditable = !fields.slice(fieldIndex + 1).some((nf) => !nf.prev_stage_key)
        return (
          <TableCell key={f.id} className="p-1 align-middle">
            <GridCell
              field={f}
              value={local[f.key] ?? []}
              placeholder="New"
              inputRef={(el) => { fieldRefs.current[f.id] = el }}
              onEnter={() => {
                if (isLastEditable) commit(local)
                else focusNextEditableField(fields, fieldRefs, fieldIndex)
              }}
              onChange={(arr) => {
                setLocal((prev) => ({ ...prev, [f.key]: arr }))
              }}
              onCommit={() => commit(local)}
            />
          </TableCell>
        )
      })}
      <TableCell className="text-xs text-muted-foreground">
        {create.isPending ? (
          <span className="flex items-center gap-1">
            <Loader2 className="size-3.5 animate-spin" /> Adding
          </span>
        ) : (
          'New'
        )}
        {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
      </TableCell>
      <TableCell className="p-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full"
          disabled={!draftDirty || create.isPending}
          onClick={() => commit(local)}
        >
          {create.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Save
            </>
          ) : (
            'Save'
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}
