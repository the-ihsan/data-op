import type { MutableRefObject } from 'react'
import { cn } from '@/lib/utils'
import type { RecordRow, StageField } from '../../api/types'

export type CellValues = Record<string, string[]>

/** Sentinel used for the "clear" option in single-select cells (Radix forbids ""). */
export const NONE = '__none__'

export const PER_PAGE = 50

/** Heartbeat: how often the visible grid page re-fetches records (ms).
 * React Query pauses the interval while the tab is in the background. */
export const HEARTBEAT_MS = 15_000

/** Build a per-stage {field_key: value[]} map from a record's stored values. */
export function valuesForStage(record: RecordRow, stageId: number): CellValues {
  const out: CellValues = {}
  for (const v of record.values ?? []) {
    if (v.stage_id !== stageId) continue
    const arr = out[v.field_key] ?? []
    arr[v.value_index] = v.value
    out[v.field_key] = arr
  }
  return out
}

export type RowSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

export function fieldValuesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

function fieldHasValue(arr: string[] | undefined): boolean {
  return (arr ?? []).some((v) => v.trim() !== '')
}

/** Error message when a required field is missing a non-blank value, or null.
 * Mirrors the backend's ValidateRequired message so pre-checks and 400s read the same. */
export function missingRequiredError(fields: StageField[], values: CellValues): string | null {
  const missing = fields.find((f) => f.required && !fieldHasValue(values[f.key]))
  return missing ? `field '${missing.label}' is required` : null
}

export function rowSaveStateClass(state: RowSaveState): string {
  const box = (border: string, extra = '') =>
    cn(
      border,
      '[&>td:first-child]:border-l [&>td:last-child]:border-r',
      extra,
    )
  switch (state) {
    case 'dirty':
      return box('[&>td]:border-y [&>td]:border-dashed [&>td]:border-amber-500/70')
    case 'saving':
      return box('[&>td]:border-y [&>td]:border-solid [&>td]:border-blue-400/50', '[&>td]:bg-blue-50/30 dark:[&>td]:bg-blue-950/20')
    case 'saved':
      return box('[&>td]:border-y [&>td]:border-solid [&>td]:border-green-500/60', '[&>td]:bg-green-50/30 dark:[&>td]:bg-green-950/20')
    case 'error':
      return box('[&>td]:border-y [&>td]:border-solid [&>td]:border-destructive/60', '[&>td]:bg-destructive/5')
    default:
      return ''
  }
}

export function focusNextEditableField(
  fields: StageField[],
  fieldRefs: MutableRefObject<Record<number, HTMLElement | null>>,
  fromIndex: number,
) {
  for (let i = fromIndex + 1; i < fields.length; i++) {
    const f = fields[i]
    if (f.prev_stage_key) continue
    fieldRefs.current[f.id]?.focus()
    return
  }
}
