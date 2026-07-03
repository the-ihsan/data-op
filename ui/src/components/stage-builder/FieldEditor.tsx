import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { fieldApi } from '@/api/resources'
import type { FieldType, Stage, StageField } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sortStageFields } from '@/lib/stageFields'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DefaultValueInput from './DefaultValueInput'
import { FIELD_TYPES, FIELD_TYPE_LABELS } from './constants'
import { applyInheritance, formStateToInput } from './field-form'
import type { FieldFormState } from './types'

export default function FieldEditor({
  campaignId,
  stage,
  prevStage,
  initial,
  existing,
  onCancel,
  onSaved,
}: {
  campaignId: number
  stage: Stage
  prevStage?: Stage
  initial: FieldFormState
  existing?: StageField
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, setState] = useState<FieldFormState>(initial)
  const inherited = state.prevKey !== ''
  const hasData = (existing?.value_count ?? 0) > 0
  const isChoice = state.type === 'select' || state.type === 'multiselect'
  const typeSelectDisabled = inherited
  // With stored data the backend only accepts converting to a string type
  // (text/textarea); keep the current type selectable so it still renders.
  const typeOptions =
    hasData && !inherited
      ? FIELD_TYPES.filter((t) => t === 'text' || t === 'textarea' || t === existing?.type)
      : FIELD_TYPES

  const prevFields = sortStageFields(prevStage?.fields)

  const save = useMutation({
    mutationFn: () => {
      const body = formStateToInput(state)
      if (existing) {
        return fieldApi.update(campaignId, stage.id, existing.id, body)
      }
      return fieldApi.create(campaignId, stage.id, body)
    },
    onSuccess: onSaved,
  })

  const set = <K extends keyof FieldFormState>(key: K, value: FieldFormState[K]) =>
    setState((s) => ({ ...s, [key]: value }))

  const handlePrevKeyChange = (key: string) => {
    if (!key || key === '__none__') {
      setState((s) => ({
        ...s,
        prevKey: '',
        ...(existing ? {} : { label: '', type: 'text', key: '' }),
      }))
      return
    }
    const prevField = prevFields.find((f) => f.key === key)
    if (prevField) {
      setState((s) => applyInheritance({ ...s, prevKey: key }, prevField))
    } else {
      set('prevKey', key)
    }
  }

  return (
    <div className="rounded-lg border-2 border-primary/20 bg-accent/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="m-0 text-sm font-semibold text-foreground">
          {existing ? 'Edit field' : 'New field'}
        </h4>
        <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel">
          <X />
        </Button>
      </div>

      {prevStage && prevFields.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-medium text-foreground">Inherit from previous stage</label>
          <Select
            value={state.prevKey || '__none__'}
            onValueChange={handlePrevKeyChange}
            disabled={hasData}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No inheritance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No inheritance</SelectItem>
              {prevFields.map((f) => (
                <SelectItem key={f.id} value={f.key}>
                  {f.label} ({f.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasData && (
            <p className="text-xs text-muted-foreground">
              Inheritance cannot be changed while records contain data for this field.
            </p>
          )}
          {inherited && !hasData && (
            <p className="text-xs text-muted-foreground">
              Label and type are taken from the previous-stage field. Other options can be adjusted.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Label</label>
          <Input
            value={state.label}
            disabled={inherited}
            placeholder="Field label"
            onChange={(e) => set('label', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Type</label>
          <Select
            value={state.type}
            onValueChange={(v) => set('type', v as FieldType)}
            disabled={typeSelectDisabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasData && !inherited && (
            <p className="text-xs text-muted-foreground">
              When data exists, type can only be changed to Text or Long text.
            </p>
          )}
          {inherited && (
            <p className="text-xs text-muted-foreground">Type is fixed for inherited fields.</p>
          )}
        </div>

        {!inherited && (
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">Key</label>
            <Input
              value={state.key}
              disabled={hasData}
              placeholder="Auto-generated from label if empty"
              onChange={(e) => set('key', e.target.value)}
            />
            {hasData && (
              <p className="text-xs text-muted-foreground">Key cannot be changed while data exists.</p>
            )}
          </div>
        )}

        {isChoice && (
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">Options</label>
            <Input
              value={state.optionsText}
              placeholder="Comma-separated, e.g. low, medium, high"
              onChange={(e) => set('optionsText', e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground">Default value</label>
          <DefaultValueInput
            type={state.type}
            options={state.optionsText.split(',').map((s) => s.trim()).filter(Boolean)}
            value={state.defaultValue}
            onChange={(v) => set('defaultValue', v)}
          />
          <p className="text-xs text-muted-foreground">
            Pre-fills new entries at this stage. Leave empty for no default.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={state.required}
            onChange={(e) => set('required', e.target.checked)}
          />
          Required
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input"
            checked={state.isUnique}
            onChange={(e) => set('isUnique', e.target.checked)}
          />
          Unique in stage
        </label>
        {state.type !== 'multiselect' && state.type !== 'select' && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={state.allowMultiple}
              onChange={(e) => {
                const checked = e.target.checked
                setState((s) => ({
                  ...s,
                  allowMultiple: checked,
                  maxCount: checked ? (s.maxCount === 1 ? 0 : s.maxCount) : 1,
                }))
              }}
            />
            Allow multiple values
          </label>
        )}
        {state.allowMultiple && state.type !== 'multiselect' && state.type !== 'select' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Max entries</span>
            <Input
              type="number"
              min={0}
              className="h-8 w-20"
              value={state.maxCount}
              onChange={(e) => set('maxCount', Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">0 = unlimited</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" disabled={save.isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!state.label.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : existing ? (
            'Save changes'
          ) : (
            'Add field'
          )}
        </Button>
      </div>
      {save.error && (
        <p className="mt-2 text-sm text-destructive">{(save.error as Error).message}</p>
      )}
    </div>
  )
}
