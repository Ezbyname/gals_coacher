import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

let client: SupabaseClient | null | undefined;

/**
 * Supabase is the canonical cloud store after sync. Returns null when the app
 * runs without cloud config — training must keep working offline regardless.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = env.supabase
    ? createClient(env.supabase.url, env.supabase.anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
  return client;
}
