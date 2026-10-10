"""Sport-science layer on top of counted, graded reps. Estimates, not lab measurements.

* Effort from rep-speed loss. In velocity-based training, the share of speed lost across a set tracks
  how close it went to failure (Sánchez-Medina & González-Badillo 2011; Pareja-Blanco et al. 2017:
  ~20 % loss leaves several reps in reserve, ~40 % is near failure). We have no bar speed, so rep
  duration over the same range of motion is the proxy: speed ∝ 1 / duration.
* Range-of-motion loss: later reps getting shorter is the most visible sign of fatigue in 2D.
* Muscle demand: each exercise's priors are adjusted by what was measured. Partial range cuts the
  stimulus most for muscles trained at long lengths (full vs half squat: Kubo et al. 2019 — glutes
  and adductors grew only with full depth; McMahon 2014), and a more forward torso in a squat or lunge
  shifts load from the knee extensors to the hip extensors (Fry et al. 2003).
"""
from statistics import mean
from .features import percentile, values

# Muscles whose stimulus depends most on reaching the stretched position, per family.
LENGTHENED = {
    'squat': ('glutes', 'hip_adductors'), 'lunge': ('glutes', 'hip_adductors'), 'hinge': ('hamstrings', 'glutes'),
    'glute': ('glutes',), 'horizontal_press': ('mid_chest', 'upper_chest', 'lower_chest'),
    'pushup': ('mid_chest', 'lower_chest', 'triceps_long'), 'vertical_press': ('anterior_delts', 'triceps_long'),
    'vertical_pull': ('lats',), 'row': ('lats', 'rear_delts'), 'arm': ('biceps_long', 'biceps_short', 'triceps_long'),
    'legs': ('calves', 'quads', 'hamstrings'),
}
KNEE_DOMINANT = ('squat', 'lunge')
FULL_SHORTFALL = 60     # degrees of missed depth treated as a quarter-rep (no long-length stimulus left)


def _rom(rows, key):
    items = values(rows, key)
    return percentile(items, .9) - percentile(items, .1) if len(items) >= 4 else None


def effort_label(loss):
    if loss < 10:
        return 'easy'
    if loss < 20:
        return 'moderate'
    return 'hard' if loss < 40 else 'near failure'


def set_insights(spec, reps, rows):
    """Fatigue signals across the set from the camera that drove counting."""
    result = {'velocityLossPct': None, 'rangeLossPct': None, 'effort': None, 'notes': []}
    if len(reps) < 4:
        return result
    durations = [r['durationSeconds'] for r in reps]
    fastest, closing = min(durations[:2]), mean(durations[-2:])
    loss = max(0, round(100 * (1 - fastest / closing)))
    result['velocityLossPct'], result['effort'] = loss, effort_label(loss)
    if loss >= 40:
        result['notes'].append(f"Your last reps were {loss}% slower than your first — this set went close to failure. That builds muscle but costs more recovery; stop around 20–30% slowdown on strength days.")
    elif loss >= 20:
        result['notes'].append(f"Reps slowed {loss}% by the end — a hard set with a few reps left in reserve.")
    else:
        result['notes'].append(f"Rep speed held steady (only {loss}% slower at the end) — plenty left in reserve; add load or reps next set if form holds.")
    roms = [_rom([x for x in rows if r['startMs'] <= x['t'] <= r['endMs']], spec['primary']) for r in reps]
    roms = [r for r in roms if r]
    if len(roms) >= 4:
        shrink = max(0, round(100 * (1 - mean(roms[-2:]) / max(roms[:2]))))
        result['rangeLossPct'] = shrink
        if shrink >= 15:
            result['notes'].append(f"Your range of motion shrank {shrink}% from the first reps to the last — fatigue is cutting reps short. End the set when depth goes, or lighten the load.")
    return result


def _check_values(reps, name):
    return [c['value'] for r in reps for c in r['checks'] if c['name'] == name]


def muscle_demand(spec, reps):
    """Spec priors adjusted by measured depth and torso angle. Returns (demand, notes)."""
    priors = dict(spec['muscles'])
    if not reps or not priors:
        return priors, []
    notes, demand = [], dict(priors)
    depth = next((c for c in spec['checks'] if c['key'] == '_primary' and c['stat'] == 'bottom'), None)
    measured = _check_values(reps, depth['name']) if depth else []
    if measured:
        missed = [max(0, v - depth['target']) if depth['direction'] == 'max' else max(0, depth['target'] - v) for v in measured]
        short = min(1, mean(missed) / FULL_SHORTFALL)
        if short > 0:
            long = LENGTHENED.get(spec['family'], ())
            for m in demand:
                demand[m] *= 1 - (.35 if m in long else .12) * short
            if long and short >= .15:
                names = ' and '.join(m.replace('_', ' ') for m in long[:2])
                notes.append(f"You stopped about {round(mean(missed))}° short of full depth on average, which mostly reduces the work for your {names} — they grow best when trained through the stretched position.")
    if spec['family'] in KNEE_DOMINANT:
        lean = _check_values(reps, next((c['name'] for c in spec['checks'] if c['key'] == 'trunk' and c['stat'] == 'atBottom'), ''))
        if lean:
            # Typical squat/lunge torso angles (25–45°) leave the priors unchanged.
            angle = mean(lean)
            shift = min(1, (angle - 45) / 30) if angle > 45 else max(-.5, (angle - 25) / 30) if angle < 25 else 0
            for m, sign in (('quads', -1), ('glutes', 1), ('erector_spinae', 1), ('hamstrings', 1)):
                if m in demand:
                    demand[m] *= 1 + sign * .15 * shift
            if shift >= .3:
                notes.append(f"A {round(mean(lean))}° forward torso shifts this toward a hip-dominant movement: more glutes and lower back, a little less quads.")
            elif shift <= -.2:
                notes.append(f"A very upright torso ({round(mean(lean))}°) keeps the emphasis on the quads.")
    return {m: max(1, min(100, round(v))) for m, v in demand.items()}, notes
