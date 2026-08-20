import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Session from './pages/Session'
import Login from './pages/Login'
import Signup from './pages/Signup'
import History from './pages/History'
import PastWorkouts from './pages/PastWorkouts'
import Terminal from './pages/Terminal'
import Wearables from './pages/Wearables'
import { AuthProvider } from './lib/auth'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/history" element={<History />} />
        <Route path="/past-workouts" element={<PastWorkouts />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/wearables" element={<Wearables />} />
      </Routes>
    </AuthProvider>
  )
}
