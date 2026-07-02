import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import Login from './pages/Login'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import RecordDetail from './pages/RecordDetail'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="center muted">Loading…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <Layout>{children}</Layout>
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand">
          Data<span>Op</span>
        </Link>
        <div className="spacer" />
        <span className="muted">{user?.name}</span>
        <button className="btn ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="container">{children}</main>
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
