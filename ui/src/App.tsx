import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import UserMenu from './components/UserMenu'
import Login from './pages/Login'
import Campaigns from './pages/Campaigns'
import CampaignDetail, {
  CampaignAnalytics,
  CampaignMembers,
  CampaignSettings,
  CampaignStages,
  CampaignTimeline,
} from './pages/CampaignDetail'
import RecordDetail from './pages/RecordDetail'
import Profile from './pages/Profile'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="center muted">Loading…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <Layout>{children}</Layout>
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="topbar shrink-0">
        <Link to="/" className="brand">
          Data<span>Op</span>
        </Link>
        <div className="spacer" />
        <UserMenu />
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Campaigns />
          </Protected>
        }
      />
      <Route
        path="/campaigns/:id"
        element={
          <Protected>
            <CampaignDetail />
          </Protected>
        }
      >
        <Route index element={<CampaignTimeline />} />
        <Route path="stages" element={<CampaignStages />} />
        <Route path="members" element={<CampaignMembers />} />
        <Route path="analytics" element={<CampaignAnalytics />} />
        <Route path="settings" element={<CampaignSettings />} />
      </Route>
      <Route
        path="/profile"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route
        path="/campaigns/:id/records/:recordId"
        element={
          <Protected>
            <RecordDetail />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
