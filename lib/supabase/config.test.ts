import { describe, expect, it } from 'vitest';
import {
  checkSupabaseConfig,
  PROJECT_SUPABASE_PUBLISHABLE_KEY,
  PROJECT_SUPABASE_URL,
  resolveSupabaseConfig,
} from './config';

const PROJECT = { url: PROJECT_SUPABASE_URL, key: PROJECT_SUPABASE_PUBLISHABLE_KEY };

describe('resolveSupabaseConfig', () => {
  it('χωρίς μεταβλητές → οι τιμές του project', () => {
    expect(resolveSupabaseConfig({})).toEqual(PROJECT);
    expect(checkSupabaseConfig(resolveSupabaseConfig({}))).toBeNull();
  });

  it('αγνοεί τις τιμές-παράδειγμα του .env.example', () => {
    expect(
      resolveSupabaseConfig({
        url: 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
        publishableKey: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx',
      }),
    ).toEqual(PROJECT);
  });

  it('δεν ανακατεύει τιμές: αν λείπει η μία μεταβλητή, πάει στο project', () => {
    expect(resolveSupabaseConfig({ url: 'http://127.0.0.1:54321' })).toEqual(PROJECT);
  });

  it('με σωστές μεταβλητές (π.χ. τοπικό Supabase) χρησιμοποιεί αυτές', () => {
    expect(resolveSupabaseConfig({ url: ' http://127.0.0.1:54321 ', publishableKey: 'sb_publishable_local' })).toEqual({
      url: 'http://127.0.0.1:54321',
      key: 'sb_publishable_local',
    });
    expect(resolveSupabaseConfig({ url: 'https://other.supabase.co', anonKey: 'anon-jwt' })).toEqual({
      url: 'https://other.supabase.co',
      key: 'anon-jwt',
    });
  });
});

const url = 'https://abcdefghijklmnop.supabase.co';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.y`;

describe('checkSupabaseConfig', () => {
  it('σωστές ρυθμίσεις', () => {
    expect(checkSupabaseConfig({ url, key: 'sb_publishable_abc' })).toBeNull();
    expect(checkSupabaseConfig({ url, key: jwt('anon') })).toBeNull();
  });

  it('λείπουν μεταβλητές', () => {
    expect(checkSupabaseConfig({ url: '', key: '' })).toContain('Λείπουν');
  });

  it('λάθος URL', () => {
    expect(checkSupabaseConfig({ url: 'abcdefghijklmnop', key: 'sb_publishable_abc' })).toContain('έγκυρη');
    expect(
      checkSupabaseConfig({ url: 'https://supabase.com/dashboard/project/abc', key: 'sb_publishable_abc' }),
    ).toContain('Project URL');
  });

  it('αρνείται το μυστικό κλειδί', () => {
    expect(checkSupabaseConfig({ url, key: 'sb_secret_abc' })).toContain('ΜΥΣΤΙΚΟ');
    expect(checkSupabaseConfig({ url, key: jwt('service_role') })).toContain('ΜΥΣΤΙΚΟ');
  });
});
