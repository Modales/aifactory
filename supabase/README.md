# FormFit Supabase platform

This directory is the portable Supabase backend definition for FormFit.

## Apply the platform

1. Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link the intended project: `supabase link --project-ref <project-ref>`.
3. Apply database schema, RLS policies, triggers, and storage buckets: `supabase db push`.
4. Deploy the wearable receiver once Fitbit/Garmin credentials are available: `supabase functions deploy wearable-webhook`.
5. Add the wearable provider credentials only as Supabase Edge Function secrets—not to the browser.

The migration uses `auth.users` for identity, implements RLS for every application table, and keeps wearable OAuth token ciphertext server-only. Apple Health data must be supplied by a native iOS HealthKit client; desktop browsers cannot access HealthKit directly.
