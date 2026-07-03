import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronRight, ShieldAlert, User } from 'lucide-react'
import { recordApi } from '../../api/resources'
import { parseFieldKeys, type Campaign, type RecordRow, type RecordTransitionEntry, type Stage, type StageUniqueConstraint } from '../../api/types'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { sortStageFields } from '@/lib/stageFields'
import { valuesForStage } from './helpers'
import { StatusBadge } from './StatusBadge'

/** Modal showing all field values for a record across every stage it has passed through,
 * plus the full activity trail with the users who worked on it. */
export function RecordDetailsModal({
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
