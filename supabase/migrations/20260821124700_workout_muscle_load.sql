-- Persist the transparent muscle-demand estimate generated when a set ends.
alter table public.workout_sessions
  add column if not exists muscle_load jsonb not null default jsonb_build_object(
    'modelVersion', '1.0',
    'source', 'biomechanical-estimate',
    'confidence', 'low',
    'entries', '[]'::jsonb,
    'disclaimer', 'Estimated training demand from confirmed exercise, observed joint motion, rep volume, and form—not a direct EMG or muscle-force measurement.'
  );
