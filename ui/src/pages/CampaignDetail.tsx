import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { campaignApi } from '../api/resources'
import { TopbarPortal } from '../App'
import StageBuilder from '../components/StageBuilder'
import Members from '../components/Members'
import StageTimeline from '../components/StageTimeline'
import AnalyticsPanel from '../components/AnalyticsPanel'
import Settings from '../components/Settings'
import { cn } from '@/lib/utils'

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
        <Link to="/" className="muted shrink-0" title="Back to campaigns">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="truncate font-semibold text-foreground">{campaign.name}</span>
        <span className="badge shrink-0">{campaign.status}</span>
        <span className="tag hidden shrink-0 sm:inline">
          {campaign.allow_concurrent_edit ? 'concurrent editing' : 'record locking'}
        </span>
        <nav className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                tab === t.key
                  ? 'bg-accent font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </TopbarPortal>

      {tab === 'records' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <StageTimeline campaign={campaign} onEditStage={() => setTab('stages')} />
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
