import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campaignApi } from '../api/resources'
import { TopbarPortal } from '../App'
import DrawerNav from '../components/DrawerNav'
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TopbarPortal>
        <DrawerNav<Tab> campaign={campaign} tabs={tabs} tab={tab} onTabChange={setTab} />
      </TopbarPortal>

      {tab === 'records' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <StageTimeline campaign={campaign} onAddFields={() => setTab('stages')} />
        </div>
      )}
      {tab !== 'records' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'stages' && <StageBuilder campaignId={campaignId} />}
          {tab === 'members' && <Members campaignId={campaignId} />}
          {tab === 'analytics' && <AnalyticsPanel campaignId={campaignId} />}
          {tab === 'settings' && <Settings campaign={campaign} />}
        </div>
      )}
    </div>
  )
}
