
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Index } from './pages/IndexPage'
import { NotFound } from './pages/NotFoundPage'
import { AppPage } from './pages/AppPage'
import { AppIndexPage } from './pages/app/IndexPage'
import { ProposalsPage } from './pages/app/ProposalsPage'
import { TreasuryPage } from './pages/app/TreasuryPage'
import { MembersPage } from './pages/app/MembersPage'
import { PaymentsPage } from './pages/app/PaymentsPage'
import { FeedPage } from './pages/app/FeedPage'
import { SettingsPage } from './pages/app/SettingsPage'

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/app" element={<AppPage />}>
            <Route index element={<AppIndexPage />} />
            <Route path='proposals' element={<ProposalsPage />} />
            <Route path='treasury' element={<TreasuryPage />} />
            <Route path='members' element={<MembersPage />} />
            <Route path='payments' element={<PaymentsPage />} />
            <Route path='feed' element={<FeedPage />} />
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
