import type { MuscleId } from './muscleModel'

export type Movement =
  | 'squat' | 'pushup' | 'hinge' | 'split-squat' | 'glute-bridge' | 'overhead-press' | 'bent-row' | 'deadlift'
  | 'curl' | 'hammer-curl' | 'raise' | 'front-raise' | 'reverse-fly' | 'triceps-extension' | 'calf' | 'kickback'
  | 'bird-dog' | 'dead-bug' | 'wall-slide' | 'hip-flexor' | 'thoracic-rotation' | 'external-rotation' | 'ankle-rock' | 'cat-cow'
export type ExerciseCategory = 'Strength foundations' | 'Bodybuilding accessories' | 'Mobility & rehab'
export type CameraFocus = 'full' | 'upper' | 'lower' | 'floor'

export interface LibraryExercise {
  id: Movement
  name: string
  category: ExerciseCategory
  family: 'Lower body' | 'Upper body' | 'Full body' | 'Core & mobility'
  equipment: 'Bodyweight' | 'Dumbbells' | 'Resistance band'
  cameraFocus: CameraFocus
  description: string
  phases: [string, string, string]
  cues: [string, string, string]
  demand: Partial<Record<MuscleId, number>>
}

const strength = (exercise: Omit<LibraryExercise, 'category'>): LibraryExercise => ({ ...exercise, category: 'Strength foundations' })
const accessory = (exercise: Omit<LibraryExercise, 'category'>): LibraryExercise => ({ ...exercise, category: 'Bodybuilding accessories' })
const mobility = (exercise: Omit<LibraryExercise, 'category'>): LibraryExercise => ({ ...exercise, category: 'Mobility & rehab' })

export const EXERCISES: LibraryExercise[] = [
  strength({ id: 'squat', name: 'Bodyweight squat', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'A foundational knee-and-hip movement. Sit between your hips, then drive the floor away.', phases: ['Stand tall', 'Lower with control', 'Drive to standing'], cues: ['Brace gently and keep your whole foot grounded.', 'Let your knees track with your toes; keep your chest lifted.', 'Push through the floor and finish tall without leaning back.'], demand: { quads: 95, glutes: 88, hip_adductors: 62, rectus_abdominis: 58, hamstrings: 48 } }),
  strength({ id: 'pushup', name: 'Push-up', family: 'Upper body', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Move as one long line while the chest and triceps lower and press your body.', phases: ['Strong plank', 'Lower your chest', 'Press the floor away'], cues: ['Stack hands below shoulders and brace your trunk.', 'Keep elbows angled back while hips and shoulders descend together.', 'Press evenly through both hands and keep your ribs controlled.'], demand: { mid_chest: 95, upper_chest: 76, lower_chest: 80, triceps_long: 78, triceps_lateral: 80, anterior_delts: 66, rectus_abdominis: 58 } }),
  strength({ id: 'hinge', name: 'Hip hinge', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'Learn to move through your hips with a quiet spine before adding load.', phases: ['Stand and brace', 'Send hips back', 'Extend the hips'], cues: ['Keep a soft bend in the knees and ribs stacked.', 'Fold at the hips with a long neck and quiet spine.', 'Squeeze the glutes to stand without leaning back.'], demand: { glutes: 90, hamstrings: 88, erector_spinae: 60, rectus_abdominis: 45 } }),
  strength({ id: 'split-squat', name: 'Split squat', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'Build single-leg strength and control from a stable split stance.', phases: ['Set split stance', 'Drop straight down', 'Drive through front foot'], cues: ['Keep both feet on train tracks rather than a tightrope.', 'Lower the back knee while the front knee tracks over the toes.', 'Push the whole front foot into the floor to rise.'], demand: { quads: 92, glutes: 82, hamstrings: 42, calves: 30 } }),
  strength({ id: 'glute-bridge', name: 'Glute bridge', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Train hip extension while keeping the ribs and pelvis connected.', phases: ['Set feet and ribs', 'Lift the hips', 'Lower with control'], cues: ['Place feet under knees and gently brace.', 'Drive through your heels until shoulders, hips, and knees align.', 'Lower one vertebra at a time without letting knees fall out.'], demand: { glutes: 96, hamstrings: 64, rectus_abdominis: 44 } }),
  strength({ id: 'overhead-press', name: 'Dumbbell overhead press', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Press overhead with stacked wrists and a stable ribcage.', phases: ['Rack at shoulders', 'Press overhead', 'Return to rack'], cues: ['Stack wrists over elbows and keep ribs down.', 'Press up and slightly inward without shrugging.', 'Lower the weights to shoulder height with control.'], demand: { anterior_delts: 92, lateral_delts: 72, triceps_lateral: 70, traps: 45 } }),
  strength({ id: 'bent-row', name: 'Dumbbell bent-over row', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Hold a strong hinge while drawing the weights toward your ribs.', phases: ['Find your hinge', 'Pull to the ribs', 'Reach long again'], cues: ['Brace in a comfortable hinge with long arms.', 'Drive elbows back without twisting or shrugging.', 'Lower until the shoulder blades can glide forward.'], demand: { lats: 94, rear_delts: 70, traps: 65, biceps_long: 55, erector_spinae: 52 } }),
  strength({ id: 'deadlift', name: 'Dumbbell deadlift', family: 'Full body', equipment: 'Dumbbells', cameraFocus: 'lower', description: 'A loaded hinge that keeps the weights close to the legs.', phases: ['Stand with the load', 'Hinge to mid-shin', 'Drive the floor away'], cues: ['Set the weights close to your thighs and brace.', 'Push hips back as the weights travel close to your legs.', 'Stand by extending the hips and knees together.'], demand: { glutes: 94, hamstrings: 86, quads: 58, erector_spinae: 62, traps: 42 } }),

  accessory({ id: 'curl', name: 'Dumbbell curl', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Controlled elbow flexion with the palms turned forward.', phases: ['Set shoulders', 'Curl smoothly', 'Lower slowly'], cues: ['Stand tall with palms forward and elbows near your sides.', 'Bring the weights up without swinging the shoulders.', 'Control the descent and keep the palms facing forward.'], demand: { biceps_long: 94, biceps_short: 86, brachialis: 72 } }),
  accessory({ id: 'hammer-curl', name: 'Hammer curl', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Curl with a neutral grip to emphasize the brachialis and forearm.', phases: ['Neutral grip', 'Curl to shoulders', 'Control the return'], cues: ['Point both thumbs forward and keep wrists straight.', 'Keep elbows still while the forearms rise.', 'Lower until the arms are long without losing posture.'], demand: { brachialis: 94, biceps_long: 72, biceps_short: 62 } }),
  accessory({ id: 'raise', name: 'Lateral raise', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Lift out to the sides with light weights to train the lateral delts.', phases: ['Stand tall', 'Lift outwards', 'Return with control'], cues: ['Keep a soft bend in your elbows and wrists neutral.', 'Lead with the elbows and stop near shoulder height.', 'Lower slowly without dropping the weights.'], demand: { lateral_delts: 95, anterior_delts: 44, rear_delts: 40, traps: 50 } }),
  accessory({ id: 'front-raise', name: 'Dumbbell front raise', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Raise the weights in front while the torso stays quiet.', phases: ['Weights at thighs', 'Raise to shoulder level', 'Lower without swinging'], cues: ['Set the ribs and keep a soft elbow.', 'Lift in front without leaning back.', 'Lower slowly until the weights meet the thighs.'], demand: { anterior_delts: 95, upper_chest: 40, lateral_delts: 35 } }),
  accessory({ id: 'reverse-fly', name: 'Bent-over reverse fly', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Open the arms from a hinge to train the rear shoulders and upper back.', phases: ['Hold the hinge', 'Open the arms', 'Return beneath chest'], cues: ['Keep your neck long and torso still.', 'Reach wide with the elbows rather than shrugging.', 'Bring the weights together with control.'], demand: { rear_delts: 95, traps: 72, lats: 42 } }),
  accessory({ id: 'triceps-extension', name: 'Overhead triceps extension', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Extend the elbows overhead while keeping the upper arms steady.', phases: ['Elbows point up', 'Extend overhead', 'Lower behind head'], cues: ['Keep elbows comfortably narrow and ribs controlled.', 'Straighten the elbows without moving the upper arms.', 'Lower slowly until you feel a comfortable stretch.'], demand: { triceps_long: 96, triceps_lateral: 78, anterior_delts: 30 } }),
  accessory({ id: 'calf', name: 'Standing calf raise', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'Rise through the balls of your feet, then lower the heels slowly.', phases: ['Find balance', 'Lift the heels', 'Lower the heels'], cues: ['Spread pressure across the ball of each foot.', 'Lift straight up without rolling to the outer foot.', 'Return both heels to the floor with control.'], demand: { calves: 95, glutes: 25, rectus_abdominis: 30 } }),
  accessory({ id: 'kickback', name: 'Dumbbell triceps kickback', family: 'Upper body', equipment: 'Dumbbells', cameraFocus: 'upper', description: 'Hold a hinge and extend the elbows behind the body.', phases: ['Hinge and pin elbows', 'Straighten the arms', 'Return to ninety'], cues: ['Keep the upper arms in line with your torso.', 'Extend from the elbows without lifting the shoulders.', 'Return slowly while the upper arms stay still.'], demand: { triceps_lateral: 94, triceps_long: 84, rear_delts: 36 } }),

  mobility({ id: 'bird-dog', name: 'Bird dog', family: 'Core & mobility', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Reach opposite arm and leg while the trunk stays level.', phases: ['Set all fours', 'Reach long', 'Return under control'], cues: ['Stack shoulders over hands and hips over knees.', 'Reach long rather than high; keep the pelvis level.', 'Return quietly without shifting your weight.'], demand: { rectus_abdominis: 72, glutes: 58, erector_spinae: 52, rear_delts: 30 } }),
  mobility({ id: 'dead-bug', name: 'Dead bug', family: 'Core & mobility', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Coordinate opposite arm and leg while the lower back stays supported.', phases: ['Stack limbs', 'Reach opposite sides', 'Return to center'], cues: ['Exhale gently and keep the ribs heavy.', 'Reach only as far as you can keep the trunk still.', 'Return over the hips and shoulders before switching.'], demand: { rectus_abdominis: 86, quads: 42, anterior_delts: 25 } }),
  mobility({ id: 'wall-slide', name: 'Wall slide', family: 'Upper body', equipment: 'Bodyweight', cameraFocus: 'upper', description: 'Glide the arms overhead while maintaining comfortable rib and shoulder control.', phases: ['Set against wall', 'Slide overhead', 'Return to goalpost'], cues: ['Keep the ribs relaxed and forearms comfortably back.', 'Slide only through a pain-free range.', 'Pull elbows down without shrugging.'], demand: { rear_delts: 56, traps: 52, anterior_delts: 38 } }),
  mobility({ id: 'hip-flexor', name: 'Half-kneeling hip flexor', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'A controlled kneeling shift for the front of the hip.', phases: ['Set half-kneeling', 'Tuck and glide', 'Return gently'], cues: ['Squeeze the back-leg glute and tuck the pelvis slightly.', 'Glide forward without arching the lower back.', 'Ease out of the stretch and keep your balance.'], demand: { quads: 70, glutes: 36, rectus_abdominis: 28 } }),
  mobility({ id: 'thoracic-rotation', name: 'Open-book rotation', family: 'Core & mobility', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Rotate through the upper back while the hips remain stacked.', phases: ['Stack hands', 'Open the chest', 'Close with control'], cues: ['Keep knees together and reach both hands forward.', 'Follow the opening hand with your eyes.', 'Return slowly without letting the hips roll back.'], demand: { erector_spinae: 62, rear_delts: 42, rectus_abdominis: 34 } }),
  mobility({ id: 'external-rotation', name: 'Band external rotation', family: 'Upper body', equipment: 'Resistance band', cameraFocus: 'upper', description: 'Rotate the forearms outward while keeping elbows close to the ribs.', phases: ['Elbows at sides', 'Rotate apart', 'Return slowly'], cues: ['Keep wrists straight and elbows gently against your sides.', 'Open the forearms without moving the upper arms.', 'Control the band as the hands return.'], demand: { rear_delts: 72, traps: 34, lateral_delts: 28 } }),
  mobility({ id: 'ankle-rock', name: 'Knee-to-wall ankle rock', family: 'Lower body', equipment: 'Bodyweight', cameraFocus: 'lower', description: 'Guide the knee over the toes while keeping the heel grounded.', phases: ['Plant the foot', 'Drive knee forward', 'Return to start'], cues: ['Keep the whole foot heavy on the floor.', 'Track the knee over the middle toes without lifting the heel.', 'Move back smoothly and repeat in a comfortable range.'], demand: { calves: 62, quads: 28 } }),
  mobility({ id: 'cat-cow', name: 'Cat–cow', family: 'Core & mobility', equipment: 'Bodyweight', cameraFocus: 'floor', description: 'Move the spine gradually between flexion and extension on all fours.', phases: ['Neutral all fours', 'Round the spine', 'Open the chest'], cues: ['Spread the floor with your hands and begin neutral.', 'Exhale as you gently round from pelvis to neck.', 'Inhale into a comfortable arch without collapsing the shoulders.'], demand: { erector_spinae: 58, rectus_abdominis: 48, traps: 24 } }),
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
  { id: 'foundation', name: 'Full-body foundations', focus: 'Strength · Full body', description: 'A balanced sequence for learning the core movement patterns.', rounds: 3, rest: '45–60 sec between exercises · 90 sec between rounds', steps: [{ exerciseId: 'squat', prescription: '10–12 reps' }, { exerciseId: 'pushup', prescription: '6–10 reps' }, { exerciseId: 'hinge', prescription: '10–12 reps' }, { exerciseId: 'bent-row', prescription: '8–12 reps' }] },
  { id: 'accessory', name: 'Upper-body detail', focus: 'Bodybuilding · Dumbbells', description: 'Controlled accessory work for shoulders, arms, and upper back.', rounds: 3, rest: '45 sec between exercises · 75 sec between rounds', steps: [{ exerciseId: 'curl', prescription: '10–12 reps' }, { exerciseId: 'raise', prescription: '10–15 reps' }, { exerciseId: 'reverse-fly', prescription: '10–15 reps' }, { exerciseId: 'triceps-extension', prescription: '10–12 reps' }] },
  { id: 'restore', name: 'Move and restore', focus: 'Mobility & rehab · No equipment', description: 'A low-intensity sequence for trunk control and comfortable range.', rounds: 2, rest: 'Move slowly · Rest whenever needed', steps: [{ exerciseId: 'cat-cow', prescription: '6–8 reps' }, { exerciseId: 'bird-dog', prescription: '6–8 reps' }, { exerciseId: 'wall-slide', prescription: '8–10 reps' }, { exerciseId: 'ankle-rock', prescription: '8–10 reps' }] },
  { id: 'lower', name: 'Lower-body control', focus: 'Strength + mobility · Lower body', description: 'Build control from hips to ankles with deliberate tempo.', rounds: 3, rest: '45–60 sec between exercises · 90 sec between rounds', steps: [{ exerciseId: 'split-squat', prescription: '8–10 reps' }, { exerciseId: 'glute-bridge', prescription: '10–15 reps' }, { exerciseId: 'calf', prescription: '12–15 reps' }, { exerciseId: 'ankle-rock', prescription: '8–10 reps' }] },
]
export const EXERCISE_CATEGORIES: ('All' | ExerciseCategory)[] = ['All', 'Strength foundations', 'Bodybuilding accessories', 'Mobility & rehab']
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
