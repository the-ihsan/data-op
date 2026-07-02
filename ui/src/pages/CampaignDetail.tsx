import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campaignApi } from '../api/resources'
import StageBuilder from '../components/StageBuilder'
import Members from '../components/Members'
import StageTimeline from '../components/StageTimeline'
import AnalyticsPanel from '../components/AnalyticsPanel'
import Settings from '../components/Settings'

type Tab = 'records' | 'stages' | 'members' | 'analytics' | 'settings'

export default function CampaignDetail() {
  const { id } = useParams()
  const campaignId = Number(id)
  const [tab, setTab] = useState<Tab>('records')

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignApi.get(campaignId),
  })

  if (isLoading) return <p className="muted">Loading…</p>
  if (error) return <div className="error">{(error as Error).message}</div>
  if (!campaign) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'records', label: 'Timeline' },
    { key: 'stages', label: 'Stages & Fields' },
    { key: 'members', label: 'Members' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div>
      <div className="row">
        <Link to="/" className="muted">
          ← Campaigns
        </Link>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>{campaign.name}</h1>
        <span className="badge">{campaign.status}</span>
        <span className="tag">{campaign.allow_concurrent_edit ? 'concurrent editing' : 'record locking'}</span>
      </div>

      <div className="tabs" style={{ marginTop: '1rem' }}>
        {tabs.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'records' && <StageTimeline campaign={campaign} onEditStage={() => setTab('stages')} />}
      {tab === 'stages' && <StageBuilder campaignId={campaignId} />}
      {tab === 'members' && <Members campaignId={campaignId} />}
      {tab === 'analytics' && <AnalyticsPanel campaignId={campaignId} />}
      {tab === 'settings' && <Settings campaign={campaign} />}
    </div>
  )
}
