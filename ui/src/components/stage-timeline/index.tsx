import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Upload } from 'lucide-react'
import { stageApi } from '../../api/resources'
import type { Campaign } from '../../api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { StageGrid } from './StageGrid'
import { BulkImportModal } from './BulkImportModal'

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
