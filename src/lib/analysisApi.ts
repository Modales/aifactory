import { request } from './api'
import type { PoseLandmark } from './pose/types'
/** Any library id — built-in (e.g. 'squat') or one the athlete taught (e.g. 'custom_1a2b3c4d'). */
export type ExerciseId = string
export interface LibraryExercise { id: ExerciseId; name: string; family: string; familyName: string; primary: string; views: string[]; variantOf: ExerciseId | null; custom: boolean }
export interface ExerciseLibrary { exercises: LibraryExercise[]; families: Record<string, string>; muscles: { id: string; name: string }[] }
/** The handful shown as quick chips before the full searchable library. */
export const POPULAR: ExerciseId[] = ['squat', 'deadlift', 'bench', 'ohp', 'curl', 'lunge', 'pushup', 'pullup', 'bent_over_row', 'lateral_raise']
export type CameraView = 'auto' | 'side' | 'frontal' | 'oblique'
export interface AnalysisFrame { timestampMs: number; landmarks: Pick<PoseLandmark,'x' | 'y' | 'visibility'>[] }
export interface CameraStream { cameraId: string; view: CameraView; aspectRatio: number; offsetMs: number; frames: AnalysisFrame[] }
export interface FormCheck { name: string; cameraId: string; view: string; value: number; units: string; target: string; score: number; passed: boolean; cue: string }
export interface AnalysisRep { index: number; startMs: number; endMs: number; durationSeconds: number; score: number | null; checks: FormCheck[]; feedback: string[] }
export interface FocusArea { name: string; failedReps: number; totalReps: number; average: number; units: string; target: string; passed: boolean; cue: string }
export interface NamedExercise { id: ExerciseId; name: string }
/** An exercise the model recognised that is not in the library yet; `exercise` is 'proposed' while it counts reps provisionally. */
export interface ExerciseProposal { name: string; family: string; muscles: string[]; confidence: number; reason: string }
export const PROPOSED: ExerciseId = 'proposed'
export interface AnalysisReport { analysisId?: string; modelVersion: string; exercise: ExerciseId | null; exerciseName: string; family: string | null; familyName: string | null; primaryJoint: string | null; candidate: ExerciseId | null; confidence: number; candidates: (NamedExercise & { score: number })[]; alternatives: NamedExercise[]; selectionSource: 'detected' | 'llm' | 'confirmed'; detectionNote: string | null; proposal: ExerciseProposal | null; status: string; repCount: number; score: number | null; durationSeconds: number; reps: AnalysisRep[]; focus: FocusArea[]; headline: string; views: {id: string; view: string; viewSource: string}[]; warnings: string[]; notAssessed: string[]; disclaimer: string }
export const fetchLibrary = () => request<ExerciseLibrary>('/api/analysis/exercises')
export interface TaughtExercise { exercise: LibraryExercise; learned: { primaryJoint: string; cycle: string; reps: number; bottom: number; top: number; seconds: number; view: string }; checks: string[] }
export const teachExercise = (name: string, muscles: string[], streams: CameraStream[], synchronized: boolean, family?: string) => request<TaughtExercise>('/api/analysis/exercises', { method: 'POST', body: { name, muscles, family, streams, synchronized } })
export const forgetExercise = (id: ExerciseId) => request<void>(`/api/analysis/exercises/${id}`, { method: 'DELETE' })
export const evaluate = (streams: CameraStream[], confirmedExercise: ExerciseId | null, synchronized: boolean, persist = false, sessionKey?: string) => request<AnalysisReport>('/api/analysis/evaluate', { method:'POST', body:{streams, confirmedExercise, synchronized, persist, sessionKey} })

/** Human unit suffix for a measured check value ("96°", "1.2 s", "0.4 stance widths"). */
export const formatMeasure = (value: number, units: string) => units === 'degrees' ? `${value}°` : units === '%' ? `${value}%` : `${value} ${units}`
