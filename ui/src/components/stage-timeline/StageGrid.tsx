import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { recordApi } from '../../api/resources'
import type { Campaign, Stage } from '../../api/types'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { sortStageFields } from '@/lib/stageFields'
import { PER_PAGE } from './helpers'
import { GridRow } from './GridRow'
import { DraftRow } from './DraftRow'

export function StageGrid({
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
