import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleHelp } from 'lucide-react'
import { constraintApi, fieldApi, stageApi, type FieldInput } from '../api/resources'
import { parseFieldKeys, parseOptions, type FieldType, type Stage } from '../api/types'
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
import { cn } from '@/lib/utils'

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect']

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
              <td>{f.type}</td>
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

      <SanitizeSection campaignId={campaignId} stage={stage} onChange={onChange} />

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
                {t}
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

const SANITIZE_PLACEHOLDER = `# Runs before each entry is saved at this stage.
# data is a dict keyed by field key (multi-entry fields are lists).
def sanitize(data):
    data["email"] = data.get("email", "").lower()
    return data  # or: return None, "error message" to reject`

function SanitizeSection({
  campaignId,
  stage,
  onChange,
}: {
  campaignId: number
  stage: Stage
  onChange: () => void
}) {
  const saved = stage.sanitize_entry ?? ''
  const [open, setOpen] = useState(false)
  const [script, setScript] = useState(saved)

  const save = useMutation({
    mutationFn: (value: string) => stageApi.update(campaignId, stage.id, { sanitize_entry: value }),
    onSuccess: onChange,
  })

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="row wrap" style={{ gap: '0.4rem' }}>
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} Sanitize entry (Starlark)
        </button>
        <SanitizeGuideDialog />
        {saved && <span className="tag">active</span>}
      </div>

      {open && (
        <div className="field" style={{ marginTop: '0.4rem' }}>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={SANITIZE_PLACEHOLDER}
            rows={8}
            spellCheck={false}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem', width: '100%' }}
          />
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
            The script must define <code>sanitize(data)</code>. It receives the entry values as a
            dict and returns the sanitized dict, or <code>None, "message"</code> to reject the
            entry. Runs on every value save and bulk import at this stage.
          </p>
          <div className="row" style={{ marginTop: '0.4rem' }}>
            <button
              className="btn primary sm"
              disabled={save.isPending || script === saved}
              onClick={() => save.mutate(script)}
            >
              Save script
            </button>
            {saved && (
              <button
                className="btn danger sm"
                disabled={save.isPending}
                onClick={() => {
                  setScript('')
                  save.mutate('')
                }}
              >
                Remove
              </button>
            )}
          </div>
          {save.error && (
            <div className="error" style={{ marginTop: '0.5rem' }}>{save.error.message}</div>
          )}
        </div>
      )}
    </div>
  )
}

const GUIDE_EXAMPLE = `def sanitize(data):
    # lowercase an email field
    data["email"] = data.get("email", "").lower()

    # canonicalize a facebook profile, rejecting bad links
    v, err = fb_profile(data.get("profile", ""))
    if err != None:
        return None, "profile: " + err
    data["profile"] = v

    return data`

const GUIDE_BUILTINS: { sig: string; desc: string }[] = [
  { sig: 'fb_profile(value)', desc: 'Canonical Facebook profile URL (username, profile.php?id=…, /people/… links).' },
  { sig: 'fb_group(value)', desc: 'Canonical Facebook group URL (slug, numeric id, group.php?gid=… links).' },
  { sig: 'fb_page(value)', desc: 'Canonical Facebook page URL (vanity name or /pages/…/id links).' },
]

function GuideCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em] text-foreground">
      {children}
    </code>
  )
}

function GuideSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border bg-card p-4', className)}>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  )
}

function SanitizeGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Sanitize script guide"
          aria-label="Sanitize script guide"
        >
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Sanitize entry scripts</DialogTitle>
          <DialogDescription>
            Starlark (a Python dialect) runs on every value save and bulk-import line at this
            stage, before validation and persistence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <GuideSection title="Input and output">
            <p className="text-muted-foreground">
              Define <GuideCode>def sanitize(data)</GuideCode>. <GuideCode>data</GuideCode> is a
              dict keyed by field key — single-entry fields are strings, multi-entry fields are
              lists of strings.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-(--ok)/30 bg-(--ok)/5 p-3">
                <p className="mb-1 text-xs font-medium text-foreground">Accept</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Return the (possibly modified) dict. Values may be strings, numbers, booleans,
                  or lists of those. Set a field to <GuideCode>None</GuideCode> to drop it.
                </p>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-1 text-xs font-medium text-foreground">Reject</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Return <GuideCode>None, "message"</GuideCode>. The message is shown to the user
                  as a 400 error.
                </p>
              </div>
            </div>
          </GuideSection>

          <GuideSection title="Example">
            <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs leading-relaxed text-foreground">
              {GUIDE_EXAMPLE}
            </pre>
          </GuideSection>

          <GuideSection title="Bound functions">
            <p className="mb-3 text-muted-foreground">
              Each takes one string and returns a <GuideCode>(value, error)</GuideCode> pair —
              <GuideCode>(canonical_url, None)</GuideCode> on success or{' '}
              <GuideCode>(None, "message")</GuideCode> on failure.
            </p>
            <dl className="divide-y rounded-md border text-xs">
              {GUIDE_BUILTINS.map((b) => (
                <div key={b.sig} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                  <dt>
                    <code className="font-mono text-foreground">{b.sig}</code>
                  </dt>
                  <dd className="text-muted-foreground">{b.desc}</dd>
                </div>
              ))}
            </dl>
          </GuideSection>

          <GuideSection title="Environment" className="bg-muted/40">
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Sandboxed — no imports, file, network, or OS access.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Execution capped (~1s / bounded steps); infinite loops are aborted.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Compile-checked on save; compiled program is cached in memory.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Not run when advancing seeds inherited values from a previous stage.</span>
              </li>
            </ul>
          </GuideSection>
        </div>

        <DialogFooter className="border-t px-6 py-4" showCloseButton />
      </DialogContent>
    </Dialog>
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
