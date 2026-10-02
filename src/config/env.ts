/**
 * Typed access to runtime configuration. Only EXPO_PUBLIC_* variables are
 * inlined into the bundle; they must be read with static `process.env.X`
 * member access so Metro can replace them.
 */
export type SupabaseConfig = { url: string; anonKey: string };

export type AppEnv = {
  supabase: SupabaseConfig | null;
};

type RawEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export function parseEnv(raw: RawEnv): AppEnv {
  const url = raw.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = raw.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url && !anonKey) return { supabase: null };
  if (!url || !anonKey) {
    throw new Error(
      'Supabase config is partial: set both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or neither.',
    );
  }
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL must be an http(s) URL, got "${url}".`);
  }
  return { supabase: { url, anonKey } };
}

export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
