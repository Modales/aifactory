"""Data-driven exercise library for the 2D movement engine.

Every exercise is a plain JSON-able spec so user-taught exercises (``learn()``) share the exact
same code path as the built-ins:

    primary / cycle / rest / work   which joint angle defines a repetition and its hysteresis gates
    signature                       (key, stat, lo, hi[, scale]) bands the observed motion must fit to be recognised
    checks                          graded form checks templated on measured statistics
    muscles                         demand priors for the anatomy heatmap
    variantOf                       variants share a parent's signature; pose alone cannot separate them,
                                    so the parent is detected and the variants are offered as alternatives

Angle conventions: knee/hip/elbow 180° = straight; shoulder = elbow-shoulder-hip (arm hanging ≈ 15°,
overhead ≈ 170°); trunk = lean from vertical (0 upright, 90 horizontal); *Y/hipAnkle/reach are
torso-length ratios (standing hipAnkle ≈ 2, seated ≈ 1, lying ≈ 0).
"""
from statistics import median
from uuid import uuid4
from .features import ANGLE_KEYS, extrema_envelope, stat

DEG = 'degrees'
# Softness of the signature bands: how far outside [lo, hi] a statistic can sit before its fit hits 0.
SCALE = {'trunk': 20, 'footSplit': .6, 'hipAsym': 20, 'kneeAsym': 20, 'wristY': .5, 'wristHip': .5, 'kneeHip': .5, 'hipAnkle': .6, 'reach': .5, 'shoulderDrift': .3, 'handsApart': .8, 'stance': .3, 'overhead': 40}
DEFAULT_SCALE = 25
FAMILIES = {
    'squat': 'Squats', 'lunge': 'Lunges & single leg', 'hinge': 'Hinges & deadlifts', 'glute': 'Glute bridges & thrusts',
    'vertical_press': 'Overhead pressing', 'horizontal_press': 'Chest pressing', 'pushup': 'Push-ups & dips',
    'vertical_pull': 'Pull-ups & pulldowns', 'row': 'Rows', 'shoulder': 'Shoulder isolation', 'arm': 'Arms',
    'core': 'Core', 'legs': 'Leg isolation & calves', 'conditioning': 'Conditioning', 'custom': 'Your exercises',
}


def check(name, key, statistic, target, tolerance, direction, ok, fix, units=DEG, view='side'):
    return {'name': name, 'key': key, 'stat': statistic, 'target': target, 'tolerance': tolerance,
            'direction': direction, 'units': units, 'ok': ok, 'fix': fix, 'view': view}


def tempo(target, tolerance, fix):
    return check('Tempo', '_tempo', 'tempo', target, tolerance, 'min', 'Rep took {v}s — controlled.', fix, units='s')


def depth(name, target, tolerance, ok, fix, direction='max'):
    return check(name, '_primary', 'bottom', target, tolerance, direction, ok, fix)


def lockout(name, target, tolerance, ok, fix, direction='min'):
    return check(name, '_primary', 'top', target, tolerance, direction, ok, fix)


def trunk_at_bottom(name, target, tolerance, ok, fix):
    return check(name, 'trunk', 'atBottom', target, tolerance, 'max', ok, fix)


def back_lean(target=15, tolerance=20):
    return check('Back lean', 'trunk', 'p90', target, tolerance, 'max', 'Torso stayed within {v}° of vertical.',
                 'Torso leaned {v}° from vertical, {d}° past the {t}° guide. Brace the core and avoid arching the lower back.')


KNEE_TRACKING = check('Frontal knee tracking', 'kneeTrack', 'median', .35, .5, 'max',
                      'Knees tracked over the feet ({v} stance widths of drift).',
                      'Knees drifted {v} stance widths from the feet. Push the knees out over the toes.', units='stance widths', view='frontal')

FLEX, EXTEND = 'flex', 'extend'
_LIBRARY: dict[str, dict] = {}


def ex(id, name, family, primary, cycle, rest, work, signature, checks, muscles, views=('side',), min_seconds=.6):
    spec = {'id': id, 'name': name, 'family': family, 'primary': primary, 'cycle': cycle, 'rest': rest, 'work': work,
            'views': list(views), 'signature': [list(s) for s in signature], 'checks': checks, 'muscles': muscles,
            'variantOf': None, 'custom': False, 'minSeconds': min_seconds}
    _LIBRARY[id] = spec
    return spec


def variant(id, name, of, muscles=None):
    parent = _LIBRARY[of]
    spec = {**parent, 'id': id, 'name': name, 'muscles': muscles or parent['muscles'], 'variantOf': of}
    _LIBRARY[id] = spec
    return spec


standing = ('hipAnkle', 'median', 1.1, 3.5)
seated = ('hipAnkle', 'median', .25, 1.1)
lying = ('hipAnkle', 'median', -.8, .7)
upright = ('trunk', 'median', 0, 25)
horizontal = ('trunk', 'median', 55, 90)
still_knees = ('knee', 'range', 0, 22)
still_hips = ('hip', 'range', 0, 22)
still_elbows = ('elbow', 'range', 0, 28)

# ─── Squats ───────────────────────────────────────────────────────────────────────────────────
ex('squat', 'Squat', 'squat', 'knee', FLEX, 150, 125,
   [('knee', 'range', 35, 140), ('hip', 'range', 20, 120), still_elbows, ('trunk', 'median', 0, 60), ('trunk', 'p90', 0, 50), ('kneeAsym', 'median', 0, 25),
    ('footSplit', 'median', 0, .7), standing, ('hipAnkle', 'range', .3, 1.8), ('wristY', 'median', -1.4, .6)],
   [depth('Squat depth', 100, 30, 'Knee bent to {v}° — at or below parallel.', 'Knee only bent to {v}°, {d}° short of parallel ({t}°). Sit deeper — hips back and down.'),
    lockout('Stand-up lockout', 155, 25, 'Stood up to {v}° — full extension.', 'Finished at {v}°, {d}° short of standing tall. Drive all the way up before the next rep.'),
    trunk_at_bottom('Torso angle at the bottom', 45, 25, 'Torso stayed {v}° from vertical at the bottom — chest up.', 'Torso folded {v}° forward at the bottom, {d}° past the {t}° guide. Brace and keep your chest up.'),
    tempo(1.5, 1.0, 'Rep took {v}s — fast for a squat. Slow the descent to about 2 seconds.'), KNEE_TRACKING],
   {'quads': 95, 'glutes': 88, 'hip_adductors': 62, 'rectus_abdominis': 58, 'obliques': 55, 'erector_spinae': 58, 'hamstrings': 48, 'calves': 35})
variant('back_squat', 'Back squat', 'squat')
variant('front_squat', 'Front squat', 'squat', {'quads': 96, 'glutes': 80, 'rectus_abdominis': 66, 'obliques': 60, 'erector_spinae': 64, 'hip_adductors': 55, 'hamstrings': 38})
variant('goblet_squat', 'Goblet squat', 'squat', {'quads': 92, 'glutes': 84, 'rectus_abdominis': 62, 'obliques': 58, 'erector_spinae': 55, 'hip_adductors': 58, 'anterior_delts': 30, 'biceps_short': 28})
variant('box_squat', 'Box squat', 'squat')
variant('dumbbell_squat', 'Dumbbell squat', 'squat', {'quads': 92, 'glutes': 86, 'hip_adductors': 60, 'erector_spinae': 55, 'forearms': 40, 'traps': 35})
variant('bodyweight_squat', 'Bodyweight squat', 'squat')
ex('overhead_squat', 'Overhead squat', 'squat', 'knee', FLEX, 150, 125,
   [('knee', 'range', 35, 140), ('hip', 'range', 20, 120), still_elbows, ('wristY', 'median', .7, 2.5), ('shoulder', 'median', 130, 180), standing, ('kneeAsym', 'median', 0, 25)],
   [depth('Squat depth', 100, 30, 'Knee bent to {v}° — at or below parallel.', 'Knee only bent to {v}°, {d}° short of parallel ({t}°). Sit deeper — hips back and down.'),
    lockout('Stand-up lockout', 155, 25, 'Stood up to {v}° — full extension.', 'Finished at {v}°, {d}° short of standing tall.'),
    check('Bar stays overhead', 'shoulder', 'p10', 140, 40, 'min', 'Arms stayed overhead ({v}° shoulder angle).', 'Arms dropped to {v}° — {d}° short of vertical. Punch the bar up and keep it over the mid-foot.'),
    trunk_at_bottom('Torso angle at the bottom', 35, 25, 'Torso stayed {v}° from vertical — upright.', 'Torso folded {v}° forward, {d}° past the {t}° guide. Stay tall so the bar stays overhead.'),
    tempo(1.5, 1.0, 'Rep took {v}s — fast. Control the descent.')],
   {'quads': 90, 'glutes': 82, 'anterior_delts': 60, 'lateral_delts': 50, 'traps': 58, 'erector_spinae': 70, 'rectus_abdominis': 68, 'obliques': 64, 'triceps_long': 40})
ex('thruster', 'Thruster', 'squat', 'knee', FLEX, 150, 125,
   [('knee', 'range', 35, 140), ('hip', 'range', 20, 120), ('elbow', 'range', 40, 140), ('wristY', 'p90', .5, 2.5), standing, ('kneeAsym', 'median', 0, 25)],
   [depth('Squat depth', 100, 30, 'Knee bent to {v}° — at or below parallel.', 'Knee only bent to {v}°, {d}° short of parallel ({t}°). Sit deeper before you drive up.'),
    check('Overhead lockout', 'elbow', 'p90', 155, 25, 'min', 'Elbows locked out at {v}° overhead.', 'Elbows finished at {v}°, {d}° short of lockout. Finish the press every rep.'),
    tempo(1.0, .6, 'Rep took {v}s — rushed. Reach a full squat before you press.')],
   {'quads': 88, 'glutes': 84, 'anterior_delts': 82, 'triceps_long': 66, 'triceps_lateral': 60, 'lateral_delts': 55, 'rectus_abdominis': 60, 'erector_spinae': 62})
variant('jump_squat', 'Jump squat', 'squat', {'quads': 92, 'glutes': 90, 'calves': 70, 'hamstrings': 55, 'rectus_abdominis': 50})

# ─── Lunges & single leg ────────────────────────────────────────────────────────────────────────
ex('lunge', 'Lunge', 'lunge', 'knee', FLEX, 150, 125,
   [('knee', 'range', 35, 140), ('otherKnee', 'range', 20, 130), ('footSplit', 'median', .8, 3.5), ('hipAsym', 'p90', 25, 180), standing, ('trunk', 'median', 0, 45), still_elbows],
   [depth('Lunge depth', 100, 30, 'Front knee bent to {v}° — good depth.', 'Front knee only bent to {v}°, {d}° short of {t}°. Step longer and drop the back knee lower.'),
    lockout('Stand-up lockout', 155, 25, 'Returned to {v}° — full extension.', 'Finished at {v}°, {d}° short of standing tall. Push fully back to standing.'),
    trunk_at_bottom('Upright torso', 25, 25, 'Torso stayed {v}° from vertical — tall.', 'Torso leaned {v}° forward, {d}° past the {t}° guide. Stay tall — eyes forward.'),
    tempo(1.2, .8, 'Rep took {v}s — rushed. Lower for a full second before driving up.'), KNEE_TRACKING],
   {'quads': 88, 'glutes': 86, 'hamstrings': 58, 'hip_adductors': 52, 'calves': 48, 'rectus_abdominis': 46, 'obliques': 46})
variant('reverse_lunge', 'Reverse lunge', 'lunge', {'glutes': 90, 'quads': 82, 'hamstrings': 62, 'hip_adductors': 50, 'calves': 40, 'obliques': 45})
variant('walking_lunge', 'Walking lunge', 'lunge')
variant('split_squat', 'Split squat', 'lunge')
variant('bulgarian_split_squat', 'Bulgarian split squat', 'lunge', {'quads': 90, 'glutes': 90, 'hamstrings': 60, 'hip_adductors': 55, 'obliques': 50})
variant('step_up', 'Step-up', 'lunge', {'quads': 86, 'glutes': 88, 'hamstrings': 52, 'calves': 50, 'obliques': 44})
ex('pistol_squat', 'Pistol squat', 'lunge', 'knee', FLEX, 150, 120,
   [('knee', 'range', 45, 150), ('otherKnee', 'range', 0, 25), ('otherKnee', 'median', 140, 180), ('kneeAsym', 'p90', 40, 180), ('hipAnkle', 'range', .5, 2)],
   [depth('Depth', 90, 30, 'Knee bent to {v}° — deep.', 'Knee only bent to {v}°, {d}° short of {t}°. Sit lower while the free leg stays straight.'),
    lockout('Stand-up lockout', 155, 25, 'Stood up to {v}°.', 'Finished at {v}°, {d}° short of standing tall.'),
    check('Free leg straight', 'otherKnee', 'p10', 150, 30, 'min', 'Free leg stayed at {v}° — straight.', 'Free leg bent to {v}°, {d}° short of straight. Lock the free knee out in front.'),
    tempo(2.0, 1.2, 'Rep took {v}s — quick for a pistol. Lower slowly.')],
   {'quads': 96, 'glutes': 90, 'hamstrings': 55, 'hip_adductors': 60, 'calves': 55, 'rectus_abdominis': 60, 'obliques': 62})

# ─── Hinges ────────────────────────────────────────────────────────────────────────────────────
ex('deadlift', 'Deadlift', 'hinge', 'hip', FLEX, 155, 120,
   [('hip', 'range', 35, 120), ('knee', 'range', 10, 70), ('trunk', 'range', 25, 90), ('trunk', 'p90', 45, 95), still_elbows, ('wristHip', 'median', -1.2, .1), standing, ('hipAnkle', 'range', 0, .9)],
   [depth('Hip hinge depth', 115, 35, 'Hips hinged to {v}° — full hinge.', 'Hips only hinged to {v}°, {d}° short of {t}°. Push the hips back further before bending the knees.'),
    lockout('Hip lockout', 155, 25, 'Hips locked out at {v}°.', 'Hips finished at {v}°, {d}° short of lockout. Stand tall and squeeze the glutes at the top.'),
    check('Knee bend', 'knee', 'p10', 100, 30, 'min', 'Knees bent to {v}° — shins stayed fairly vertical.', 'Knees bent to {v}°, {d}° more than a hinge needs. This is drifting toward a squat — keep shins vertical, hips back.'),
    check('Upright finish', 'trunk', 'tail', 15, 20, 'max', 'Torso finished {v}° from vertical.', 'Torso finished {v}° from vertical, {d}° past the {t}° guide. Finish standing fully upright.'),
    tempo(1.5, 1.0, 'Rep took {v}s — quick. Control the bar down for at least a second.')],
   {'erector_spinae': 94, 'glutes': 84, 'hamstrings': 82, 'lats': 65, 'traps': 62, 'quads': 58, 'forearms': 55, 'rectus_abdominis': 54, 'obliques': 54})
variant('sumo_deadlift', 'Sumo deadlift', 'deadlift', {'glutes': 90, 'quads': 75, 'hip_adductors': 80, 'erector_spinae': 80, 'hamstrings': 70, 'traps': 58, 'forearms': 55})
variant('trap_bar_deadlift', 'Trap-bar deadlift', 'deadlift', {'quads': 78, 'glutes': 86, 'erector_spinae': 84, 'hamstrings': 70, 'traps': 64, 'forearms': 58})
ex('romanian_deadlift', 'Romanian deadlift', 'hinge', 'hip', FLEX, 155, 125,
   [('hip', 'range', 35, 120), ('knee', 'range', 0, 24), ('knee', 'median', 140, 180), ('trunk', 'range', 30, 90), still_elbows, ('wristHip', 'median', -1.4, .1), standing],
   [depth('Hinge depth', 120, 35, 'Hips hinged to {v}° with soft knees.', 'Hips only hinged to {v}°, {d}° short of {t}°. Push the hips back until the hamstrings load.'),
    lockout('Hip lockout', 158, 25, 'Hips locked out at {v}°.', 'Hips finished at {v}°, {d}° short of lockout. Stand tall between reps.'),
    check('Knees stay soft, not bent', 'knee', 'p10', 140, 30, 'min', 'Knees stayed at {v}° — a true hinge.', 'Knees bent to {v}°, {d}° more than an RDL wants. Keep shins vertical; this is turning into a squat.'),
    tempo(2.0, 1.2, 'Rep took {v}s — quick. Take 2–3 seconds on the way down.')],
   {'hamstrings': 95, 'glutes': 86, 'erector_spinae': 80, 'lats': 45, 'traps': 50, 'forearms': 50, 'rectus_abdominis': 40})
variant('single_leg_rdl', 'Single-leg Romanian deadlift', 'romanian_deadlift', {'hamstrings': 92, 'glutes': 92, 'erector_spinae': 70, 'obliques': 60, 'calves': 40})
variant('stiff_leg_deadlift', 'Stiff-leg deadlift', 'romanian_deadlift')
ex('good_morning', 'Good morning', 'hinge', 'hip', FLEX, 155, 125,
   [('hip', 'range', 35, 110), ('knee', 'range', 0, 30), ('trunk', 'range', 30, 90), ('wristY', 'median', -.5, .5), still_elbows, standing],
   [depth('Hinge depth', 115, 35, 'Hips hinged to {v}°.', 'Hips only hinged to {v}°, {d}° short of {t}°. Bow forward until the torso is near parallel.'),
    lockout('Hip lockout', 158, 25, 'Hips locked out at {v}°.', 'Hips finished at {v}°, {d}° short of lockout.'),
    tempo(2.0, 1.2, 'Rep took {v}s — quick. Lower under control.')],
   {'hamstrings': 88, 'erector_spinae': 92, 'glutes': 84, 'rectus_abdominis': 40})
ex('kettlebell_swing', 'Kettlebell swing', 'hinge', 'hip', FLEX, 155, 125,
   [('hip', 'range', 35, 120), ('knee', 'range', 10, 60), ('wristHip', 'range', .8, 3), ('shoulder', 'range', 45, 150), standing],
   [depth('Hinge depth', 120, 35, 'Hips hinged to {v}° on the backswing.', 'Hips only hinged to {v}°, {d}° short of {t}°. Hike the bell back between the legs.'),
    lockout('Hip snap', 165, 20, 'Hips snapped to {v}° at the top.', 'Hips finished at {v}°, {d}° short of a full snap. Stand tall and squeeze the glutes.'),
    check('Knee bend', 'knee', 'p10', 110, 30, 'min', 'Knees bent to {v}° — a hinge, not a squat.', 'Knees bent to {v}°, {d}° too much. Keep shins vertical and hinge instead of squatting.'),
    tempo(.8, .5, 'Rep took {v}s — let the bell float; it should feel rhythmic.')],
   {'glutes': 95, 'hamstrings': 88, 'erector_spinae': 80, 'lats': 55, 'anterior_delts': 45, 'forearms': 55, 'rectus_abdominis': 58, 'obliques': 55}, min_seconds=.4)

# ─── Glute bridges ─────────────────────────────────────────────────────────────────────────────
ex('glute_bridge', 'Glute bridge', 'glute', 'hip', EXTEND, 125, 150,
   [('hip', 'range', 25, 90), ('hip', 'start', 80, 140), still_knees, lying, ('trunk', 'median', 35, 90), ('trunk', 'range', 0, 30)],
   [depth('Hip extension', 165, 30, 'Hips extended to {v}° — full bridge.', 'Hips only reached {v}°, {d}° short of {t}°. Drive through the heels and squeeze the glutes at the top.', direction='min'),
    lockout('Lower fully', 120, 30, 'Hips lowered to {v}° between reps.', 'Hips only lowered to {v}°, {d}° above {t}°. Lower to the floor before the next rep.', direction='max'),
    tempo(1.2, .8, 'Rep took {v}s — pause a second at the top.')],
   {'glutes': 95, 'hamstrings': 70, 'erector_spinae': 45, 'rectus_abdominis': 40, 'quads': 25})
variant('hip_thrust', 'Hip thrust', 'glute_bridge', {'glutes': 98, 'hamstrings': 68, 'quads': 40, 'erector_spinae': 40, 'rectus_abdominis': 40})
variant('single_leg_glute_bridge', 'Single-leg glute bridge', 'glute_bridge')

# ─── Overhead pressing ──────────────────────────────────────────────────────────────────────────
ex('ohp', 'Overhead press', 'vertical_press', 'elbow', FLEX, 150, 120,
   [('elbow', 'range', 40, 140), ('shoulder', 'range', 35, 140), still_knees, still_hips, upright, ('wristY', 'p90', .5, 2.5), ('wristY', 'range', .5, 2.5), standing],
   [depth('Bottom position', 90, 30, 'Elbows bent to {v}° — bar reached chin level.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower the bar to about chin height each rep.'),
    lockout('Overhead lockout', 155, 25, 'Elbows locked out at {v}° overhead.', 'Elbows finished at {v}°, {d}° short of lockout. Press until the arms are straight.'),
    check('Finish over the shoulders', 'overhead', 'tailPct', 50, 50, 'min', 'Wrists finished above the shoulders.', 'Wrists stayed in front of the shoulders at the top. Finish with the bar stacked over the shoulders.', units='%'),
    back_lean(), tempo(1.2, .8, 'Rep took {v}s — quick. Lower the bar under control.')],
   {'anterior_delts': 95, 'lateral_delts': 76, 'triceps_long': 78, 'triceps_lateral': 70, 'upper_chest': 38, 'traps': 54, 'rectus_abdominis': 54, 'obliques': 52})
variant('dumbbell_shoulder_press', 'Dumbbell shoulder press', 'ohp')
variant('landmine_press', 'Landmine press', 'ohp', {'anterior_delts': 88, 'upper_chest': 62, 'triceps_long': 70, 'obliques': 55, 'rectus_abdominis': 50})
ex('seated_shoulder_press', 'Seated shoulder press', 'vertical_press', 'elbow', FLEX, 150, 120,
   [('elbow', 'range', 40, 140), ('shoulder', 'range', 35, 140), seated, ('knee', 'median', 60, 125), upright, ('wristY', 'p90', .5, 2.5), ('wristY', 'range', .5, 2.5)],
   [depth('Bottom position', 90, 30, 'Elbows bent to {v}° — handles at ear level.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower until the elbows are at about 90°.'),
    lockout('Overhead lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of lockout. Press to straight arms.'),
    back_lean(20, 20), tempo(1.2, .8, 'Rep took {v}s — quick. Lower under control.')],
   {'anterior_delts': 94, 'lateral_delts': 78, 'triceps_long': 76, 'triceps_lateral': 70, 'upper_chest': 36, 'traps': 45})
variant('arnold_press', 'Arnold press', 'seated_shoulder_press', {'anterior_delts': 95, 'lateral_delts': 82, 'triceps_long': 70, 'upper_chest': 40})
variant('machine_shoulder_press', 'Machine shoulder press', 'seated_shoulder_press')
ex('push_press', 'Push press', 'vertical_press', 'elbow', FLEX, 150, 120,
   [('elbow', 'range', 40, 140), ('knee', 'range', 15, 60), ('hip', 'range', 0, 40), upright, ('wristY', 'p90', .5, 2.5), standing],
   [lockout('Overhead lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of lockout. Finish every press.'),
    check('Dip depth', 'knee', 'p10', 120, 30, 'min', 'Dipped to {v}° — a short, fast dip.', 'Dipped to {v}°, {d}° too deep. Keep the dip shallow and quick.'),
    back_lean(20, 20), tempo(.8, .5, 'Rep took {v}s — the dip-drive should be quicker.')],
   {'anterior_delts': 88, 'triceps_long': 74, 'lateral_delts': 66, 'quads': 55, 'glutes': 50, 'traps': 60, 'rectus_abdominis': 55}, min_seconds=.4)

# ─── Chest pressing (lying) ─────────────────────────────────────────────────────────────────────
ex('bench', 'Bench press', 'horizontal_press', 'elbow', FLEX, 150, 120,
   [('elbow', 'range', 40, 130), horizontal, ('wristY', 'median', .1, 1.8), lying, ('knee', 'median', 50, 145), ('shoulder', 'range', 20, 100)],
   [depth('Bar depth', 90, 30, 'Elbows bent to {v}° — bar reached the chest.', 'Elbows only bent to {v}°, {d}° short of {t}°. Bring the bar all the way to the chest.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of lockout. Press to full extension.'),
    tempo(1.2, .8, 'Rep took {v}s — fast. Lower the bar under control.')],
   {'mid_chest': 95, 'lower_chest': 80, 'upper_chest': 68, 'triceps_lateral': 76, 'triceps_long': 72, 'anterior_delts': 66, 'lats': 28})
variant('dumbbell_bench_press', 'Dumbbell bench press', 'bench', {'mid_chest': 94, 'lower_chest': 76, 'upper_chest': 66, 'anterior_delts': 68, 'triceps_lateral': 66, 'triceps_long': 60})
variant('close_grip_bench', 'Close-grip bench press', 'bench', {'triceps_lateral': 92, 'triceps_long': 88, 'mid_chest': 72, 'anterior_delts': 60})
variant('floor_press', 'Floor press', 'bench')
ex('incline_bench', 'Incline bench press', 'horizontal_press', 'elbow', FLEX, 150, 120,
   [('elbow', 'range', 40, 130), ('trunk', 'median', 28, 58), ('wristY', 'median', .2, 1.8), ('hipAnkle', 'median', -.3, 1.2), ('shoulder', 'range', 20, 100)],
   [depth('Bar depth', 90, 30, 'Elbows bent to {v}° — bar reached the upper chest.', 'Elbows only bent to {v}°, {d}° short of {t}°. Touch the upper chest each rep.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of lockout.'),
    tempo(1.2, .8, 'Rep took {v}s — fast. Lower under control.')],
   {'upper_chest': 95, 'mid_chest': 72, 'anterior_delts': 78, 'triceps_lateral': 70, 'triceps_long': 66})
variant('incline_dumbbell_press', 'Incline dumbbell press', 'incline_bench')
ex('chest_fly', 'Chest fly', 'horizontal_press', 'shoulder', FLEX, 80, 55,
   [('shoulder', 'range', 30, 110), ('elbow', 'range', 0, 32), horizontal, ('wristY', 'median', .1, 1.8), lying],
   [depth('Stretch at the bottom', 55, 30, 'Arms opened to a {v}° shoulder angle.', 'Arms only opened to {v}°, {d}° short of {t}°. Open the arms wider for the stretch.'),
    check('Elbows stay soft', 'elbow', 'range', 30, 30, 'max', 'Elbow angle changed {v}° — the arms stayed long.', 'Elbow angle changed {v}° — {d}° more than a fly. Keep the elbows fixed; this is turning into a press.'),
    tempo(1.5, 1.0, 'Rep took {v}s — quick. Slow the stretch.')],
   {'mid_chest': 92, 'lower_chest': 70, 'upper_chest': 60, 'anterior_delts': 55, 'biceps_short': 25})
ex('pullover', 'Dumbbell pullover', 'horizontal_press', 'shoulder', FLEX, 100, 60,
   [('shoulder', 'range', 60, 170), ('elbow', 'range', 0, 35), horizontal, lying, ('reach', 'range', .6, 2.5)],
   [depth('Reach behind the head', 150, 30, 'Arms reached a {v}° shoulder angle overhead.', 'Arms only reached {v}°, {d}° short of {t}°. Let the weight travel further behind the head.', direction='min'),
    check('Elbows stay soft', 'elbow', 'range', 35, 30, 'max', 'Elbow angle changed {v}°.', 'Elbow angle changed {v}° — keep the arms long.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the stretch.')],
   {'lats': 85, 'mid_chest': 60, 'triceps_long': 55, 'rectus_abdominis': 40})

# ─── Push-ups & dips ──────────────────────────────────────────────────────────────────────────
ex('pushup', 'Push-up', 'pushup', 'elbow', FLEX, 150, 115,
   [('elbow', 'range', 40, 120), horizontal, ('wristY', 'median', -1.8, -.25), ('hip', 'median', 145, 180), lying, still_knees],
   [depth('Push-up depth', 95, 30, 'Elbows bent to {v}° — chest to the floor.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower until the chest nearly touches.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of straight. Press all the way up.'),
    check('Hips in line', 'hip', 'p10', 150, 30, 'min', 'Hips stayed at {v}° — a straight line.', 'Hips sagged to {v}°, {d}° out of line. Brace the core and squeeze the glutes.'),
    tempo(1.2, .8, 'Rep took {v}s — quick. Lower under control.')],
   {'mid_chest': 88, 'lower_chest': 70, 'triceps_lateral': 78, 'triceps_long': 70, 'anterior_delts': 66, 'rectus_abdominis': 60, 'obliques': 50})
variant('diamond_pushup', 'Diamond push-up', 'pushup', {'triceps_lateral': 92, 'triceps_long': 86, 'mid_chest': 78, 'anterior_delts': 60, 'rectus_abdominis': 55})
variant('wide_pushup', 'Wide push-up', 'pushup', {'mid_chest': 94, 'lower_chest': 72, 'anterior_delts': 70, 'triceps_lateral': 62, 'rectus_abdominis': 55})
ex('incline_pushup', 'Incline push-up', 'pushup', 'elbow', FLEX, 150, 115,
   [('elbow', 'range', 40, 120), ('trunk', 'median', 30, 62), ('wristY', 'median', -1.6, -.2), ('hip', 'median', 145, 180)],
   [depth('Push-up depth', 95, 30, 'Elbows bent to {v}°.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower the chest to the surface.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of straight.'),
    check('Hips in line', 'hip', 'p10', 150, 30, 'min', 'Hips stayed at {v}°.', 'Hips sagged to {v}° — brace the core.'),
    tempo(1.2, .8, 'Rep took {v}s — quick. Lower under control.')],
   {'lower_chest': 80, 'mid_chest': 80, 'triceps_lateral': 72, 'anterior_delts': 60, 'rectus_abdominis': 50})
ex('knee_pushup', 'Knee push-up', 'pushup', 'elbow', FLEX, 150, 115,
   [('elbow', 'range', 40, 120), ('trunk', 'median', 45, 90), ('wristY', 'median', -1.8, -.25), ('knee', 'median', 50, 125), lying],
   [depth('Push-up depth', 95, 30, 'Elbows bent to {v}°.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower the chest toward the floor.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of straight.'),
    check('Hips in line', 'hip', 'p10', 145, 30, 'min', 'Hips stayed at {v}°.', 'Hips bent to {v}° — keep a straight line from knees to shoulders.'),
    tempo(1.2, .8, 'Rep took {v}s — lower under control.')],
   {'mid_chest': 82, 'triceps_lateral': 72, 'triceps_long': 64, 'anterior_delts': 60, 'rectus_abdominis': 50})
ex('dips', 'Dips', 'pushup', 'elbow', FLEX, 150, 115,
   [('elbow', 'range', 45, 120), ('shoulder', 'range', 25, 90), ('shoulderDrift', 'p90', .3, 1.4), ('trunk', 'median', 0, 40), ('wristY', 'median', -1.6, -.4), ('hipAnkle', 'median', .4, 2.6), ('shoulder', 'median', 0, 70)],
   [depth('Dip depth', 90, 30, 'Elbows bent to {v}° — upper arm about parallel.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower until the upper arm is parallel.'),
    lockout('Lockout', 155, 25, 'Elbows locked out at {v}°.', 'Elbows finished at {v}°, {d}° short of straight. Press to the top every rep.'),
    tempo(1.5, 1.0, 'Rep took {v}s — quick. Lower slowly to protect the shoulders.')],
   {'lower_chest': 88, 'triceps_lateral': 88, 'triceps_long': 84, 'anterior_delts': 66, 'mid_chest': 60})
variant('bench_dips', 'Bench dips', 'dips', {'triceps_lateral': 90, 'triceps_long': 86, 'anterior_delts': 60, 'lower_chest': 55})

# ─── Vertical pulling ──────────────────────────────────────────────────────────────────────────
ex('pullup', 'Pull-up', 'vertical_pull', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 50, 130), ('wristY', 'median', .5, 1.8), ('wristY', 'range', 0, .45), ('shoulder', 'median', 100, 180), ('hipAnkle', 'median', .4, 2.6), ('trunk', 'median', 0, 40)],
   [depth('Pull height', 70, 30, 'Elbows closed to {v}° — chin over the bar.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull until the chin clears the bar.'),
    lockout('Full hang', 155, 25, 'Arms extended to {v}° at the bottom.', 'Arms only opened to {v}°, {d}° short of a dead hang. Lower fully each rep.'),
    check('Body stays quiet', 'hip', 'range', 30, 30, 'max', 'Hips moved {v}° — no kipping.', 'Hips swung {v}°, {d}° more than a strict rep. Keep the legs still.'),
    tempo(1.5, 1.0, 'Rep took {v}s — control the lowering phase.')],
   {'lats': 96, 'biceps_long': 78, 'biceps_short': 72, 'brachialis': 68, 'rear_delts': 55, 'traps': 58, 'forearms': 60, 'rectus_abdominis': 40})
variant('chinup', 'Chin-up', 'pullup', {'lats': 90, 'biceps_short': 88, 'biceps_long': 84, 'brachialis': 66, 'rear_delts': 45, 'traps': 52, 'forearms': 60})
variant('neutral_grip_pullup', 'Neutral-grip pull-up', 'pullup')
variant('assisted_pullup', 'Assisted pull-up', 'pullup')
ex('lat_pulldown', 'Lat pulldown', 'vertical_pull', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 50, 130), ('wristY', 'median', .2, 1.8), seated, ('knee', 'median', 60, 125), ('trunk', 'median', 0, 40)],
   [depth('Pull depth', 75, 30, 'Elbows closed to {v}° — bar to the upper chest.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull the bar to the upper chest.'),
    lockout('Full stretch', 155, 25, 'Arms extended to {v}° at the top.', 'Arms only opened to {v}°, {d}° short of a full stretch. Let the lats stretch fully.'),
    check('Torso stays tall', 'trunk', 'range', 20, 25, 'max', 'Torso moved {v}° — stable.', 'Torso rocked {v}°, {d}° more than it should. Stay tall and pull with the arms.'),
    tempo(1.5, 1.0, 'Rep took {v}s — control the return.')],
   {'lats': 95, 'biceps_short': 70, 'biceps_long': 66, 'brachialis': 60, 'rear_delts': 55, 'traps': 55, 'forearms': 45})
variant('straight_arm_pulldown', 'Straight-arm pulldown', 'lat_pulldown', {'lats': 92, 'triceps_long': 50, 'rear_delts': 45, 'rectus_abdominis': 35})

# ─── Rows ──────────────────────────────────────────────────────────────────────────────────────
ex('bent_over_row', 'Bent-over row', 'row', 'elbow', FLEX, 150, 110,
   [('elbow', 'range', 45, 120), ('trunk', 'median', 30, 85), ('hip', 'median', 75, 145), ('hip', 'range', 0, 25), still_knees, ('wristY', 'median', -1.8, -.4), standing],
   [depth('Row height', 80, 30, 'Elbows closed to {v}° — bar to the torso.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull the bar all the way to the ribs.'),
    lockout('Full stretch', 155, 25, 'Arms extended to {v}° at the bottom.', 'Arms only opened to {v}°, {d}° short of a full stretch.'),
    check('Torso stays fixed', 'trunk', 'range', 15, 20, 'max', 'Torso moved only {v}° — strict.', 'Torso heaved {v}°, {d}° more than a strict row. Hold the hinge and pull with the back.'),
    tempo(1.2, .8, 'Rep took {v}s — quick. Control the lowering phase.')],
   {'lats': 92, 'traps': 74, 'rear_delts': 72, 'biceps_short': 62, 'biceps_long': 58, 'erector_spinae': 68, 'forearms': 55, 'hamstrings': 40})
variant('dumbbell_row', 'Dumbbell row', 'bent_over_row')
variant('pendlay_row', 'Pendlay row', 'bent_over_row')
variant('t_bar_row', 'T-bar row', 'bent_over_row')
ex('seated_row', 'Seated cable row', 'row', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 45, 120), ('trunk', 'median', 0, 35), seated, ('reach', 'range', .4, 1.8), ('wristHip', 'median', -.4, .9), ('knee', 'median', 100, 175)],
   [depth('Row depth', 75, 30, 'Elbows closed to {v}° — handle to the torso.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull the handle to the stomach.'),
    lockout('Full stretch', 155, 25, 'Arms extended to {v}°.', 'Arms only opened to {v}°, {d}° short of a full stretch.'),
    check('Torso stays tall', 'trunk', 'range', 20, 25, 'max', 'Torso moved {v}° — stable.', 'Torso rocked {v}°, {d}° more than it should. Sit tall and row with the back.'),
    tempo(1.2, .8, 'Rep took {v}s — control the return.')],
   {'lats': 90, 'traps': 72, 'rear_delts': 70, 'biceps_short': 62, 'biceps_long': 56, 'erector_spinae': 50, 'forearms': 50})
variant('machine_row', 'Machine row', 'seated_row')
ex('inverted_row', 'Inverted row', 'row', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 45, 120), horizontal, ('wristY', 'median', .2, 1.6), lying, ('knee', 'median', 140, 180), ('hip', 'median', 150, 180)],
   [depth('Row height', 75, 30, 'Elbows closed to {v}° — chest to the bar.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull the chest to the bar.'),
    lockout('Full stretch', 155, 25, 'Arms extended to {v}°.', 'Arms only opened to {v}°, {d}° short of straight.'),
    check('Body straight', 'hip', 'p10', 150, 30, 'min', 'Hips stayed at {v}° — plank-straight.', 'Hips sagged to {v}° — squeeze the glutes and keep a straight line.'),
    tempo(1.2, .8, 'Rep took {v}s — control the lowering phase.')],
   {'lats': 85, 'traps': 72, 'rear_delts': 74, 'biceps_short': 60, 'biceps_long': 56, 'rectus_abdominis': 50, 'glutes': 35})
ex('face_pull', 'Face pull', 'shoulder', 'elbow', FLEX, 150, 110,
   [('elbow', 'range', 40, 110), upright, ('wristY', 'median', -.3, .4), ('shoulder', 'median', 55, 115), ('reach', 'range', .4, 1.6), standing],
   [depth('Pull to the face', 80, 30, 'Elbows closed to {v}° — handles beside the ears.', 'Elbows only closed to {v}°, {d}° short of {t}°. Pull the rope all the way to the face.'),
    lockout('Full stretch', 155, 25, 'Arms extended to {v}°.', 'Arms only opened to {v}°, {d}° short of straight.'),
    check('Elbows stay high', 'shoulder', 'p10', 60, 30, 'min', 'Elbows stayed high ({v}° shoulder angle).', 'Elbows dropped to {v}°, {d}° below the {t}° guide. Keep the elbows at shoulder height.'),
    tempo(1.2, .8, 'Rep took {v}s — pause at the face for a second.')],
   {'rear_delts': 92, 'traps': 70, 'lateral_delts': 45, 'biceps_short': 35, 'lats': 30})

# ─── Shoulder isolation ────────────────────────────────────────────────────────────────────────
ex('lateral_raise', 'Lateral raise', 'shoulder', 'shoulder', EXTEND, 40, 65,
   [('shoulder', 'range', 35, 110), ('shoulder', 'start', 0, 55), ('elbow', 'range', 0, 30), upright, standing, still_knees],
   [depth('Raise height', 80, 30, 'Arms raised to a {v}° shoulder angle — about shoulder height.', 'Arms only raised to {v}°, {d}° short of {t}°. Lift until the hands reach shoulder height.', direction='min'),
    lockout('Lower fully', 35, 25, 'Arms lowered to {v}° between reps.', 'Arms only lowered to {v}°, {d}° above {t}°. Let the arms come back to the sides.', direction='max'),
    check('Elbows stay soft', 'elbow', 'range', 30, 30, 'max', 'Elbow angle changed {v}°.', 'Elbow angle changed {v}° — keep a fixed, slightly bent elbow.'),
    check('No body swing', 'trunk', 'range', 10, 15, 'max', 'Torso moved {v}° — strict.', 'Torso swung {v}° — lighten the load and lift with the shoulders only.'),
    tempo(1.5, 1.0, 'Rep took {v}s — lower slowly for 2 seconds.')],
   {'lateral_delts': 96, 'anterior_delts': 45, 'traps': 45, 'rear_delts': 30}, views=('frontal', 'side'))
variant('cable_lateral_raise', 'Cable lateral raise', 'lateral_raise')
ex('front_raise', 'Front raise', 'shoulder', 'shoulder', EXTEND, 40, 65,
   [('shoulder', 'range', 45, 120), ('shoulder', 'start', 0, 55), ('elbow', 'range', 0, 30), upright, ('reach', 'p90', .7, 2.5), ('wristY', 'p90', -.3, .6), standing],
   [depth('Raise height', 85, 30, 'Arms raised to {v}° — shoulder height.', 'Arms only raised to {v}°, {d}° short of {t}°. Lift until the hands reach eye level.', direction='min'),
    lockout('Lower fully', 35, 25, 'Arms lowered to {v}°.', 'Arms only lowered to {v}° — return to the thighs each rep.', direction='max'),
    check('No body swing', 'trunk', 'range', 10, 15, 'max', 'Torso moved {v}° — strict.', 'Torso swung {v}° — lighten the load and stay still.'),
    tempo(1.5, 1.0, 'Rep took {v}s — lower slowly.')],
   {'anterior_delts': 95, 'upper_chest': 40, 'lateral_delts': 45, 'rectus_abdominis': 25})
ex('rear_delt_fly', 'Rear delt fly', 'shoulder', 'shoulder', EXTEND, 40, 65,
   [('shoulder', 'range', 35, 110), ('elbow', 'range', 0, 35), ('trunk', 'median', 35, 90), ('hip', 'median', 70, 140), still_hips],
   [depth('Raise height', 80, 30, 'Arms raised to a {v}° shoulder angle.', 'Arms only raised to {v}°, {d}° short of {t}°. Lift the arms out to shoulder level.', direction='min'),
    check('Elbows stay soft', 'elbow', 'range', 35, 30, 'max', 'Elbow angle changed {v}°.', 'Elbow angle changed {v}° — keep the arms long; this is turning into a row.'),
    check('Torso stays fixed', 'trunk', 'range', 12, 20, 'max', 'Torso moved {v}° — strict.', 'Torso heaved {v}° — hold the hinge still.'),
    tempo(1.5, 1.0, 'Rep took {v}s — lower slowly.')],
   {'rear_delts': 95, 'traps': 60, 'lateral_delts': 40, 'erector_spinae': 35})
variant('reverse_pec_deck', 'Reverse pec deck', 'rear_delt_fly')
ex('upright_row', 'Upright row', 'shoulder', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 50, 130), upright, ('shoulder', 'p90', 55, 120), ('wristY', 'median', -1.2, .2), ('reach', 'median', 0, .6), standing],
   [depth('Pull height', 75, 30, 'Elbows closed to {v}° — bar at chest height.', 'Elbows only closed to {v}°, {d}° short of {t}°. Lead with the elbows to chest height.'),
    lockout('Lower fully', 155, 25, 'Arms extended to {v}°.', 'Arms only opened to {v}° — straighten fully at the bottom.'),
    check('Elbows lead', 'shoulder', 'p90', 60, 30, 'min', 'Elbows rose to a {v}° shoulder angle.', 'Elbows only reached {v}°, {d}° short of {t}°. Drive the elbows up and out.'),
    tempo(1.2, .8, 'Rep took {v}s — lower under control.')],
   {'lateral_delts': 82, 'traps': 88, 'anterior_delts': 50, 'biceps_short': 40, 'forearms': 45})
ex('shrug', 'Shrug', 'shoulder', 'wristHip', EXTEND, -.95, -.8,
   [('wristHip', 'range', .12, .5, .1), ('ankle', 'range', 0, 10, 10), still_elbows, still_knees, still_hips, upright, standing, ('shoulder', 'median', 0, 30)],
   [check('Shrug height', '_primary', 'bottom', -.8, .3, 'min', 'Hands rose to {v} torso-lengths below the hip.', 'Hands only rose to {v}, {d} short of {t}. Pull the shoulders straight up to the ears.', units='torso lengths'),
    tempo(1.2, .8, 'Rep took {v}s — hold the top for a second.')],
   {'traps': 98, 'forearms': 50, 'lateral_delts': 25})

# ─── Arms ──────────────────────────────────────────────────────────────────────────────────────
ex('curl', 'Biceps curl', 'arm', 'elbow', FLEX, 150, 100,
   [('elbow', 'range', 50, 140), ('trunk', 'median', 0, 22), ('shoulderDrift', 'range', 0, .45), ('shoulder', 'range', 0, 32), ('shoulder', 'p90', 0, 55), ('wristY', 'p90', -.7, .35), standing, still_knees],
   [depth('Curl range', 60, 30, 'Elbow closed to {v}° — full curl.', 'Elbow only closed to {v}°, {d}° short of a full curl ({t}°). Squeeze all the way up.'),
    lockout('Full extension', 150, 25, 'Arm extended to {v}° at the bottom.', 'Arm only opened to {v}°, {d}° short of straight. Lower fully before the next curl.'),
    check('Upper-arm stability', 'shoulderDrift', 'range', .3, .3, 'max', 'Upper arm moved {v} torso-lengths — pinned.', 'Upper arm swung {v} torso-lengths — keep the elbows pinned to your sides; consider a lighter load.', units='torso lengths'),
    tempo(1.5, 1.0, 'Rep took {v}s — swinging. Take 2 seconds on the way down.')],
   {'biceps_long': 94, 'biceps_short': 86, 'brachialis': 70, 'forearms': 66, 'anterior_delts': 18})
variant('hammer_curl', 'Hammer curl', 'curl', {'brachialis': 92, 'forearms': 84, 'biceps_long': 78, 'biceps_short': 66})
variant('barbell_curl', 'Barbell curl', 'curl')
variant('cable_curl', 'Cable curl', 'curl')
variant('reverse_curl', 'Reverse curl', 'curl', {'forearms': 92, 'brachialis': 84, 'biceps_long': 55, 'biceps_short': 50})
ex('concentration_curl', 'Concentration curl', 'arm', 'elbow', FLEX, 150, 90,
   [('elbow', 'range', 50, 140), seated, ('trunk', 'median', 15, 65), ('shoulderDrift', 'range', 0, .3)],
   [depth('Curl range', 55, 30, 'Elbow closed to {v}°.', 'Elbow only closed to {v}°, {d}° short of {t}°. Curl all the way to the shoulder.'),
    lockout('Full extension', 150, 25, 'Arm extended to {v}°.', 'Arm only opened to {v}°, {d}° short of straight.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the negative.')],
   {'biceps_short': 95, 'biceps_long': 85, 'brachialis': 68, 'forearms': 50})
variant('preacher_curl', 'Preacher curl', 'concentration_curl', {'biceps_short': 96, 'biceps_long': 80, 'brachialis': 70, 'forearms': 55})
ex('tricep_pushdown', 'Triceps pushdown', 'arm', 'elbow', EXTEND, 100, 140,
   [('elbow', 'range', 50, 120), ('elbow', 'start', 50, 120), upright, ('wristY', 'median', -1.6, -.5), ('shoulder', 'median', 0, 40), ('shoulderDrift', 'range', 0, .35), standing],
   [depth('Full extension', 160, 25, 'Elbows extended to {v}° — locked out.', 'Elbows only extended to {v}°, {d}° short of {t}°. Push until the arms are straight.', direction='min'),
    lockout('Return to 90°', 95, 30, 'Elbows returned to {v}°.', 'Elbows only returned to {v}°, {d}° short of {t}°. Let the forearm come back up to parallel.', direction='max'),
    check('Upper-arm stability', 'shoulderDrift', 'range', .25, .3, 'max', 'Upper arm moved {v} torso-lengths — pinned.', 'Upper arm swung {v} torso-lengths — pin the elbows to your sides.', units='torso lengths'),
    tempo(1.2, .8, 'Rep took {v}s — control the return.')],
   {'triceps_lateral': 95, 'triceps_long': 82, 'forearms': 35})
variant('rope_pushdown', 'Rope pushdown', 'tricep_pushdown')
ex('overhead_tricep_extension', 'Overhead triceps extension', 'arm', 'elbow', EXTEND, 100, 140,
   [('elbow', 'range', 50, 120), ('elbow', 'start', 40, 120), ('shoulder', 'median', 125, 180), ('shoulder', 'range', 0, 35), ('wristY', 'median', .3, 1.8)],
   [depth('Full extension', 160, 25, 'Elbows extended to {v}° overhead.', 'Elbows only extended to {v}°, {d}° short of {t}°. Lock the arms out overhead.', direction='min'),
    lockout('Stretch at the bottom', 90, 30, 'Elbows bent to {v}° behind the head.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower further behind the head for a stretch.', direction='max'),
    check('Upper arms stay vertical', 'shoulder', 'p10', 130, 30, 'min', 'Upper arms stayed at {v}° — vertical.', 'Upper arms dropped to {v}°, {d}° short of vertical. Keep the elbows pointing up.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the stretch.')],
   {'triceps_long': 96, 'triceps_lateral': 78, 'rectus_abdominis': 25})
ex('skullcrusher', 'Skull crusher', 'arm', 'elbow', EXTEND, 100, 140,
   [('elbow', 'range', 50, 120), ('elbow', 'start', 40, 125), horizontal, lying, ('shoulder', 'range', 0, 35), ('wristY', 'median', .2, 1.8)],
   [depth('Full extension', 160, 25, 'Elbows extended to {v}°.', 'Elbows only extended to {v}°, {d}° short of {t}°. Lock the arms out.', direction='min'),
    lockout('Lower to the forehead', 90, 30, 'Elbows bent to {v}°.', 'Elbows only bent to {v}°, {d}° short of {t}°. Lower the bar to the forehead.', direction='max'),
    check('Upper arms stay still', 'shoulder', 'range', 30, 30, 'max', 'Upper arm moved {v}° — isolated.', 'Upper arm swung {v}° — keep the elbows pointed at the ceiling.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the lowering phase.')],
   {'triceps_long': 94, 'triceps_lateral': 84, 'forearms': 30})

# ─── Core ──────────────────────────────────────────────────────────────────────────────────────
ex('situp', 'Sit-up', 'core', 'trunk', FLEX, 70, 40,
   [('trunk', 'range', 35, 90), ('hip', 'range', 30, 110), ('knee', 'median', 50, 135), lying, still_knees],
   [depth('Sit up fully', 35, 25, 'Torso came up to {v}° from vertical.', 'Torso only came up to {v}°, {d}° short of {t}°. Sit all the way up toward the knees.'),
    lockout('Lower fully', 70, 20, 'Torso lowered to {v}° — back to the floor.', 'Torso only lowered to {v}°, {d}° short of flat. Lower the shoulders to the floor between reps.'),
    tempo(1.2, .8, 'Rep took {v}s — slow down; no momentum.')],
   {'rectus_abdominis': 95, 'obliques': 60, 'transverse_abdominis': 55, 'quads': 30})
ex('crunch', 'Crunch', 'core', 'trunk', FLEX, 82, 68,
   [('trunk', 'range', 10, 38), ('hip', 'range', 0, 35), ('knee', 'median', 50, 135), lying],
   [depth('Crunch height', 62, 20, 'Torso lifted to {v}° — shoulder blades off the floor.', 'Torso only lifted to {v}°, {d}° short of {t}°. Lift the shoulder blades clear of the floor.'),
    check('Hips stay down', 'hip', 'range', 25, 25, 'max', 'Hips moved {v}° — the abs did the work.', 'Hips moved {v}° — this is becoming a sit-up. Keep the lower back on the floor.'),
    tempo(1.2, .8, 'Rep took {v}s — squeeze at the top for a second.')],
   {'rectus_abdominis': 92, 'obliques': 50, 'transverse_abdominis': 45})
ex('leg_raise', 'Lying leg raise', 'core', 'hip', FLEX, 160, 115,
   [('hip', 'range', 45, 110), still_knees, ('trunk', 'median', 55, 90), lying, ('kneeHip', 'p90', .3, 2)],
   [depth('Raise height', 100, 30, 'Legs raised to a {v}° hip angle — vertical.', 'Legs only raised to {v}°, {d}° short of {t}°. Bring the legs to vertical.'),
    lockout('Lower fully', 160, 25, 'Legs lowered to {v}°.', 'Legs only lowered to {v}°, {d}° short of straight. Lower until just above the floor.'),
    check('Legs stay straight', 'knee', 'p10', 150, 30, 'min', 'Knees stayed at {v}° — straight.', 'Knees bent to {v}°, {d}° short of straight. Keep the legs long.'),
    tempo(1.5, 1.0, 'Rep took {v}s — lower slowly.')],
   {'rectus_abdominis': 90, 'transverse_abdominis': 70, 'obliques': 55, 'quads': 45})
ex('hanging_leg_raise', 'Hanging leg raise', 'core', 'hip', FLEX, 160, 115,
   [('hip', 'range', 45, 120), still_knees, ('trunk', 'median', 0, 35), ('wristY', 'median', .5, 1.8), ('hipAnkle', 'median', .4, 2.6)],
   [depth('Raise height', 95, 30, 'Legs raised to a {v}° hip angle.', 'Legs only raised to {v}°, {d}° short of {t}°. Lift the legs to at least parallel.'),
    lockout('Lower fully', 160, 25, 'Legs lowered to {v}°.', 'Legs only lowered to {v}° — hang fully between reps.'),
    check('Legs stay straight', 'knee', 'p10', 150, 30, 'min', 'Knees stayed at {v}°.', 'Knees bent to {v}° — keep the legs long or switch to knee raises.'),
    tempo(1.5, 1.0, 'Rep took {v}s — no swinging; lower slowly.')],
   {'rectus_abdominis': 92, 'transverse_abdominis': 72, 'obliques': 60, 'forearms': 55, 'lats': 35})
ex('hanging_knee_raise', 'Hanging knee raise', 'core', 'hip', FLEX, 160, 110,
   [('hip', 'range', 45, 120), ('knee', 'range', 40, 120), ('trunk', 'median', 0, 35), ('wristY', 'median', .5, 1.8), ('hipAnkle', 'median', .4, 2.6)],
   [depth('Knee height', 90, 30, 'Knees raised to a {v}° hip angle.', 'Knees only raised to {v}°, {d}° short of {t}°. Drive the knees to the chest.'),
    lockout('Lower fully', 160, 25, 'Legs lowered to {v}°.', 'Legs only lowered to {v}° — extend fully between reps.'),
    tempo(1.2, .8, 'Rep took {v}s — no swinging.')],
   {'rectus_abdominis': 88, 'transverse_abdominis': 70, 'obliques': 55, 'forearms': 50})
variant('captains_chair_knee_raise', "Captain's chair knee raise", 'hanging_knee_raise')

# ─── Leg isolation & calves ───────────────────────────────────────────────────────────────────
ex('calf_raise', 'Standing calf raise', 'legs', 'ankle', EXTEND, 100, 115,
   [('ankle', 'range', 15, 60), still_knees, still_hips, upright, standing],
   [depth('Rise height', 125, 25, 'Ankle opened to {v}° — full plantar-flexion.', 'Ankle only opened to {v}°, {d}° short of {t}°. Rise all the way onto the toes.', direction='min'),
    lockout('Lower fully', 95, 25, 'Ankle returned to {v}° — heels dropped.', 'Ankle only returned to {v}°, {d}° short of a full stretch. Drop the heels below the step.', direction='max'),
    check('Knees stay straight', 'knee', 'range', 15, 20, 'max', 'Knees moved {v}° — the calves did the work.', 'Knees bent {v}° — keep the legs straight so the calves work.'),
    tempo(1.2, .8, 'Rep took {v}s — pause at the top and lower slowly.')],
   {'calves': 98, 'hamstrings': 15})
ex('seated_calf_raise', 'Seated calf raise', 'legs', 'ankle', EXTEND, 100, 115,
   [('ankle', 'range', 15, 60), seated, ('knee', 'median', 60, 120), still_knees],
   [depth('Rise height', 125, 25, 'Ankle opened to {v}°.', 'Ankle only opened to {v}°, {d}° short of {t}°. Rise fully onto the toes.', direction='min'),
    lockout('Lower fully', 95, 25, 'Ankle returned to {v}°.', 'Ankle only returned to {v}° — drop the heels fully.', direction='max'),
    tempo(1.2, .8, 'Rep took {v}s — pause at the top.')],
   {'calves': 96})
ex('leg_extension', 'Leg extension', 'legs', 'knee', EXTEND, 110, 140,
   [('knee', 'range', 40, 110), ('knee', 'start', 50, 125), seated, ('trunk', 'median', 0, 40), ('hip', 'median', 60, 130), still_hips],
   [depth('Full extension', 165, 25, 'Knee extended to {v}° — locked out.', 'Knee only extended to {v}°, {d}° short of {t}°. Straighten the leg fully and squeeze the quad.', direction='min'),
    lockout('Lower fully', 100, 30, 'Knee returned to {v}°.', 'Knee only returned to {v}°, {d}° short of {t}°. Lower the pad all the way.', direction='max'),
    tempo(1.5, 1.0, 'Rep took {v}s — lower slowly for 2 seconds.')],
   {'quads': 98})
ex('seated_leg_curl', 'Seated leg curl', 'legs', 'knee', FLEX, 150, 110,
   [('knee', 'range', 40, 110), ('knee', 'start', 135, 180), seated, ('trunk', 'median', 0, 40), ('hip', 'median', 60, 130), still_hips],
   [depth('Curl depth', 80, 30, 'Knee curled to {v}°.', 'Knee only curled to {v}°, {d}° short of {t}°. Pull the heels all the way under.'),
    lockout('Extend fully', 155, 25, 'Knee extended to {v}° between reps.', 'Knee only extended to {v}° — straighten fully for the stretch.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the return.')],
   {'hamstrings': 98, 'calves': 30})
ex('lying_leg_curl', 'Lying leg curl', 'legs', 'knee', FLEX, 150, 110,
   [('knee', 'range', 40, 110), horizontal, lying, ('hip', 'median', 140, 180)],
   [depth('Curl depth', 80, 30, 'Knee curled to {v}°.', 'Knee only curled to {v}°, {d}° short of {t}°. Curl the heels to the glutes.'),
    lockout('Extend fully', 155, 25, 'Knee extended to {v}°.', 'Knee only extended to {v}° — straighten fully between reps.'),
    check('Hips stay down', 'hip', 'range', 20, 25, 'max', 'Hips moved {v}° — isolated.', 'Hips lifted {v}° — press the hips into the pad.'),
    tempo(1.5, 1.0, 'Rep took {v}s — slow the return.')],
   {'hamstrings': 98, 'glutes': 30, 'calves': 30})
variant('nordic_curl', 'Nordic hamstring curl', 'seated_leg_curl', {'hamstrings': 98, 'glutes': 40, 'erector_spinae': 40})

# ─── Conditioning ──────────────────────────────────────────────────────────────────────────────
ex('jumping_jack', 'Jumping jack', 'conditioning', 'shoulder', EXTEND, 60, 120,
   [('shoulder', 'range', 70, 170), ('handsApart', 'range', 1.0, 5), ('stance', 'range', .08, .8), upright],
   [depth('Arms overhead', 150, 30, 'Arms reached a {v}° shoulder angle overhead.', 'Arms only reached {v}°, {d}° short of overhead. Clap above the head.', direction='min'),
    tempo(.4, .4, 'Rep took {v}s — pick up the pace.')],
   {'lateral_delts': 60, 'calves': 70, 'quads': 55, 'glutes': 50, 'hip_adductors': 55, 'rectus_abdominis': 35}, views=('frontal',), min_seconds=.3)
ex('high_knees', 'High knees', 'conditioning', 'hip', FLEX, 155, 115,
   [('hip', 'range', 40, 110), ('knee', 'range', 40, 120), ('kneeAsym', 'p90', 40, 180), ('kneeHip', 'p90', -.3, 1), ('hipAnkle', 'range', 0, .5), standing, upright],
   [depth('Knee height', 95, 30, 'Knee drove to a {v}° hip angle — hip height.', 'Knee only reached {v}°, {d}° short of {t}°. Drive the knees to hip height.'),
    tempo(.35, .35, 'Rep took {v}s — faster turnover.')],
   {'quads': 60, 'rectus_abdominis': 65, 'calves': 65, 'glutes': 45}, min_seconds=.2)
ex('burpee', 'Burpee', 'conditioning', 'hipAnkle', FLEX, 1.4, .6,
   [('hipAnkle', 'range', 1.2, 3), ('trunk', 'range', 50, 90), ('elbow', 'range', 20, 130)],
   [check('Chest to the floor', '_primary', 'bottom', .5, .5, 'max', 'Hips dropped to {v} torso-lengths above the ankles.', 'Hips stayed {v} torso-lengths up, {d} short of the floor. Get the chest down.', units='torso lengths'),
    check('Stand tall', '_primary', 'top', 1.6, .5, 'min', 'Stood up to {v} torso-lengths.', 'Only stood to {v} — finish upright (or jump) every rep.', units='torso lengths'),
    tempo(1.0, .8, 'Rep took {v}s — keep the rhythm steady.')],
   {'quads': 70, 'glutes': 65, 'mid_chest': 60, 'triceps_lateral': 55, 'rectus_abdominis': 65, 'anterior_delts': 55, 'calves': 55})
ex('mountain_climber', 'Mountain climber', 'conditioning', 'hip', FLEX, 150, 100,
   [('hip', 'range', 50, 120), horizontal, lying, ('wristY', 'median', -1.8, -.25), still_elbows, ('kneeAsym', 'p90', 40, 180)],
   [depth('Knee drive', 85, 30, 'Knee drove to a {v}° hip angle.', 'Knee only reached {v}°, {d}° short of {t}°. Drive the knee to the chest.'),
    check('Hips stay level', 'trunk', 'range', 15, 20, 'max', 'Hips stayed level ({v}° of movement).', 'Hips bounced {v}° — keep a flat plank line.'),
    tempo(.35, .35, 'Rep took {v}s — faster switches.')],
   {'rectus_abdominis': 75, 'obliques': 65, 'anterior_delts': 55, 'quads': 55, 'transverse_abdominis': 60}, min_seconds=.2)

# Muscle keys must match muscle_load.NAMES.
MUSCLE_IDS = ('upper_chest', 'mid_chest', 'lower_chest', 'anterior_delts', 'lateral_delts', 'rear_delts', 'triceps_long', 'triceps_lateral',
              'biceps_long', 'biceps_short', 'brachialis', 'forearms', 'rectus_abdominis', 'obliques', 'transverse_abdominis', 'lats', 'traps',
              'erector_spinae', 'glutes', 'hip_adductors', 'quads', 'hamstrings', 'calves')
assert all(m in MUSCLE_IDS for spec in _LIBRARY.values() for m in spec['muscles'])
LIBRARY: dict[str, dict] = dict(_LIBRARY)
NAMES = {id: spec['name'] for id, spec in LIBRARY.items()}


def catalog(customs=()):
    """Everything the UI needs to offer: built-ins first, then this user's taught exercises."""
    return [{'id': s['id'], 'name': s['name'], 'family': s['family'], 'familyName': FAMILIES.get(s['family'], s['family']),
             'primary': s['primary'], 'views': s['views'], 'variantOf': s['variantOf'], 'custom': s['custom']}
            for s in list(LIBRARY.values()) + list(customs)]


# ─── Teaching a new exercise from the athlete's own reps ───────────────────────────────────────
def learn(name, cameras, segments_fn, muscles=(), exercise_id=None):
    """Derive a spec from one recorded set. Purely descriptive: bands come from what the athlete did."""
    camera = max(cameras, key=lambda c: len(c['rows']))
    rows = camera['rows']
    if len(rows) < 12 or rows[-1]['t'] - rows[0]['t'] < 2000:
        raise ValueError('Record at least two seconds of movement to teach a new exercise.')
    candidates = {k: stat(rows, k, 'range', .8) for k in ANGLE_KEYS + ('trunk',)}
    candidates = {k: v for k, v in candidates.items() if v is not None}
    if not candidates or max(candidates.values()) < 25:
        raise ValueError('Not enough visible joint movement to learn from. Keep the whole body in frame and perform full repetitions.')
    primary = max(candidates, key=candidates.get)
    # Gates come from the movement's extrema: a teaching set with pauses between reps skews
    # whole-window percentiles toward the rest position, and the learned gates would never open.
    lo, hi = extrema_envelope(rows, primary, 20) or (stat(rows, primary, 'p10'), stat(rows, primary, 'p90'))
    start = stat(rows, primary, 'start')
    cycle = FLEX if start >= (lo + hi) / 2 else EXTEND
    span = hi - lo
    rest = hi - .25 * span if cycle == FLEX else lo + .25 * span
    work = lo + .4 * span if cycle == FLEX else hi - .4 * span
    reps = segments_fn(rows, primary, rest, work, cycle, .4)
    if not reps:
        raise ValueError('No complete repetition was found. Start and finish each rep in the same position.')
    seconds = median((end - s) / 1000 for s, end in reps)

    signature = []
    for key in ANGLE_KEYS + ('trunk', 'hipAnkle', 'wristY', 'kneeAsym'):
        rng, mid = stat(rows, key, 'range', .8), stat(rows, key, 'median', .8)
        if rng is None:
            continue
        scale = SCALE.get(key, DEFAULT_SCALE)
        if rng >= scale:
            signature.append([key, 'range', round(rng * .5, 2), round(rng * 1.6 + scale * .4, 2)])
        else:
            signature.append([key, 'range', 0, round(rng + scale * .6, 2)])
        signature.append([key, 'median', round(mid - scale * .8, 2), round(mid + scale * .8, 2)])
    signature.append([primary, 'start', round(start - span * .35, 2), round(start + span * .35, 2)])

    rep_rows = [[r for r in rows if s <= r['t'] <= e] for s, e in reps]
    bottoms = [stat(rr, primary, 'p10' if cycle == FLEX else 'p90') for rr in rep_rows]
    tops = [stat(rr, primary, 'p90' if cycle == FLEX else 'p10') for rr in rep_rows]
    trunk_ranges = [stat(rr, 'trunk', 'range') for rr in rep_rows]
    bottom_target = round(median(b for b in bottoms if b is not None), 0)
    top_target = round(median(t for t in tops if t is not None), 0)
    units = DEG if primary in ANGLE_KEYS or primary == 'trunk' else 'torso lengths'
    label = {'knee': 'Knee', 'hip': 'Hip', 'elbow': 'Elbow', 'shoulder': 'Shoulder', 'ankle': 'Ankle', 'trunk': 'Torso'}[primary]
    checks = [
        check('Range of motion', '_primary', 'bottom', bottom_target + (8 if cycle == FLEX else -8), 30, 'max' if cycle == FLEX else 'min',
              label + ' reached {v}° — matched your taught range.', label + ' reached {v}°, {d}° short of your taught range ({t}°). Complete the full movement.', units),
        check('Return to start', '_primary', 'top', top_target - (8 if cycle == FLEX else -8), 25, 'min' if cycle == FLEX else 'max',
              label + ' returned to {v}°.', label + ' only returned to {v}°, {d}° short of your start position ({t}°). Finish each rep where you began.', units),
        tempo(round(seconds * .7, 1), 1.0, 'Rep took {v}s — faster than your taught tempo. Slow down.'),
    ]
    valid_trunk = [t for t in trunk_ranges if t is not None]
    if valid_trunk and primary != 'trunk':
        checks.insert(2, check('Torso control', 'trunk', 'range', round(median(valid_trunk) + 10), 25, 'max',
                               'Torso moved {v}° — consistent with your taught rep.', 'Torso moved {v}°, {d}° more than your taught rep. Keep the torso steady.'))
    demand = {m: 90 if i < 2 else 60 for i, m in enumerate(muscles) if m in MUSCLE_IDS}
    spec = {'id': exercise_id or f"custom_{uuid4().hex[:8]}", 'name': name.strip(), 'family': 'custom', 'primary': primary, 'cycle': cycle,
            'rest': round(rest, 1), 'work': round(work, 1), 'views': [camera['view']] if camera['view'] in ('side', 'frontal') else ['side'],
            'signature': signature, 'checks': checks, 'muscles': demand, 'variantOf': None, 'custom': True, 'minSeconds': round(max(.3, seconds * .4), 2),
            'learned': {'primaryJoint': label, 'cycle': cycle, 'reps': len(reps), 'bottom': bottom_target, 'top': top_target, 'seconds': round(seconds, 1), 'view': camera['view']}}
    return spec
