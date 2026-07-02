import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { campaignApi } from '../api/resources'
import type { Campaign } from '../api/types'

export default function Campaigns() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignApi.list,
  })

  const create = useMutation({
    mutationFn: (body: Partial<Campaign>) => campaignApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setShowForm(false)
    },
  })

  return (
    <div>
      <div className="row">
        <h1>Campaigns</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New campaign'}
        </button>
      </div>

      {showForm && <CampaignForm onSubmit={(b) => create.mutate(b)} error={create.error?.message} />}

      {isLoading && <p className="muted">Loading…</p>}
      {error && <div className="error">{(error as Error).message}</div>}

      <div className="grid">
        {data?.map((c) => (
          <Link key={c.id} to={`/campaigns/${c.id}`} className="panel" style={{ display: 'block' }}>
            <div className="row">
              <h3 style={{ margin: 0 }}>{c.name}</h3>
              <div className="spacer" />
              <span className="badge">{c.status}</span>
            </div>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
              {c.description || 'No description'}
            </p>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <span className="tag">{c.visibility}</span>
              {c.allow_concurrent_edit ? (
                <span className="tag">concurrent</span>
              ) : (
                <span className="tag">locking</span>
              )}
            </div>
          </Link>
        ))}
        {data && data.length === 0 && <p className="muted">No campaigns yet. Create one to get started.</p>}
      </div>
    </div>
  )
}

function CampaignForm({
  onSubmit,
  error,
}: {
  onSubmit: (b: Partial<Campaign>) => void
  error?: string
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [allowConcurrent, setAllowConcurrent] = useState(false)

  return (
    <div className="panel">
      {error && <div className="error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="row wrap">
        <div className="field" style={{ flex: 1 }}>
          <label>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
        <label className="field inline" style={{ marginTop: '1.2rem' }}>
          <input
            type="checkbox"
            checked={allowConcurrent}
            onChange={(e) => setAllowConcurrent(e.target.checked)}
          />
          Allow multiple users on the same record
        </label>
      </div>
      <button
        className="btn primary"
        disabled={!name.trim()}
        onClick={() =>
          onSubmit({ name, description, visibility, status: 'active', allow_concurrent_edit: allowConcurrent })
        }
      >
        Create campaign
      </button>
    </div>
  )
}
