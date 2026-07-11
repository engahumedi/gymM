import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The app renders a friendly "configuration missing" screen when these are
// absent (see ConfigError), so we don't hard-crash at import time.
export const isSupabaseConfigured = Boolean(url && anonKey);

// A single shared client for the whole app. Safe to expose the anon key —
// all data access is guarded by RLS policies, never by client code.
export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // hash routing owns the URL fragment
    },
  },
);
