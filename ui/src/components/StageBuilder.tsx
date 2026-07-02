import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { constraintApi, fieldApi, stageApi, type FieldInput } from '../api/resources'
import { parseFieldKeys, parseOptions, type FieldType, type Stage } from '../api/types'

const FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'facebook_profile',
  'facebook_group',
  'facebook_page',
]

function fieldTypeLabel(t: FieldType): string {
  switch (t) {
    case 'facebook_profile':
      return 'facebook profile'
    case 'facebook_group':
      return 'facebook group'
    case 'facebook_page':
      return 'facebook page'
    default:
      return t
  }
}

export default function StageBuilder({ campaignId }: { campaignId: number }) {
  const qc = useQueryClient()
  const [newStage, setNewStage] = useState('')

  const { data: stages, isLoading } = useQuery({
    queryKey: ['stages', campaignId],
    queryFn: () => stageApi.list(campaignId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stages', campaignId] })
    qc.invalidateQueries({ queryKey: ['campaign', campaignId] })
  }

  const addStage = useMutation({
    mutationFn: () => stageApi.create(campaignId, { name: newStage }),
    onSuccess: () => {
      setNewStage('')
      invalidate()
    },
  })
  const removeStage = useMutation({
    mutationFn: (stageId: number) => stageApi.remove(campaignId, stageId),
    onSuccess: invalidate,
  })

  if (isLoading) return <p className="muted">Loading…</p>

  return (
    <div>
      <div className="panel">
        <label>Add a stage</label>
        <div className="row" style={{ marginTop: '0.4rem' }}>
          <input
            placeholder="Stage name, e.g. Intake"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
          />
          <button className="btn primary" disabled={!newStage.trim()} onClick={() => addStage.mutate()}>
            Add
          </button>
        </div>
        {addStage.error && <div className="error" style={{ marginTop: '0.5rem' }}>{addStage.error.message}</div>}
      </div>

      {stages?.map((stage, i) => (
        <StagePanel
          key={stage.id}
          campaignId={campaignId}
          stage={stage}
          prevStage={i > 0 ? stages[i - 1] : undefined}
          onChange={invalidate}
          onDelete={() => removeStage.mutate(stage.id)}
        />
      ))}
      {stages && stages.length === 0 && <p className="muted">No stages yet. Add the first stage above.</p>}
    </div>
  )
}

function StagePanel({
  campaignId,
  stage,
  prevStage,
  onChange,
  onDelete,
}: {
  campaignId: number
  stage: Stage
  prevStage?: Stage
  onChange: () => void
  onDelete: () => void
}) {
  const fields = stage.fields ?? []
  const constraints = stage.unique_constraints ?? []

  const removeField = useMutation({
    mutationFn: (fieldId: number) => fieldApi.remove(campaignId, stage.id, fieldId),
    onSuccess: onChange,
  })
  const removeConstraint = useMutation({
    mutationFn: (cid: number) => constraintApi.remove(campaignId, stage.id, cid),
    onSuccess: onChange,
  })

  return (
    <div className="panel">
      <div className="row">
        <h3 style={{ margin: 0 }}>
          {stage.position + 1}. {stage.name}
        </h3>
        <div className="spacer" />
        <button className="btn danger sm" onClick={onDelete}>
          Delete stage
        </button>
      </div>

      <table style={{ marginTop: '0.75rem' }}>
        <thead>
          <tr>
            <th>Label</th>
            <th>Key</th>
            <th>Type</th>
            <th>Rules</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id}>
              <td>{f.label}</td>
              <td>
                <code>{f.key}</code>
              </td>
              <td>{fieldTypeLabel(f.type)}</td>
              <td>
                <div className="row wrap" style={{ gap: '0.3rem' }}>
                  {f.required && <span className="tag req">required</span>}
                  {f.is_unique && <span className="tag unique">unique</span>}
                  {f.max_count !== 1 && <span className="tag">max {f.max_count || '∞'}</span>}
                  {f.prev_stage_key && <span className="tag inherit">← {f.prev_stage_key}</span>}
                  {parseOptions(f).length > 0 && <span className="tag">{parseOptions(f).join(', ')}</span>}
                </div>
              </td>
              <td>
                <button className="btn danger sm" onClick={() => removeField.mutate(f.id)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {fields.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No fields yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <FieldForm campaignId={campaignId} stage={stage} prevStage={prevStage} onSaved={onChange} />

      {fields.length >= 2 && (
        <ConstraintSection
          campaignId={campaignId}
          stage={stage}
          onChange={onChange}
          onRemove={(cid) => removeConstraint.mutate(cid)}
        />
      )}
      {constraints.length > 0 && (
        <div className="row wrap" style={{ marginTop: '0.5rem' }}>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Composite unique:
          </span>
          {constraints.map((c) => (
            <span key={c.id} className="tag unique">
              {parseFieldKeys(c).join(' + ')}{' '}
              <button
                className="btn ghost sm"
                style={{ padding: 0, border: 'none' }}
                onClick={() => removeConstraint.mutate(c.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldForm({
  campaignId,
  stage,
  prevStage,
  onSaved,
}: {
  campaignId: number
  stage: Stage
  prevStage?: Stage
  onSaved: () => void
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [isUnique, setIsUnique] = useState(false)
  const [maxCount, setMaxCount] = useState(1)
  const [optionsText, setOptionsText] = useState('')
  const [prevKey, setPrevKey] = useState('')

  const isChoice = type === 'select' || type === 'multiselect'

  const save = useMutation({
    mutationFn: () => {
      const body: FieldInput = {
        label,
        type,
        required,
        is_unique: isUnique,
        max_count: maxCount,
        prev_stage_key: prevKey || undefined,
      }
      if (isChoice) {
        body.options = optionsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      return fieldApi.create(campaignId, stage.id, body)
    },
    onSuccess: () => {
      setLabel('')
      setOptionsText('')
      setPrevKey('')
      setRequired(false)
      setIsUnique(false)
      setMaxCount(1)
      setType('text')
      onSaved()
    },
  })

  return (
    <div className="panel" style={{ background: '#fafafb', marginTop: '0.75rem' }}>
      <div className="row wrap">
        <div className="field" style={{ flex: 2, minWidth: 160 }}>
          <label>New field label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {fieldTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>Max count (0=∞)</label>
          <input
            type="number"
            min={0}
            value={maxCount}
            onChange={(e) => setMaxCount(Number(e.target.value))}
          />
        </div>
      </div>

      {isChoice && (
        <div className="field">
          <label>Options (comma-separated)</label>
          <input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder="low, medium, high" />
        </div>
      )}

      {prevStage && (
        <div className="field">
          <label>Inherit value from previous stage (prev_stage_key)</label>
          <select value={prevKey} onChange={(e) => setPrevKey(e.target.value)}>
            <option value="">— none —</option>
            {(prevStage.fields ?? []).map((f) => (
              <option key={f.id} value={f.key}>
                {f.label} ({f.key})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="row wrap">
        <label className="inline">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
        </label>
        <label className="inline">
          <input type="checkbox" checked={isUnique} onChange={(e) => setIsUnique(e.target.checked)} /> Unique in stage
        </label>
        <div className="spacer" />
        <button className="btn primary" disabled={!label.trim()} onClick={() => save.mutate()}>
          Add field
        </button>
      </div>
      {save.error && <div className="error" style={{ marginTop: '0.5rem' }}>{save.error.message}</div>}
    </div>
  )
}

function ConstraintSection({
  campaignId,
  stage,
  onChange,
}: {
  campaignId: number
  stage: Stage
  onChange: () => void
  onRemove: (cid: number) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const fields = stage.fields ?? []

  const add = useMutation({
    mutationFn: () => constraintApi.create(campaignId, stage.id, selected),
    onSuccess: () => {
      setSelected([])
      onChange()
    },
  })

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <label>Composite unique constraint (pick 2+ fields)</label>
      <div className="row wrap" style={{ marginTop: '0.4rem' }}>
        {fields.map((f) => (
          <label key={f.id} className="inline">
            <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} /> {f.label}
          </label>
        ))}
        <button className="btn sm" disabled={selected.length < 2} onClick={() => add.mutate()}>
          Add constraint
        </button>
      </div>
      {add.error && <div className="error" style={{ marginTop: '0.5rem' }}>{add.error.message}</div>}
    </div>
  )
}
