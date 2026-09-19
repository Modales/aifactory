import type { MuscleId } from './muscleModel'

export type Movement = 'squat' | 'pushup' | 'hinge' | 'curl' | 'raise' | 'calf'
export interface LibraryExercise {
  id: Movement
  name: string
  family: 'Lower body' | 'Upper body'
  equipment: string
  description: string
  phases: [string, string, string]
  cues: [string, string, string]
  demand: Partial<Record<MuscleId, number>>
}
export const EXERCISES: LibraryExercise[] = [
  { id: 'squat', name: 'Bodyweight squat', family: 'Lower body', equipment: 'Bodyweight', description: 'A foundational knee-and-hip movement. Sit between your hips, then drive the floor away.', phases: ['Stand tall', 'Lower with control', 'Drive to standing'], cues: ['Brace gently and keep your whole foot grounded.', 'Let your knees track with your toes; keep your chest lifted.', 'Push through the floor and finish tall without leaning back.'], demand: { quads: 95, glutes: 88, hip_adductors: 62, rectus_abdominis: 58, hamstrings: 48 } },
  { id: 'pushup', name: 'Push-up', family: 'Upper body', equipment: 'Bodyweight', description: 'Move as one long line while the chest and triceps lower and press your body.', phases: ['Strong plank', 'Lower your chest', 'Press the floor away'], cues: ['Stack your hands below your shoulders and brace your trunk.', 'Keep your elbows angled back, not flared straight out.', 'Press evenly through both hands; move hips and shoulders together.'], demand: { mid_chest: 95, upper_chest: 76, lower_chest: 80, triceps_long: 78, triceps_lateral: 80, anterior_delts: 66, rectus_abdominis: 58 } },
  { id: 'hinge', name: 'Hip hinge', family: 'Lower body', equipment: 'Bodyweight', description: 'Learn to move through your hips with a quiet spine before adding a deadlift load.', phases: ['Stand and brace', 'Send the hips back', 'Extend the hips'], cues: ['Keep a soft bend in the knees and ribs stacked over the pelvis.', 'Fold at the hips; keep your neck in line with your back.', 'Squeeze the glutes to stand, without arching your lower back.'], demand: { glutes: 90, hamstrings: 88, erector_spinae: 60, rectus_abdominis: 45 } },
  { id: 'curl', name: 'Dumbbell curl', family: 'Upper body', equipment: 'Dumbbells', description: 'A controlled elbow flexion. Keep the upper arm still and let the biceps do the work.', phases: ['Set your shoulders', 'Curl smoothly', 'Lower slowly'], cues: ['Stand tall, palms forward, elbows close to your sides.', 'Bring the weights up without swinging your hips or shoulders.', 'Control the descent and avoid snapping your elbows straight.'], demand: { biceps_long: 94, biceps_short: 86, brachialis: 72 } },
  { id: 'raise', name: 'Lateral raise', family: 'Upper body', equipment: 'Dumbbells', description: 'Lift out to the sides with light weights to train the shoulder’s lateral head.', phases: ['Stand tall', 'Lift outwards', 'Return with control'], cues: ['Choose a light weight and keep a soft bend in your elbows.', 'Lead with the elbows and stop near shoulder height; do not shrug.', 'Lower slowly without dropping the weights into your thighs.'], demand: { lateral_delts: 95, anterior_delts: 44, rear_delts: 40, traps: 50 } },
  { id: 'calf', name: 'Standing calf raise', family: 'Lower body', equipment: 'Bodyweight', description: 'Rise through the balls of your feet, then return your heels to the floor slowly.', phases: ['Find your balance', 'Lift your heels', 'Lower your heels'], cues: ['Keep the knees soft and weight spread across the balls of your feet.', 'Lift straight up without rolling onto the outer edges of your feet.', 'Return both heels to the floor with control.'], demand: { calves: 95, glutes: 25, rectus_abdominis: 30 } },
]
export interface LibraryRoutine {
  id: string
  name: string
  focus: string
  description: string
  rounds: number
  rest: string
  steps: { exerciseId: Movement; prescription: string }[]
}
export const ROUTINES: LibraryRoutine[] = [
  { id: 'foundation', name: 'Full-body foundations', focus: 'Full body · No equipment', description: 'A balanced bodyweight sequence for learning the basics. Start with 3–5 minutes of easy movement; finish with a gentle walk.', rounds: 3, rest: '45–60 sec between exercises · 90 sec between rounds', steps: [{ exerciseId: 'squat', prescription: '10–12 reps' }, { exerciseId: 'pushup', prescription: '6–10 reps' }, { exerciseId: 'hinge', prescription: '10–12 reps' }, { exerciseId: 'calf', prescription: '12–15 reps' }] },
  { id: 'upper', name: 'Upper-body essentials', focus: 'Upper body · Dumbbells', description: 'Press, curl, and raise with deliberate control. Warm up the shoulders for 3–5 minutes; use light dumbbells and finish with easy arm movements.', rounds: 3, rest: '60 sec between exercises · 90 sec between rounds', steps: [{ exerciseId: 'pushup', prescription: '6–10 reps' }, { exerciseId: 'curl', prescription: '10–12 reps' }, { exerciseId: 'raise', prescription: '10–12 reps' }] },
  { id: 'lower', name: 'Lower-body control', focus: 'Lower body · No equipment', description: 'Build control from hips to ankles. Begin with 3–5 minutes of walking and easy squats; finish with relaxed walking.', rounds: 3, rest: '45–60 sec between exercises · 90 sec between rounds', steps: [{ exerciseId: 'squat', prescription: '10–12 reps' }, { exerciseId: 'hinge', prescription: '10–12 reps' }, { exerciseId: 'calf', prescription: '12–15 reps' }] },
]
export const DEMO_SECONDS = 12
export const REP_SECONDS = 6
export const exerciseById = (id: Movement) => EXERCISES.find(exercise => exercise.id === id)!

export function playbackPosition(time: number, sequence: LibraryExercise[]) {
  const total = sequence.length * DEMO_SECONDS
  const bounded = Math.max(0, Math.min(time, total))
  const index = Math.min(sequence.length - 1, Math.floor(bounded / DEMO_SECONDS))
  const local = bounded === total ? DEMO_SECONDS : bounded - index * DEMO_SECONDS
  const cycle = (local % REP_SECONDS) / REP_SECONDS
  const phase = cycle < .12 || cycle > .96 ? 0 : cycle < .5 ? 1 : 2
  return { index, local, cycle, phase, exercise: sequence[index], total }
}
