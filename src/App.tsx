import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { restoreSession } from './lib/auth'
import { Index } from './pages/IndexPage'
import { NotFound } from './pages/NotFoundPage'
import { AuthPage } from './pages/AuthPage'
import { AppPage } from './pages/AppPage'
import { AppIndexPage } from './pages/app/IndexPage'
import { ProposalsPage } from './pages/app/ProposalsPage'
import { TreasuryPage } from './pages/app/TreasuryPage'
import { MembersPage } from './pages/app/MembersPage'
import { PaymentsPage } from './pages/app/PaymentsPage'
import { FeedPage } from './pages/app/FeedPage'
import { ProfilePage } from './pages/app/ProfilePage'
import { SettingsPage } from './pages/app/SettingsPage'

function App() {
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    let active = true
    void restoreSession().finally(() => {
      if (active) setRestoring(false)
    })
    return () => { active = false }
  }, [])

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Restoring your session…
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Toaster position="bottom-right" richColors />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/app" element={<AppPage />}>
            <Route index element={<AppIndexPage />} />
            <Route path='proposals' element={<ProposalsPage />} />
            <Route path='treasury' element={<TreasuryPage />} />
            <Route path='members' element={<MembersPage />} />
            <Route path='payments' element={<PaymentsPage />} />
            <Route path='feed' element={<FeedPage />} />
            <Route path='profile' element={<ProfilePage />} />
            <Route path='settings' element={<SettingsPage />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
