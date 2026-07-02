import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/resources'

export default function AnalyticsPanel({ campaignId }: { campaignId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', campaignId],
    queryFn: () => analyticsApi.get(campaignId),
  })

  if (isLoading) return <p className="muted">Loading…</p>
  if (error) return <div className="error">{(error as Error).message}</div>
  if (!data) return null

  const maxStage = Math.max(1, ...data.by_stage.map((s) => s.count))
  const maxDay = Math.max(1, ...data.throughput.map((t) => t.count))

  return (
    <div>
      <div className="grid">
        <Stat label="Total records" value={data.total_records} />
        <Stat label="Open" value={data.by_status.open ?? 0} />
        <Stat label="Processing" value={data.by_status.processing ?? 0} />
        <Stat label="Finished" value={data.by_status.finished ?? 0} />
      </div>

      <div className="panel">
        <h3>Records by stage</h3>
        {data.by_stage.map((s) => (
          <div key={s.stage_id} style={{ marginBottom: '0.6rem' }}>
            <div className="row">
              <span>{s.name}</span>
              <div className="spacer" />
              <span className="muted">{s.count}</span>
            </div>
            <div className="bar" style={{ width: `${(s.count / maxStage) * 100}%`, minWidth: s.count ? 8 : 0 }} />
          </div>
        ))}
        {data.by_stage.length === 0 && <p className="muted">No stages.</p>}
      </div>

      <div className="panel">
        <h3>Throughput (records finished per day)</h3>
        {data.throughput.length === 0 && <p className="muted">No finished records yet.</p>}
        {data.throughput.map((t) => (
          <div key={t.date} style={{ marginBottom: '0.6rem' }}>
            <div className="row">
              <span>{t.date}</span>
              <div className="spacer" />
              <span className="muted">{t.count}</span>
            </div>
            <div className="bar" style={{ width: `${(t.count / maxDay) * 100}%`, minWidth: 8, background: 'var(--ok)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-h)' }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  )
}
