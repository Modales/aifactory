// Supabase Edge Function endpoint for future Fitbit and Garmin webhook delivery.
// Keep provider credentials and token encryption exclusively in Edge Function secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Provider signature validation belongs here before processing any payload.
  // Fitbit and Garmin credentials are intentionally not embedded in this repository.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  void supabase

  return Response.json({ accepted: true })
})
