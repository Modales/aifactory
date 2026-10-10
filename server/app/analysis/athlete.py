"""Plain-text athlete brief for the LLM coach: who they are and how this exercise went before.

Only coaching-relevant profile fields and summaries of past reports are included — no email, name or
landmarks. ``history`` items are light dicts built from saved ``AnalysisRecord`` results.
"""


def history_item(result: dict, created_at) -> dict:
    failed = [f for f in result.get('focus') or [] if not f.get('passed')]
    return {'exercise': result.get('exercise'), 'score': result.get('score'), 'reps': result.get('repCount'),
            'fault': failed[0]['name'] if failed else None,
            'effort': (result.get('setInsights') or {}).get('effort'), 'date': created_at.date().isoformat() if created_at else None}


def _root(exercise_id, library):
    spec = library.get(exercise_id)
    return (spec.get('variantOf') or exercise_id) if spec else exercise_id


def brief(profile: dict | None, history: list[dict], exercise_id: str, library: dict) -> str:
    lines = []
    if profile:
        facts = [f"goal: {profile['fitness_goal']}" if profile.get('fitness_goal') else None,
                 f"experience: {profile['experience_level']}" if profile.get('experience_level') else None,
                 f"age {profile['age']}" if profile.get('age') else None,
                 f"trains {profile['training_days_per_week']} days/week" if profile.get('training_days_per_week') else None]
        facts = [f for f in facts if f]
        if facts:
            lines.append('Profile: ' + ', '.join(facts) + '.')
        if profile.get('injuries'):
            lines.append('Injuries / limitations: ' + ', '.join(map(str, profile['injuries'])) + '.')
        if profile.get('equipment'):
            lines.append('Equipment available: ' + ', '.join(map(str, profile['equipment'])) + '.')
    root = _root(exercise_id, library)
    past = [h for h in history if h.get('exercise') and _root(h['exercise'], library) == root and h.get('score') is not None][:5]
    if past:
        lines.append(f"Previous {library[exercise_id]['name'].lower()} sets (newest first):")
        lines += [f"  {h['date']}: {h['reps']} reps, form {h['score']}/100" + (f", main fault {h['fault'].lower()}" if h['fault'] else ', no failed checks')
                  + (f", effort {h['effort']}" if h.get('effort') else '') for h in past]
    else:
        lines.append('No previous sets of this exercise recorded.')
    return '\n'.join(lines)
