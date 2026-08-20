-- FormFit full-platform schema for Supabase Postgres.
-- Apply with: supabase db push

create extension if not exists pgcrypto;

create type public.activity_visibility as enum ('public', 'followers');
create type public.challenge_metric as enum ('reps', 'sessions', 'duration_seconds');
create type public.wearable_provider as enum ('apple_health', 'fitbit', 'garmin');
create type public.connection_status as enum ('pending', 'connected', 'revoked', 'error');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  fitness_goal text,
  experience_level text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  camera_angle text not null,
  duration_seconds numeric not null check (duration_seconds >= 0),
  total_reps integer not null check (total_reps >= 0),
  avg_form_score numeric not null check (avg_form_score between 0 and 100),
  peak_effort numeric not null check (peak_effort between 0 and 100),
  reps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index workout_sessions_user_created_idx on public.workout_sessions(user_id, created_at desc);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid unique references public.workout_sessions(id) on delete set null,
  caption text not null default '' check (char_length(caption) <= 2000),
  visibility public.activity_visibility not null default 'followers',
  created_at timestamptz not null default now(),
  check (session_id is not null or char_length(trim(caption)) > 0)
);
create index activities_feed_idx on public.activities(created_at desc);

create table public.activity_reactions (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index activity_comments_activity_created_idx on public.activity_comments(activity_id, created_at);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null unique check (char_length(name) between 2 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  metric public.challenge_metric not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- OAuth refresh tokens are never exposed through Supabase client APIs.
create table public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider public.wearable_provider not null,
  status public.connection_status not null default 'pending',
  provider_account_id text,
  scopes text[] not null default '{}',
  token_ciphertext text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.wearable_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.wearable_connections(id) on delete set null,
  recorded_at timestamptz not null,
  metric text not null check (metric in ('heart_rate', 'hrv', 'calories', 'steps', 'sleep_minutes', 'active_energy')),
  value numeric not null check (value >= 0),
  unit text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index wearable_samples_user_metric_time_idx on public.wearable_samples(user_id, metric, recorded_at desc);

create or replace function public.is_club_member(target_club_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.club_members where club_id = target_club_id and user_id = auth.uid());
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger wearable_connections_updated before update on public.wearable_connections for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.follows enable row level security;
alter table public.activities enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.activity_comments enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_samples enable row level security;

create policy "profiles are visible" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own workouts" on public.workout_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "follow graph is visible" on public.follows for select to authenticated using (true);
create policy "manage own follows" on public.follows for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid());
create policy "visible activities" on public.activities for select to authenticated using (user_id = auth.uid() or visibility = 'public' or exists (select 1 from public.follows where follower_id = auth.uid() and followed_id = activities.user_id));
create policy "create own activities" on public.activities for insert to authenticated with check (user_id = auth.uid() and (session_id is null or exists (select 1 from public.workout_sessions where id = session_id and user_id = auth.uid())));
create policy "manage own activities" on public.activities for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own activities" on public.activities for delete to authenticated using (user_id = auth.uid());
create policy "visible reactions" on public.activity_reactions for select to authenticated using (true);
create policy "manage own reactions" on public.activity_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "visible comments" on public.activity_comments for select to authenticated using (true);
create policy "create own comments" on public.activity_comments for insert to authenticated with check (user_id = auth.uid());
create policy "delete own comments" on public.activity_comments for delete to authenticated using (user_id = auth.uid());
create policy "discover public clubs" on public.clubs for select to authenticated using (not is_private or owner_id = auth.uid() or public.is_club_member(id));
create policy "create clubs" on public.clubs for insert to authenticated with check (owner_id = auth.uid());
create policy "owners manage clubs" on public.clubs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members view memberships" on public.club_members for select to authenticated using (public.is_club_member(club_id));
create policy "join public clubs" on public.club_members for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.clubs where id = club_id and not is_private));
create policy "leave own clubs" on public.club_members for delete to authenticated using (user_id = auth.uid());
create policy "visible challenges" on public.challenges for select to authenticated using (club_id is null or public.is_club_member(club_id));
create policy "club members create challenges" on public.challenges for insert to authenticated with check (creator_id = auth.uid() and (club_id is null or public.is_club_member(club_id)));
create policy "participants read" on public.challenge_participants for select to authenticated using (true);
create policy "join eligible challenges" on public.challenge_participants for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.challenges where id = challenge_id and (club_id is null or public.is_club_member(club_id))));
create policy "wearable connection ownership" on public.wearable_connections for select to authenticated using (user_id = auth.uid());
create policy "wearable sample ownership" on public.wearable_samples for select to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true), ('activity-media', 'activity-media', false) on conflict (id) do nothing;
create policy "public avatar reads" on storage.objects for select to public using (bucket_id = 'avatars');
create policy "own avatar uploads" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar updates" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members access activity media" on storage.objects for select to authenticated using (bucket_id = 'activity-media' and owner_id = auth.uid());
