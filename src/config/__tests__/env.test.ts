import { parseEnv } from '../env';

describe('parseEnv', () => {
  it('runs without cloud config (offline-only mode)', () => {
    expect(parseEnv({})).toEqual({ supabase: null });
    expect(parseEnv({ EXPO_PUBLIC_SUPABASE_URL: ' ', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' })).toEqual({
      supabase: null,
    });
  });

  it('returns trimmed Supabase config when both values are set', () => {
    expect(
      parseEnv({
        EXPO_PUBLIC_SUPABASE_URL: ' https://abc.supabase.co ',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'key',
      }),
    ).toEqual({ supabase: { url: 'https://abc.supabase.co', anonKey: 'key' } });
  });

  it('rejects partial config', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/partial/);
  });

  it('rejects a non-URL', () => {
    expect(() =>
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'abc', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'k' }),
    ).toThrow(/http/);
  });
});
