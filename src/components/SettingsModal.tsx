import { useState } from 'react'
import { BrainCircuit, Settings, Sliders, Volume2, Video, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUserSettings, resetOnboarding } from '@/lib/workoutStore'
import { EXERCISES, type CameraAngle } from '@/lib/simulation'
import OnboardingWizard from '@/components/OnboardingWizard'

export default function SettingsModal() {
  const { settings, updateSettings } = useUserSettings()
  const [open, setOpen] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  const handleRerunOnboarding = () => {
    resetOnboarding()
    setOpen(false)
    setShowWizard(true)
  }

  return (
    <>
      <OnboardingWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hard-shadow-sm border-2 border-foreground bg-background font-mono text-xs font-semibold"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5 text-primary" /> SETTINGS
          </Button>
        </DialogTrigger>

        <DialogContent className="hard-shadow border-2 border-foreground bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serifit text-xl italic flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" /> Live Set Settings
            </DialogTitle>
            <DialogDescription className="mono-data text-[10px] tracking-[0.2em]">
              PERSISTED AUTOMATICALLY TO LOCAL STORAGE ACROSS SESSIONS
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 font-mono text-xs">
            <div className="space-y-2 border-b border-foreground/20 pb-3">
              <label className="flex items-center gap-2 font-bold tracking-wider text-foreground">
                <BrainCircuit className="h-4 w-4 text-primary" /> EXERCISE SELECTION
              </label>
              <p className="text-[10px] text-muted-foreground">
                Choose the movement yourself or let pose geometry suggest one for confirmation.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['manual', 'detect'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSettings({ exerciseSelectionMode: mode })}
                    className={`border-2 border-foreground py-2 font-bold ${settings.exerciseSelectionMode === mode ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                  >
                    {mode === 'manual' ? 'I WILL CHOOSE' : 'AI DETECTION'}
                  </button>
                ))}
              </div>
              {settings.exerciseSelectionMode === 'manual' && (
                <select
                  value={settings.manualExerciseId}
                  onChange={(event) => updateSettings({ manualExerciseId: event.target.value })}
                  className="w-full border-2 border-foreground bg-background p-2 font-mono text-xs hard-shadow-sm focus:outline-none"
                >
                  {EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
                </select>
              )}
              {settings.exerciseSelectionMode === 'detect' && (
                <p className="border-l-2 border-primary pl-2 text-[10px] text-muted-foreground">
                  Scoring starts only after you confirm a stable detection; uncertain matches keep observing.
                </p>
              )}
            </div>

            {/* Camera Angle Preference */}
            <div className="space-y-1.5 border-b border-foreground/20 pb-3">
              <label className="flex items-center gap-2 font-bold tracking-wider text-foreground">
                <Video className="h-4 w-4 text-primary" /> PREFERRED CAMERA ANGLE
              </label>
              <p className="text-[10px] text-muted-foreground">
                Default viewing position for model pose tracking
              </p>
              <select
                value={settings.cameraAnglePreference}
                onChange={(e) => updateSettings({ cameraAnglePreference: e.target.value as CameraAngle | 'Auto' })}
                className="mt-1 w-full border-2 border-foreground bg-background p-2 font-mono text-xs hard-shadow-sm focus:outline-none"
              >
                <option value="Auto">Auto (Smart Match per Exercise)</option>
                <option value="Side">Side View (Squat / Deadlift)</option>
                <option value="Front">Front View (OHP / Curl)</option>
                <option value="Three-quarter">Three-quarter View (Bench)</option>
                <option value="Rear">Rear View</option>
              </select>
            </div>

            {/* Form Sensitivity */}
            <div className="space-y-1.5 border-b border-foreground/20 pb-3">
              <label className="font-bold tracking-wider text-foreground">FORM EVALUATION SENSITIVITY</label>
              <p className="text-[10px] text-muted-foreground">
                Adjust joint deviation tolerance for cue generation
              </p>
              <div className="flex gap-2 pt-1">
                {(['Strict', 'Standard', 'Lenient'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSettings({ sensitivity: mode })}
                    className={`flex-1 border-2 border-foreground py-1.5 text-center font-mono text-[11px] font-bold hard-shadow-sm transition-colors ${
                      settings.sensitivity === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Effort Threshold */}
            <div className="space-y-1.5 border-b border-foreground/20 pb-3">
              <div className="flex justify-between items-center">
                <label className="font-bold tracking-wider text-foreground">EFFORT ALERT THRESHOLD</label>
                <span className="text-primary font-bold">{settings.effortAlertThreshold}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="95"
                step="5"
                value={settings.effortAlertThreshold}
                onChange={(e) => updateSettings({ effortAlertThreshold: Number(e.target.value) })}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            {/* Audio Feedback Toggle */}
            <div className="flex items-center justify-between border-b border-foreground/20 pb-3">
              <div className="space-y-0.5">
                <label className="flex items-center gap-2 font-bold tracking-wider text-foreground">
                  <Volume2 className="h-4 w-4 text-primary" /> REAL-TIME AUDIO CUES
                </label>
                <p className="text-[10px] text-muted-foreground">Spoken cues on critical form breakdown</p>
              </div>
              <input
                type="checkbox"
                checked={settings.audioFeedback}
                onChange={(e) => updateSettings({ audioFeedback: e.target.checked })}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
            </div>

            {/* Re-run Onboarding Signup Wizard */}
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleRerunOnboarding}
                className="w-full border-2 border-primary bg-primary/10 text-primary font-bold hover:bg-primary hover:text-primary-foreground"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> LAUNCH ONBOARDING WIZARD
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setOpen(false)}
              className="hard-shadow-sm border-2 border-foreground bg-foreground text-background font-bold hover:bg-foreground/90"
            >
              SAVE &amp; CLOSE
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
