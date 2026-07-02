import { Navigate, Route, Routes, Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { createContext, useContext, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import Login from './pages/Login'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import RecordDetail from './pages/RecordDetail'
import type { ReactNode } from 'react'

const TopbarSlotContext = createContext<HTMLDivElement | null>(null)

/** Renders its children inside the app topbar, next to the brand. */
export function TopbarPortal({ children }: { children: ReactNode }) {
  const el = useContext(TopbarSlotContext)
  if (!el) return null
  return createPortal(children, el)
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="center muted">Loading…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <Layout>{children}</Layout>
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="topbar shrink-0">
        <Link to="/" className="brand">
          Data<span>Op</span>
        </Link>
        <div ref={setSlot} className="flex min-w-0 flex-1 items-center gap-3" />
        <span className="muted">{user?.name}</span>
        <button className="btn ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
        <TopbarSlotContext.Provider value={slot}>{children}</TopbarSlotContext.Provider>
      </main>
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
