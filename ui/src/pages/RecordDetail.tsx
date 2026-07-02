import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recordApi } from '../api/resources'
import DynamicForm, { type FormValues } from '../components/DynamicForm'

export default function RecordDetail() {
  const { id, recordId } = useParams()
  const campaignId = Number(id)
  const rid = Number(recordId)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormValues>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['record-form', campaignId, rid],
    queryFn: () => recordApi.form(campaignId, rid),
  })

  useEffect(() => {
    if (data) setForm(data.values ?? {})
  }, [data])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['record-form', campaignId, rid] })
    qc.invalidateQueries({ queryKey: ['records', campaignId] })
  }

  const save = useMutation({
    mutationFn: () => recordApi.saveValues(campaignId, rid, form),
    onSuccess: () => {
      setMessage({ kind: 'ok', text: 'Saved.' })
      refresh()
    },
    onError: (e) => setMessage({ kind: 'error', text: (e as Error).message }),
  })

  const process = useMutation({
    mutationFn: () => recordApi.markProcessing(campaignId, rid),
    onSuccess: () => {
      setMessage(null)
      refresh()
    },
    onError: (e) => setMessage({ kind: 'error', text: (e as Error).message }),
  })

  const release = useMutation({
    mutationFn: () => recordApi.release(campaignId, rid),
    onSuccess: () => refresh(),
    onError: (e) => setMessage({ kind: 'error', text: (e as Error).message }),
  })

  const advance = useMutation({
    mutationFn: async () => {
      await recordApi.saveValues(campaignId, rid, form)
      return recordApi.advance(campaignId, rid)
    },
    onSuccess: () => {
      refresh()
      navigate(`/campaigns/${campaignId}`)
    },
    onError: (e) => setMessage({ kind: 'error', text: (e as Error).message }),
  })

  if (isLoading) return <p className="muted">Loading…</p>
  if (error) return <div className="error">{(error as Error).message}</div>
  if (!data) return null

  const finished = data.record.status === 'finished'

  return (
    <div style={{ maxWidth: 640 }}>
      <Link to={`/campaigns/${campaignId}`} className="muted">
        ← Back to board
      </Link>

      <div className="row" style={{ margin: '0.5rem 0 1rem' }}>
        <h1 style={{ margin: 0 }}>Record #{data.record.id}</h1>
        <span className={`badge ${data.record.status}`}>{data.record.status}</span>
        <span className="tag">Stage: {data.stage.name}</span>
      </div>

      {data.record.locked_by && (
        <div className="notice" style={{ marginBottom: '1rem' }}>
          This record is marked as processing{data.record.locked_by ? ' and locked' : ''}. In a
          locking campaign, only the holder can save or advance it.
        </div>
      )}

      {message && (
        <div className={message.kind === 'error' ? 'error' : 'notice'} style={{ marginBottom: '1rem' }}>
          {message.text}
        </div>
      )}

      <div className="panel">
        <DynamicForm fields={data.fields} values={form} onChange={setForm} disabled={finished} />
      </div>

      {!finished && (
        <div className="row wrap">
          <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
            Save draft
          </button>
          {data.record.status === 'open' && (
            <button className="btn" onClick={() => process.mutate()}>
              Mark processing
            </button>
          )}
          {data.record.status === 'processing' && (
            <button className="btn ghost" onClick={() => release.mutate()}>
              Release
            </button>
          )}
          <div className="spacer" />
          <button className="btn primary" onClick={() => advance.mutate()} disabled={advance.isPending}>
            Save &amp; advance →
          </button>
        </div>
      )}
    </div>
  )
}
