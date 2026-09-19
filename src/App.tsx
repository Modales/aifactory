import { Navigate, Routes, Route } from 'react-router'
import Home from './pages/Home'
import Session from './pages/Session'
import Login from './pages/Login'
import Signup from './pages/Signup'
import History from './pages/History'
import Terminal from './pages/Terminal'
import Wearables from './pages/Wearables'
import ExerciseLibrary from './pages/ExerciseLibrary'
import { AuthProvider } from './lib/auth'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Terminal />} />
        <Route path="/history" element={<History />} />
        <Route path="/wearables" element={<Wearables />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/terminal" element={<Navigate to="/dashboard" replace />} />
        <Route path="/past-workouts" element={<Navigate to="/history" replace />} />
      </Routes>
    </AuthProvider>
  )
}
