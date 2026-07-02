import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { constraintApi, fieldApi } from '@/api/resources'
import type { Stage } from '@/api/types'
import { Button } from '@/components/ui/button'
import CompositeConstraintBadges from './CompositeConstraintBadges'
import ConstraintSection from './ConstraintSection'
import FieldCard from './FieldCard'
import FieldEditor from './FieldEditor'
import SanitizeSection from './SanitizeSection'
import { emptyFormState, fieldToFormState } from './field-form'

export default function StageEditor({
  campaignId,
  stage,
  prevStage,
  isRefetching,
  isDeletingStage,
  onChange,
  onDelete,
}: {
  campaignId: number
  stage: Stage
  prevStage?: Stage
  isRefetching?: boolean
  isDeletingStage?: boolean
  onChange: () => void
  onDelete: () => void
}) {
  const fields = [...(stage.fields ?? [])].sort((a, b) => a.position - b.position)
  const constraints = stage.unique_constraints ?? []
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null)
  const [addingField, setAddingField] = useState(false)

  const removeField = useMutation({
    mutationFn: (fieldId: number) => fieldApi.remove(campaignId, stage.id, fieldId),
    onSuccess: () => {
      setEditingFieldId(null)
      onChange()
    },
  })

  const removeConstraint = useMutation({
    mutationFn: (cid: number) => constraintApi.remove(campaignId, stage.id, cid),
    onSuccess: onChange,
  })

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
      {isRefetching && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Updating…
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3 border-b pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stage builder</p>
            <h2 className="m-0 text-lg font-semibold text-foreground">{stage.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Define the fields collected at this step. Records enter at the first stage and advance through the pipeline.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isDeletingStage || isRefetching}
            onClick={onDelete}
          >
            {isDeletingStage ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {isDeletingStage ? 'Deleting…' : 'Delete stage'}
          </Button>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-semibold text-foreground">Fields</h3>
            {!addingField && editingFieldId == null && (
              <Button
                variant="outline"
                size="sm"
                disabled={isRefetching || isDeletingStage}
                onClick={() => setAddingField(true)}
              >
                <Plus />
                Add field
              </Button>
            )}
          </div>

          {fields.length === 0 && !addingField && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No fields yet. Add a field to define what data is collected at this stage.
            </div>
          )}

          <div className="space-y-2">
            {fields.map((field) =>
              editingFieldId === field.id ? (
                <FieldEditor
                  key={field.id}
                  campaignId={campaignId}
                  stage={stage}
                  prevStage={prevStage}
                  initial={fieldToFormState(field)}
                  existing={field}
                  onCancel={() => setEditingFieldId(null)}
                  onSaved={() => {
                    setEditingFieldId(null)
                    onChange()
                  }}
                />
              ) : (
                <FieldCard
                  key={field.id}
                  field={field}
                  isDeleting={removeField.isPending && removeField.variables === field.id}
                  disabled={isRefetching || removeField.isPending}
                  onEdit={() => {
                    setAddingField(false)
                    setEditingFieldId(field.id)
                  }}
                  onDelete={() => {
                    if (confirm(`Delete field "${field.label}"?`)) removeField.mutate(field.id)
                  }}
                />
              ),
            )}
          </div>

          {addingField && (
            <FieldEditor
              campaignId={campaignId}
              stage={stage}
              prevStage={prevStage}
              initial={emptyFormState()}
              onCancel={() => setAddingField(false)}
              onSaved={() => {
                setAddingField(false)
                onChange()
              }}
            />
          )}
        </section>

        <SanitizeSection campaignId={campaignId} stage={stage} onChange={onChange} />

        {fields.length >= 2 && (
          <ConstraintSection campaignId={campaignId} stage={stage} onChange={onChange} />
        )}

        <CompositeConstraintBadges constraints={constraints} removeConstraint={removeConstraint} />
      </div>
    </div>
  )
}
