import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Landing = lazy(() => import('./pages/Landing'))
const Verification = lazy(() => import('./pages/Verification'))
const Analyze = lazy(() => import('./pages/Analyze'))
const WriteReview = lazy(() => import('./pages/WriteReview'))
const PreCheck = lazy(() => import('./pages/PreCheck'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Compare = lazy(() => import('./pages/Compare'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-tp-bg text-sm text-tp-muted">
      Loading...
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/verify" element={<Verification />} />
        <Route path="/check" element={<PreCheck />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/analyze/:issuerAddress" element={<Analyze />} />
        <Route path="/reviews/:issuerAddress" element={<WriteReview />} />
      </Routes>
    </Suspense>
  )
}
