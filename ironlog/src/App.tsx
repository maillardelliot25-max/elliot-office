import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Exercises from './pages/Exercises'
import Routines from './pages/Routines'
import RoutineEditor from './pages/RoutineEditor'
import Workout from './pages/Workout'
import History from './pages/History'
import HistoryDetail from './pages/HistoryDetail'
import Settings from './pages/Settings'

// Chart-heavy pages pull in recharts, so they're split into their own chunk.
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'))
const Progress = lazy(() => import('./pages/Progress'))

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="/exercises/:id" element={<ExerciseDetail />} />
            <Route path="/routines" element={<Routines />} />
            <Route path="/routines/new" element={<RoutineEditor />} />
            <Route path="/routines/:id/edit" element={<RoutineEditor />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<HistoryDetail />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
