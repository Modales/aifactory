import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Check,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Sparkles,
  Trophy,
  Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  saveStoredOnboarding,
  getStoredOnboarding,
  type OnboardingData,
} from '@/lib/workoutStore'
import { EXERCISES } from '@/lib/simulation'

interface OnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

const FITNESS_LEVELS = [
  {
    id: 'Beginner',
    label: 'Beginner',
    desc: 'Learning proper lifting mechanics, posture, and movement patterns.',
    icon: Activity,
  },
  {
    id: 'Intermediate',
    label: 'Intermediate',
    desc: 'Consistent lifter focusing on progressive overload and form refinement.',
    icon: Dumbbell,
  },
  {
    id: 'Advanced',
    label: 'Advanced',
    desc: 'High-performance athlete tracking precise bar path, tempo, and effort decay.',
    icon: Trophy,
  },
] as const

const FOCUS_AREAS = [
  { id: 'Strength', label: 'Strength', desc: 'Maximal force production & bar speed' },
  { id: 'Hypertrophy', label: 'Hypertrophy', desc: 'Time under tension & rep volume' },
  { id: 'Technique', label: 'Technique', desc: 'Biomechanical efficiency & joint alignment' },
  { id: 'Mobility', label: 'Mobility', desc: 'Full range of motion & joint depth' },
  { id: 'Endurance', label: 'Endurance', desc: 'High rep stamina & fatigue resistance' },
]

const STRICTNESS_OPTIONS = [
  {
    id: 'Lenient',
    label: 'Relaxed',
    desc: 'Generous angle tolerances. Ideal for warmups, injury rehab, or casual workouts.',
    badge: 'LENIENT TOLERANCE',
  },
  {
    id: 'Standard',
    label: 'Standard',
    desc: 'Balanced feedback for everyday strength training and hyper-accurate tracking.',
    badge: 'BALANCED (RECOMMENDED)',
  },
  {
    id: 'Strict',
    label: 'Strict',
    desc: 'Powerlifting & competition standards. Demands full joint depth and zero breakdown.',
    badge: 'PRO COMPETITION',
  },
] as const

export default function OnboardingWizard({ isOpen, onClose, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const initial = getStoredOnboarding()

  const [fitnessLevel, setFitnessLevel] = useState<OnboardingData['fitnessLevel']>(
    initial.fitnessLevel || 'Intermediate',
  )
  const [targetExercises, setTargetExercises] = useState<string[]>(
    initial.targetExercises.length > 0 ? initial.targetExercises : ['squat', 'bench', 'deadlift'],
  )
  const [focusAreas, setFocusAreas] = useState<string[]>(
    initial.focusAreas.length > 0 ? initial.focusAreas : ['Technique', 'Strength'],
  )
  const [sensitivity, setSensitivity] = useState<OnboardingData['sensitivity']>(
    initial.sensitivity || 'Standard',
  )

  if (!isOpen) return null

  const toggleTargetExercise = (id: string) => {
    setTargetExercises((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const toggleFocusArea = (id: string) => {
    setFocusAreas((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleFinish = () => {
    const data: OnboardingData = {
      completed: true,
      fitnessLevel,
      targetExercises: targetExercises.length > 0 ? targetExercises : ['squat'],
      focusAreas: focusAreas.length > 0 ? focusAreas : ['Technique'],
      sensitivity,
    }
    saveStoredOnboarding(data)
    onComplete?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="hard-shadow relative flex w-full max-w-xl flex-col border-4 border-foreground bg-card text-foreground"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b-4 border-foreground bg-primary px-5 py-3 text-primary-foreground">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.2em]">
            <Zap className="h-4 w-4" /> AI FACTORY // ONBOARDING WIZARD
          </div>
          <div className="font-mono text-xs font-bold">
            STEP {step} / 6
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full bg-foreground/10">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: '0%' }}
            animate={{ width: `${(step / 6) * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        </div>

        {/* Wizard Content Body */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* STEP 1: WELCOME */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="inline-flex items-center gap-2 border-2 border-foreground bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary">
                  <Sparkles className="h-4 w-4" /> NEXT-GEN AI WORKOUT INTELLIGENCE
                </div>
                <h2 className="font-serifit text-3xl font-bold tracking-tight">
                  Welcome to <span className="text-primary italic">AI Factory</span>
                </h2>
                <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                  Transform any device camera into a clinical-grade biomechanical computer vision lab.
                  Track rep counts, joint angles, bar speed, and form breakdown in real-time.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="border-2 border-foreground/30 bg-background p-3 text-xs">
                    <span className="mono-data font-bold text-primary">✦ NO HARDWARE</span>
                    <p className="mt-1 text-[11px] text-muted-foreground">Runs 100% in your browser using MediaPipe AI pose estimation.</p>
                  </div>
                  <div className="border-2 border-foreground/30 bg-background p-3 text-xs">
                    <span className="mono-data font-bold text-primary">✦ LIVE TELEMETRY</span>
                    <p className="mt-1 text-[11px] text-muted-foreground">Rep velocity decay, effort index, and multi-joint form scoring.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2: FITNESS LEVEL */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="mono-data text-xs font-bold tracking-widest text-primary">STEP 2</h3>
                  <h2 className="font-serifit text-2xl font-bold">Select Your Fitness Level</h2>
                  <p className="text-xs text-muted-foreground">Tailors rep detection sensitivity and audio coaching guidance.</p>
                </div>

                <div className="space-y-2.5 pt-1">
                  {FITNESS_LEVELS.map((lvl) => {
                    const Icon = lvl.icon
                    const isSelected = fitnessLevel === lvl.id
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setFitnessLevel(lvl.id)}
                        className={`flex w-full items-start gap-3 border-2 p-3 text-left transition-all ${
                          isSelected
                            ? 'hard-shadow-sm border-foreground bg-primary text-primary-foreground'
                            : 'border-foreground/30 bg-background hover:border-foreground'
                        }`}
                      >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <div className="mono-data font-bold text-xs">{lvl.label}</div>
                          <p className={`mt-0.5 text-[11px] ${isSelected ? 'opacity-90' : 'text-muted-foreground'}`}>
                            {lvl.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 3: TARGET EXERCISES */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="mono-data text-xs font-bold tracking-widest text-primary">STEP 3</h3>
                  <h2 className="font-serifit text-2xl font-bold">Choose Target Movements</h2>
                  <p className="text-xs text-muted-foreground">Select the exercises you plan to track (multiple allowed).</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {EXERCISES.map((ex) => {
                    const isSelected = targetExercises.includes(ex.id)
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => toggleTargetExercise(ex.id)}
                        className={`flex items-center justify-between border-2 px-3 py-2.5 text-left text-xs transition-all ${
                          isSelected
                            ? 'hard-shadow-sm border-foreground bg-primary text-primary-foreground font-bold'
                            : 'border-foreground/30 bg-background text-foreground hover:border-foreground'
                        }`}
                      >
                        <div>
                          <div className="font-serifit text-sm italic leading-tight">{ex.name}</div>
                          <div className="mono-data text-[9px] opacity-75">{ex.primaryMuscles[0]}</div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 4: FOCUS AREAS */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="mono-data text-xs font-bold tracking-widest text-primary">STEP 4</h3>
                  <h2 className="font-serifit text-2xl font-bold">Select Training Focus</h2>
                  <p className="text-xs text-muted-foreground">What metrics matter most during your workouts?</p>
                </div>

                <div className="space-y-2 pt-1">
                  {FOCUS_AREAS.map((fa) => {
                    const isSelected = focusAreas.includes(fa.id)
                    return (
                      <button
                        key={fa.id}
                        type="button"
                        onClick={() => toggleFocusArea(fa.id)}
                        className={`flex w-full items-center justify-between border-2 p-3 text-left text-xs transition-all ${
                          isSelected
                            ? 'hard-shadow-sm border-foreground bg-primary text-primary-foreground font-bold'
                            : 'border-foreground/30 bg-background hover:border-foreground'
                        }`}
                      >
                        <div>
                          <div className="mono-data text-xs font-bold">{fa.label}</div>
                          <p className={`text-[11px] ${isSelected ? 'opacity-90' : 'text-muted-foreground'}`}>
                            {fa.desc}
                          </p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 5: FORM STRICTNESS */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="mono-data text-xs font-bold tracking-widest text-primary">STEP 5</h3>
                  <h2 className="font-serifit text-2xl font-bold">Form Strictness Tolerance</h2>
                  <p className="text-xs text-muted-foreground">Sets the Range of Motion angle required to validate reps.</p>
                </div>

                <div className="space-y-2.5 pt-1">
                  {STRICTNESS_OPTIONS.map((opt) => {
                    const isSelected = sensitivity === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSensitivity(opt.id)}
                        className={`flex w-full flex-col items-start border-2 p-3 text-left transition-all ${
                          isSelected
                            ? 'hard-shadow-sm border-foreground bg-primary text-primary-foreground'
                            : 'border-foreground/30 bg-background hover:border-foreground'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="mono-data font-bold text-xs">{opt.label}</span>
                          <span className={`mono-data border px-1.5 py-0.5 text-[8px] font-bold ${
                            isSelected ? 'border-primary-foreground bg-primary-foreground/20' : 'border-foreground bg-muted'
                          }`}>
                            {opt.badge}
                          </span>
                        </div>
                        <p className={`mt-1 text-[11px] ${isSelected ? 'opacity-90' : 'text-muted-foreground'}`}>
                          {opt.desc}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* STEP 6: FINAL SUMMARY */}
            {step === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="mono-data text-xs font-bold tracking-widest text-primary">FINAL STEP</h3>
                  <h2 className="font-serifit text-2xl font-bold">Setup Complete!</h2>
                  <p className="text-xs text-muted-foreground">Here is your customized AI Factory profile configuration:</p>
                </div>

                <div className="space-y-2 border-2 border-foreground bg-muted/40 p-4 text-xs font-mono">
                  <div className="flex justify-between border-b border-foreground/20 pb-1">
                    <span className="text-muted-foreground">FITNESS LEVEL:</span>
                    <span className="font-bold text-primary">{fitnessLevel}</span>
                  </div>
                  <div className="flex justify-between border-b border-foreground/20 pb-1">
                    <span className="text-muted-foreground">TARGET EXERCISES:</span>
                    <span className="font-bold text-foreground">
                      {targetExercises.map((id) => EXERCISES.find((e) => e.id === id)?.name || id).join(', ')}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-foreground/20 pb-1">
                    <span className="text-muted-foreground">FOCUS AREAS:</span>
                    <span className="font-bold text-foreground">{focusAreas.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FORM STRICTNESS:</span>
                    <span className="font-bold text-primary">{sensitivity}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t-4 border-foreground bg-muted p-4">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="border-2 border-foreground bg-background font-mono text-xs font-bold"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> BACK
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              SKIP FOR NOW
            </Button>
          )}

          {step < 6 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              className="hard-shadow-sm border-2 border-foreground bg-primary font-mono text-xs font-bold text-primary-foreground"
            >
              CONTINUE <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleFinish}
              className="hard-shadow-sm border-2 border-foreground bg-emerald-600 font-mono text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Zap className="mr-1.5 h-4 w-4" /> LAUNCH AI FACTORY
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
