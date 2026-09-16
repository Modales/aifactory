import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router'
import AnalysisStudio from '@/components/analysis/AnalysisStudio'
const LegacySession = lazy(() => import('./LegacySession'))

export default function Session() {
  const [params] = useSearchParams()
  return params.get('demo') === '1'
    ? <Suspense fallback={<p>Loading simulated demo…</p>}><LegacySession /></Suspense>
    : <AnalysisStudio />
}
