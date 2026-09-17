import { request } from './api'
import type { PoseLandmark } from './pose/types'
export type ExerciseId = 'squat' | 'deadlift' | 'bench' | 'ohp' | 'curl' | 'lunge'
export const exerciseNames: Record<ExerciseId,string> = { squat:'Squat', deadlift:'Deadlift / hip hinge', bench:'Bench press', ohp:'Overhead press', curl:'Biceps curl', lunge:'Lunge' }
export type CameraView = 'auto' | 'side' | 'frontal' | 'oblique'
export interface AnalysisFrame { timestampMs: number; landmarks: Pick<PoseLandmark,'x' | 'y' | 'visibility'>[] }
export interface CameraStream { cameraId: string; view: CameraView; aspectRatio: number; offsetMs: number; frames: AnalysisFrame[] }
export interface FormCheck { name: string; cameraId: string; view: string; value: number; units: string; target: string; score: number; passed: boolean; cue: string }
export interface AnalysisRep { index: number; startMs: number; endMs: number; durationSeconds: number; score: number | null; checks: FormCheck[]; feedback: string[] }
export interface FocusArea { name: string; failedReps: number; totalReps: number; average: number; units: string; target: string; passed: boolean; cue: string }
export interface AnalysisReport { analysisId?: string; modelVersion: string; exercise: ExerciseId | null; exerciseName: string; candidate: ExerciseId | null; confidence: number; selectionSource: string; status: string; repCount: number; score: number | null; durationSeconds: number; reps: AnalysisRep[]; focus: FocusArea[]; headline: string; views: {id: string; view: string; viewSource: string}[]; warnings: string[]; notAssessed: string[]; disclaimer: string }
export const evaluate = (streams: CameraStream[], confirmedExercise: ExerciseId | null, synchronized: boolean, persist = false) => request<AnalysisReport>('/api/analysis/evaluate', { method:'POST', body:{streams, confirmedExercise, synchronized, persist} })

/** Human unit suffix for a measured check value ("96°", "1.2 s", "0.4 stance widths"). */
export const formatMeasure = (value: number, units: string) => units === 'degrees' ? `${value}°` : units === '%' ? `${value}%` : `${value} ${units}`
