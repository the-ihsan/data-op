import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Lock,
  MoreHorizontal,
  Play,
  Plus,
  ShieldAlert,
  Square,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'
import { recordApi, stageApi } from '../api/resources'
import { parseFieldKeys, parseOptions, defaultValuesForFields, type BulkImportResult, type Campaign, type RecordRow, type RecordTransitionEntry, type Stage, type StageField, type StageUniqueConstraint } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

type CellValues = Record<string, string[]>

/** Sentinel used for the "clear" option in single-select cells (Radix forbids ""). */
const NONE = '__none__'

/** Build a per-stage {field_key: value[]} map from a record's stored values. */
function valuesForStage(record: RecordRow, stageId: number): CellValues {
  const out: CellValues = {}
  for (const v of record.values ?? []) {
    if (v.stage_id !== stageId) continue
    const arr = out[v.field_key] ?? []
    arr[v.value_index] = v.value
    out[v.field_key] = arr
  }
  return out
}

type RowSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

function fieldValuesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

export default function StageTimeline({
  campaign,
  onAddFields,
}: {
  campaign: Campaign
  onAddFields: () => void
}) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [mineOnly, setMineOnly] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'processing'>('all')
  const [selectedTotal, setSelectedTotal] = useState(0)
  const [bulkOpen, setBulkOpen] = useState(false)

  const { data: stages } = useQuery({
    queryKey: ['stages', campaign.id],
    queryFn: () => stageApi.list(campaign.id),
  })

  const orderedStages = useMemo(
    () => [...(stages ?? [])].sort((a, b) => a.position - b.position),
    [stages],
  )

  // Default the selection to the first stage once stages load.
  useEffect(() => {
    if (selectedStageId == null && orderedStages.length > 0) {
      setSelectedStageId(orderedStages[0].id)
    }
  }, [orderedStages, selectedStageId])

  const handleTotalChange = useCallback((total: number) => setSelectedTotal(total), [])

  if (!stages) return <p className="muted">Loading</p>
  if (orderedStages.length === 0) {
    return (
      <div className="notice">
        Define at least one stage before collecting records (see “Stages & Fields”).
      </div>
    )
  }

  const selectedStage = orderedStages.find((s) => s.id === selectedStageId) ?? orderedStages[0]
  const selectedIndex = orderedStages.findIndex((s) => s.id === selectedStage.id)
  const nextStage = orderedStages[selectedIndex + 1]
  const isFirstStage = selectedIndex === 0
  const firstStageFieldCount = (selectedStage.fields ?? []).length
  const showBulkAdd = isFirstStage && firstStageFieldCount > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Timeline */}
      <div className="flex shrink-0 items-center overflow-x-auto pb-2">
        {orderedStages.map((stage, i) => {
          const active = stage.id === selectedStage.id
          return (
            <div key={stage.id} className="flex items-center">
              <button
                onClick={() => setSelectedStageId(stage.id)}
                className={cn(
                  'flex min-w-36 items-center gap-2 rounded-lg border px-4 py-3 text-left transition-colors',
                  active
                    ? 'border-primary bg-accent shadow-sm'
                    : 'border-border bg-card hover:border-muted-foreground/40',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate text-sm font-semibold text-foreground">{stage.name}</span>
              </button>
              {i < orderedStages.length - 1 && (
                <ChevronRight className="mx-1 size-5 shrink-0 text-muted-foreground/50" />
              )}
            </div>
          )
        })}
      </div>

      {/* Grid toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <h3 className="m-0 text-base font-semibold text-foreground">{selectedStage.name}</h3>
        <Badge variant="secondary">{selectedTotal}</Badge>
        <div className="flex-1" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger size="sm" className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={mineOnly ? 'mine' : 'all'} onValueChange={(v) => setMineOnly(v === 'mine')}>
          <SelectTrigger size="sm" className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My data</SelectItem>
            <SelectItem value="all">All data</SelectItem>
          </SelectContent>
        </Select>
        {showBulkAdd && (
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <Upload /> Bulk Add
          </Button>
        )}
      </div>

      {showBulkAdd && (
        <BulkImportModal
          campaign={campaign}
          stage={selectedStage}
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
        />
      )}

      <StageGrid
        campaign={campaign}
        stage={selectedStage}
        nextStage={nextStage}
        isFirstStage={selectedIndex === 0}
        mineOnly={mineOnly}
        statusFilter={statusFilter}
        orderedStages={orderedStages}
        onTotalChange={handleTotalChange}
        onAddFields={onAddFields}
      />
    </div>
  )
}

const PER_PAGE = 50

function StageGrid({
  campaign,
  stage,
  nextStage,
  isFirstStage,
  mineOnly,
  statusFilter,
  orderedStages,
  onTotalChange,
  onAddFields,
}: {
  campaign: Campaign
  stage: Stage
  nextStage?: Stage
  isFirstStage: boolean
  mineOnly: boolean
  statusFilter: 'all' | 'open' | 'processing'
  orderedStages: Stage[]
  onTotalChange: (total: number) => void
  onAddFields: () => void
}) {
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever the viewed stage, mine-filter, or status-filter changes.
  useEffect(() => { setPage(1) }, [stage.id, mineOnly, statusFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['records', campaign.id, stage.id, mineOnly, statusFilter, page],
    queryFn: () =>
      recordApi.list(campaign.id, {
        stage: stage.id,
        mine: mineOnly || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        per_page: PER_PAGE,
      }),
    placeholderData: (prev) => prev,
  })

  const records = data?.records ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  // Keep the toolbar badge in sync with the live total.
  useEffect(() => { onTotalChange(total) }, [total, onTotalChange])

  const fields = useMemo(() => sortStageFields(stage.fields), [stage.fields])

  // Called by DraftRow on successful record creation; navigates to the last page
  // so the new row is immediately visible above the draft row.
  const gotoLastPage = useCallback(() => {
    setPage(Math.max(1, Math.ceil((total + 1) / PER_PAGE)))
  }, [total])

  if (fields.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 basis-0 items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          This stage has no fields yet. Add columns to start collecting data.
        </p>
        <Button size="sm" onClick={onAddFields}>
          <Plus /> Add fields
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-lg border">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-14 text-center">#</TableHead>
              {fields.map((f) => (
                <TableHead key={f.id} className="min-w-40 whitespace-nowrap">
                  {f.label}
                  {f.required && <span className="ml-1 text-destructive">*</span>}
                </TableHead>
              ))}
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <GridRow
                key={record.id}
                campaign={campaign}
                stage={stage}
                nextStage={nextStage}
                fields={fields}
                record={record}
                orderedStages={orderedStages}
              />
            ))}

            {isFirstStage && <DraftRow campaign={campaign} fields={fields} onCreated={gotoLastPage} />}

            {records.length === 0 && !isFirstStage && (
              <TableRow>
                <TableCell colSpan={fields.length + 3} className="py-6 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Loading' : 'No records at this stage yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer — only rendered when there is more than one page */}
      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex size-7 items-center justify-center rounded border hover:bg-muted disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex size-7 items-center justify-center rounded border hover:bg-muted disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function rowSaveStateClass(state: RowSaveState): string {
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

function focusNextEditableField(
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

function GridRow({
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

/** A permanently-present empty row; pressing Enter on the last field creates a new record. */
function DraftRow({
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
    if (hasContent(vals) && !create.isPending) create.mutate(vals)
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

function GridCell({
  field,
  value,
  disabled,
  placeholder,
  saveOnBlur,
  inputRef,
  onEnter,
  onChange,
  onCommit,
}: {
  field: StageField
  value: string[]
  disabled?: boolean
  placeholder?: string
  saveOnBlur?: boolean
  inputRef?: (el: HTMLElement | null) => void
  onEnter?: () => void
  onChange: (value: string[], commit?: boolean) => void
  onCommit: () => void
}) {
  const options = parseOptions(field)
  const first = value[0] ?? ''
  // Preserve any additional repeatable entries when editing the first cell inline.
  const setFirst = (v: string) => {
    const rest = value.slice(1)
    onChange(v === '' && rest.length === 0 ? [] : [v, ...rest])
  }

  // Repeatable scalar fields (max_count 0 = unlimited, or > 1) get a popover
  // editor so every entry can be added, edited and removed.
  if (field.max_count !== 1 && !['select', 'multiselect', 'boolean'].includes(field.type)) {
    return (
      <MultiEntryCell
        field={field}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={onChange}
        onCommit={onCommit}
      />
    )
  }

  switch (field.type) {
    case 'boolean':
      return (
        <input
          ref={inputRef as (el: HTMLInputElement | null) => void}
          type="checkbox"
          className="mx-2 size-4 accent-primary"
          disabled={disabled}
          checked={first === 'true'}
          onChange={(e) => onChange([e.target.checked ? 'true' : 'false'], true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter?.()
            }
          }}
        />
      )
    case 'select':
      return (
        <Select
          disabled={disabled}
          value={first === '' ? NONE : first}
          onValueChange={(v) => onChange(v === NONE ? [] : [v], true)}
        >
          <SelectTrigger
            ref={inputRef as (el: HTMLButtonElement | null) => void}
            size="sm"
            className="w-full border-transparent bg-transparent shadow-none hover:bg-muted focus:bg-card"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onEnter?.()
              }
            }}
          >
            <SelectValue placeholder={placeholder ?? '—'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'multiselect':
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              ref={inputRef as (el: HTMLButtonElement | null) => void}
              className="w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onEnter?.()
                }
              }}
            >
              {value.length ? value.join(', ') : <span className="text-muted-foreground">{placeholder ?? '—'}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o}
                checked={value.includes(o)}
                onCheckedChange={(checked) => {
                  const next = checked ? [...value, o] : value.filter((x) => x !== o)
                  onChange(next, true)
                }}
              >
                {o}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    case 'number':
      return (
        <CellInput type="number" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
    case 'date':
      return (
        <CellInput type="date" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
    default:
      return (
        <CellInput type="text" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
  }
}

/** Popover editor for repeatable fields: one input per entry, add/remove rows.
 * Values are saved when the popover closes. */
function MultiEntryCell({
  field,
  value,
  disabled,
  placeholder,
  onChange,
  onCommit,
}: {
  field: StageField
  value: string[]
  disabled?: boolean
  placeholder?: string
  onChange: (value: string[]) => void
  onCommit: () => void
}) {
  const [open, setOpen] = useState(false)
  const entries = value.length > 0 ? value : ['']
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
  const limit = field.max_count // 0 = unlimited
  const canAdd = limit === 0 || entries.length < limit
  const filled = value.filter((v) => v.trim() !== '')

  const setEntry = (i: number, v: string) => {
    const next = [...entries]
    next[i] = v
    onChange(next)
  }
  const removeEntry = (i: number) => {
    onChange(entries.filter((_, j) => j !== i))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) onCommit()
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          className="flex h-8 w-full items-center gap-1 rounded px-2 text-left text-sm hover:bg-muted disabled:opacity-50"
          disabled={disabled}
        >
          <span className="min-w-0 flex-1 truncate">
            {filled.length > 0 ? (
              filled.join(', ')
            ) : (
              <span className="text-muted-foreground">{placeholder ?? '—'}</span>
            )}
          </span>
          {filled.length > 1 && (
            <Badge variant="secondary" className="shrink-0">
              {filled.length}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex flex-col gap-1.5">
          {entries.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                type={inputType}
                value={v}
                autoFocus={i === entries.length - 1}
                placeholder={`Entry ${i + 1}`}
                onChange={(e) => setEntry(i, e.target.value)}
                className="h-8"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={() => removeEntry(i)}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => onChange([...entries, ''])}>
            <Plus /> Add entry{limit > 0 && ` (${entries.length}/${limit})`}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CellInput({
  type,
  value,
  disabled,
  placeholder,
  saveOnBlur,
  inputRef,
  onEnter,
  onChange,
  onCommit,
}: {
  type: string
  value: string
  disabled?: boolean
  placeholder?: string
  saveOnBlur?: boolean
  inputRef?: (el: HTMLElement | null) => void
  onEnter?: () => void
  onChange: (v: string) => void
  onCommit: () => void
}) {
  return (
    <Input
      ref={inputRef as (el: HTMLInputElement | null) => void}
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={saveOnBlur ? onCommit : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (onEnter) onEnter()
          else onCommit()
        }
      }}
      className="h-8 border-transparent bg-transparent shadow-none hover:bg-muted focus-visible:bg-card focus-visible:ring-1"
    />
  )
}

/** Modal showing all field values for a record across every stage it has passed through,
 * plus the full activity trail with the users who worked on it. */
function RecordDetailsModal({
  campaign,
  record,
  orderedStages,
  open,
  onClose,
}: {
  campaign: Campaign
  record: RecordRow
  orderedStages: Stage[]
  open: boolean
  onClose: () => void
}) {
  const stagesWithData = useMemo(() => {
    const stageIdsWithValues = new Set((record.values ?? []).map((v) => v.stage_id))
    return orderedStages.filter((s) => stageIdsWithValues.has(s.id))
  }, [record.values, orderedStages])

  const currentStageIndex = orderedStages.findIndex((s) => s.id === record.current_stage_id)

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['record-history', campaign.id, record.id],
    queryFn: () => recordApi.history(campaign.id, record.id),
    enabled: open,
  })
  const transitions = historyData?.transitions ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Record #{record.id}
            <StatusBadge status={record.status} locked={false} />
          </DialogTitle>
        </DialogHeader>

        {/* Stage progress indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {orderedStages.map((s, i) => {
            const isCurrent = s.id === record.current_stage_id
            const isPast = i < currentStageIndex
            return (
              <div key={s.id} className="flex items-center gap-1">
                <span
                  className={cn(
                    'whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
                    isCurrent && record.status !== 'finished'
                      ? 'bg-primary text-primary-foreground'
                      : isPast || record.status === 'finished'
                        ? 'bg-(--ok) text-white'
                        : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {s.name}
                </span>
                {i < orderedStages.length - 1 && (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            )
          })}
        </div>

        {/* Field data per stage */}
        {stagesWithData.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data collected yet.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {stagesWithData.map((stage, idx) => {
              const fields = sortStageFields(stage.fields)
              const valuesByKey = valuesForStage(record, stage.id)
              const isCurrent = stage.id === record.current_stage_id

              return (
                <div key={stage.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        isCurrent && record.status !== 'finished'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-(--ok) text-white',
                      )}
                    >
                      {idx + 1}
                    </span>
                    <h4 className="text-sm font-semibold text-foreground">{stage.name}</h4>
                    {isCurrent && record.status !== 'finished' && (
                      <Badge variant="outline" className="ml-auto text-[10px]">current</Badge>
                    )}
                  </div>
                  <div className="divide-y rounded-lg border">
                    {fields.map((f) => {
                      const vals = valuesByKey[f.key] ?? []
                      const isEmpty = vals.length === 0 || vals.every((v) => !v)
                      return (
                        <div key={f.id} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="w-36 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                            {f.label}
                            {f.required && <span className="ml-0.5 text-destructive">*</span>}
                          </span>
                          <span className={cn('flex-1 text-sm', isEmpty && 'text-muted-foreground/50')}>
                            {isEmpty ? (
                              '—'
                            ) : f.type === 'boolean' ? (
                              vals[0] === 'true' ? (
                                <span className="flex items-center gap-1 text-(--ok)">
                                  <Check className="size-3.5" /> Yes
                                </span>
                              ) : (
                                <span className="text-muted-foreground">No</span>
                              )
                            ) : (
                              vals.filter(Boolean).map((v, i) => (
                                <span key={i} className="block">
                                  {f.type === 'date' ? new Date(v).toLocaleDateString() : v}
                                </span>
                              ))
                            )}
                          </span>
                          {f.is_unique && (f.conflict_count ?? 0) > 0 && (
                            <ConflictCountBadge count={f.conflict_count!} />
                          )}
                        </div>
                      )
                    })}
                    {fields.length === 0 && (
                      <div className="px-3 py-2.5 text-xs text-muted-foreground">No fields defined.</div>
                    )}
                  </div>
                  {/* Composite constraint conflict counts */}
                  {(stage.unique_constraints ?? []).some((c) => (c.conflict_count ?? 0) > 0) && (
                    <div className="mt-2 flex flex-col gap-1">
                      {(stage.unique_constraints ?? [])
                        .filter((c): c is StageUniqueConstraint => (c.conflict_count ?? 0) > 0)
                        .map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-md bg-red-900 px-2.5 py-1.5">
                            <ShieldAlert className="size-3.5 shrink-0 text-red-50" />
                            <span className="flex-1 text-xs text-red-50">
                              Composite unique ({parseFieldKeys(c).join(' + ')})
                            </span>
                            <ConflictCountBadge count={c.conflict_count!} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Activity trail */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <User className="size-3.5" /> Activity
          </h4>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">Loading</p>
          ) : transitions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            <ol className="flex flex-col gap-0 border-l-2 border-border pl-4">
              {transitions.map((t) => (
                <ActivityEntry key={t.id} transition={t} />
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConflictCountBadge({ count }: { count: number }) {
  return (
    <span
      title={`${count} duplicate attempt${count !== 1 ? 's' : ''} blocked`}
      className="flex shrink-0 items-center gap-1 rounded-full bg-red-900 px-2 py-0.5 text-[10px] font-semibold text-red-50"
    >
      <ShieldAlert className="size-3" />
      {count}
    </span>
  )
}

function ActivityEntry({ transition: t }: { transition: RecordTransitionEntry }) {
  const label = t.from_stage
    ? `${t.from_stage.name} → ${t.to_stage.name}`
    : `Added to ${t.to_stage.name}`

  const when = t.created_at
    ? new Date(t.created_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <li className="relative py-2.5">
      {/* Timeline dot */}
      <span className="absolute -left-5.25 top-3.5 flex size-3 items-center justify-center rounded-full border-2 border-border bg-background" />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-foreground">{t.by.name}</span>
        <span className="text-xs text-muted-foreground">@{t.by.username}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="size-3 shrink-0" />
          {label}
        </span>
        {t.note && t.note !== 'created' && (
          <span className="text-xs italic text-muted-foreground">"{t.note}"</span>
        )}
        {when && <span className="ml-auto text-[11px] text-muted-foreground/70 tabular-nums">{when}</span>}
      </div>
    </li>
  )
}

/** Modal for bulk-importing records into the first stage.
 * Each non-empty line becomes one record (one value per line for a single field;
 * CSV rows when the stage has multiple fields).
 * - Cannot be dismissed while import is in progress.
 * - Backdrop click and Escape are blocked when the textarea has content.
 * - After import, displays per-line results; failed lines can be retried. */
function BulkImportModal({
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

function StatusBadge({ status, locked }: { status: RecordRow['status']; locked: boolean }) {
  const variant = status === 'finished' ? 'default' : status === 'processing' ? 'secondary' : 'outline'
  return (
    <div className="flex items-center gap-1">
      <Badge variant={variant} className={cn(status === 'finished' && 'bg-(--ok)', status === 'processing' && 'bg-(--warn) text-white')}>
        {status}
      </Badge>
      {locked && <Lock className="size-3.5 text-muted-foreground" aria-label="locked by another user" />}
    </div>
  )
}

/** Context menu for record actions, rendered in a portal right beside the
 * cursor (opened via right-click on the row or the row's "…" button).
 * Stays put until the user clicks an action, clicks outside, presses Escape
 * or scrolls; failed actions keep it open and show the error inline. */
function RowActionsMenu({
  campaign,
  record,
  nextStage,
  position,
  onClose,
  onDone,
  onDetails,
}: {
  campaign: Campaign
  record: RecordRow
  nextStage?: Stage
  position: { x: number; y: number }
  onClose: () => void
  onDone: () => void
  onDetails: () => void
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
  const advance = wrap('advance', () => recordApi.advance(campaign.id, record.id))
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
