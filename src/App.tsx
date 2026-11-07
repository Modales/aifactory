import { Navigate, Routes, Route } from 'react-router'
import Marketing from './pages/Marketing'
import Session from './pages/Session'
import Login from './pages/Login'
import Signup from './pages/Signup'
import History from './pages/History'
import Terminal from './pages/Terminal'
import Wearables from './pages/Wearables'
import ExerciseLibrary from './pages/ExerciseLibrary'
import { AuthProvider } from './lib/auth'
import { AppRoute, WebRoute } from './components/SurfaceRoutes'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Website */}
        <Route path="/" element={<WebRoute><Marketing /></WebRoute>} />
        {/* App — see src/lib/platform.ts for which devices may open these */}
        <Route path="/session" element={<AppRoute><Session /></AppRoute>} />
        <Route path="/login" element={<AppRoute><Login /></AppRoute>} />
        <Route path="/signup" element={<AppRoute><Signup /></AppRoute>} />
        <Route path="/dashboard" element={<AppRoute><Terminal /></AppRoute>} />
        <Route path="/history" element={<AppRoute><History /></AppRoute>} />
        <Route path="/wearables" element={<AppRoute><Wearables /></AppRoute>} />
        <Route path="/exercises" element={<AppRoute><ExerciseLibrary /></AppRoute>} />
        <Route path="/terminal" element={<Navigate to="/dashboard" replace />} />
        <Route path="/past-workouts" element={<Navigate to="/history" replace />} />
      </Routes>
    </AuthProvider>
  )
}
