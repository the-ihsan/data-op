import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi } from '../api/resources'
import type { Campaign, CampaignStatus, Visibility } from '../api/types'

export default function Settings({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description)
  const [visibility, setVisibility] = useState<Visibility>(campaign.visibility)
  const [status, setStatus] = useState<CampaignStatus>(campaign.status)
  const [allowConcurrent, setAllowConcurrent] = useState(campaign.allow_concurrent_edit)
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      campaignApi.update(campaign.id, {
        name,
        description,
        visibility,
        status,
        allow_concurrent_edit: allowConcurrent,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const remove = useMutation({
    mutationFn: () => campaignApi.remove(campaign.id),
    onSuccess: () => navigate('/'),
  })

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      {saved && <div className="notice" style={{ marginBottom: '0.75rem' }}>Saved.</div>}
      {save.error && <div className="error" style={{ marginBottom: '0.75rem' }}>{save.error.message}</div>}

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
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <label className="inline" style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={allowConcurrent} onChange={(e) => setAllowConcurrent(e.target.checked)} />
        Allow multiple users to work on the same record (disables locking)
      </label>

      <div className="row">
        <button className="btn primary" onClick={() => save.mutate()}>
          Save settings
        </button>
        <div className="spacer" />
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Delete this campaign and all its data?')) remove.mutate()
          }}
        >
          Delete campaign
        </button>
      </div>
      {remove.error && <div className="error" style={{ marginTop: '0.5rem' }}>{remove.error.message}</div>}
    </div>
  )
}
