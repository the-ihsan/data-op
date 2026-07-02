import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campaignApi } from '../api/resources'
import type { Campaign } from '../api/types'
import CampaignNav from '../components/CampaignNav'
import StageBuilder from '../components/StageBuilder'
import Members from '../components/Members'
import StageTimeline from '../components/StageTimeline'
import AnalyticsPanel from '../components/AnalyticsPanel'
import Settings from '../components/Settings'

export type CampaignOutletContext = {
  campaign: Campaign
  campaignId: number
}

export function useCampaignContext() {
  return useOutletContext<CampaignOutletContext>()
}

export default function CampaignDetail() {
  const { id } = useParams()
  const campaignId = Number(id)

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignApi.get(campaignId),
  })

  if (isLoading) return <p className="muted">Loading…</p>
  if (error) return <div className="error">{(error as Error).message}</div>
  if (!campaign) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CampaignNav campaign={campaign} />
      <Outlet context={{ campaign, campaignId } satisfies CampaignOutletContext} />
    </div>
  )
}

export function CampaignTimeline() {
  const { campaign } = useCampaignContext()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <StageTimeline
        campaign={campaign}
        onAddFields={() => navigate(`/campaigns/${campaign.id}/stages`)}
      />
    </div>
  )
}

export function CampaignStages() {
  const { campaignId } = useCampaignContext()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <StageBuilder campaignId={campaignId} />
    </div>
  )
}

export function CampaignMembers() {
  const { campaignId } = useCampaignContext()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Members campaignId={campaignId} />
    </div>
  )
}

export function CampaignAnalytics() {
  const { campaignId } = useCampaignContext()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AnalyticsPanel campaignId={campaignId} />
    </div>
  )
}

export function CampaignSettings() {
  const { campaign } = useCampaignContext()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Settings campaign={campaign} />
    </div>
  )
}