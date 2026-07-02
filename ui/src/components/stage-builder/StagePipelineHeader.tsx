import type { UseMutationResult } from '@tanstack/react-query'
import { ChevronRight, Layers, Loader2, Plus } from 'lucide-react'
import type { Stage } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function StagePipelineHeader({
  stages,
  selectedStageId,
  onSelectStage,
  addStageOpen,
  onAddStageOpenChange,
  newStageName,
  onNewStageNameChange,
  addStage,
}: {
  stages: Stage[]
  selectedStageId: number | null
  onSelectStage: (id: number) => void
  addStageOpen: boolean
  onAddStageOpenChange: (open: boolean) => void
  newStageName: string
  onNewStageNameChange: (name: string) => void
  addStage: UseMutationResult<Stage, Error, string, unknown>
}) {
  return (
    <div className="flex shrink-0 items-start gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
        {stages.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Layers className="size-4 shrink-0" />
            No stages yet — add your first stage to start building the pipeline.
          </div>
        ) : (
          stages.map((stage, i) => {
            const active = stage.id === selectedStageId
            const fieldCount = stage.fields?.length ?? 0
            return (
              <div key={stage.id} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => onSelectStage(stage.id)}
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
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{stage.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {fieldCount} field{fieldCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
                {i < stages.length - 1 && (
                  <ChevronRight className="mx-1 size-5 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            )
          })
        )}
      </div>

      <Dialog open={addStageOpen} onOpenChange={onAddStageOpenChange}>
        <DialogTrigger asChild>
          <Button className="shrink-0">
            <Plus />
            Add stage
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add stage</DialogTitle>
            <DialogDescription>
              Stages define the ordered steps records move through in this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="new-stage-name">
              Stage name
            </label>
            <Input
              id="new-stage-name"
              placeholder="e.g. Intake, Triage, Resolution"
              value={newStageName}
              onChange={(e) => onNewStageNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStageName.trim()) addStage.mutate(newStageName.trim())
              }}
            />
            {addStage.error && (
              <p className="text-sm text-destructive">{addStage.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={!newStageName.trim() || addStage.isPending}
              onClick={() => addStage.mutate(newStageName.trim())}
            >
              {addStage.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Adding…
                </>
              ) : (
                'Add stage'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
