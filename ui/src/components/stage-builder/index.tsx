import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stageApi } from '@/api/resources'
import LoadingBlock from './LoadingBlock'
import StageEditor from './StageEditor'
import StagePipelineHeader from './StagePipelineHeader'

export default function StageBuilder({ campaignId }: { campaignId: number }) {
  const qc = useQueryClient()
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [newStageName, setNewStageName] = useState('')

  const { data: stages, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['stages', campaignId],
    queryFn: () => stageApi.list(campaignId),
  })

  const orderedStages = useMemo(
    () => [...(stages ?? [])].sort((a, b) => a.position - b.position),
    [stages],
  )

  useEffect(() => {
    if (selectedStageId == null && orderedStages.length > 0) {
      setSelectedStageId(orderedStages[0].id)
    }
    if (selectedStageId != null && !orderedStages.some((s) => s.id === selectedStageId)) {
      setSelectedStageId(orderedStages[0]?.id ?? null)
    }
  }, [orderedStages, selectedStageId])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stages', campaignId] })
    qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
  }

  const addStage = useMutation({
    mutationFn: (name: string) => stageApi.create(campaignId, { name }),
    onSuccess: (stage) => {
      setNewStageName('')
      setAddStageOpen(false)
      setSelectedStageId(stage.id)
      invalidate()
    },
  })

  const removeStage = useMutation({
    mutationFn: (stageId: number) => stageApi.remove(campaignId, stageId),
    onSuccess: invalidate,
  })

  if (isLoading) {
    return <LoadingBlock label="Loading stages…" />
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {(error as Error).message || 'Failed to load stages.'}
      </div>
    )
  }

  const isRefetching = isFetching && !isLoading
  const selectedStage = orderedStages.find((s) => s.id === selectedStageId)
  const selectedIndex = selectedStage ? orderedStages.findIndex((s) => s.id === selectedStage.id) : -1
  const prevStage = selectedIndex > 0 ? orderedStages[selectedIndex - 1] : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <StagePipelineHeader
        stages={orderedStages}
        selectedStageId={selectedStageId}
        onSelectStage={setSelectedStageId}
        addStageOpen={addStageOpen}
        onAddStageOpenChange={setAddStageOpen}
        newStageName={newStageName}
        onNewStageNameChange={setNewStageName}
        addStage={addStage}
      />

      {selectedStage ? (
        <StageEditor
          campaignId={campaignId}
          stage={selectedStage}
          prevStage={prevStage}
          isRefetching={isRefetching}
          isDeletingStage={removeStage.isPending}
          onChange={invalidate}
          onDelete={() => {
            if (confirm(`Delete stage "${selectedStage.name}" and all its fields?`)) {
              removeStage.mutate(selectedStage.id)
            }
          }}
        />
      ) : (
        !orderedStages.length && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Use <strong className="font-medium text-foreground">Add stage</strong> to create your first pipeline step.
          </div>
        )
      )}
    </div>
  )
}
