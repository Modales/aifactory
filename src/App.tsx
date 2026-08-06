import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Session from './pages/Session'
import PastWorkouts from './pages/PastWorkouts'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/session" element={<Session />} />
      <Route path="/history" element={<PastWorkouts />} />
      <Route path="/past-workouts" element={<PastWorkouts />} />
    </Routes>
  )
}
