import { describe, expect, it } from 'vitest';
import { checkSupabaseConfig } from './config';

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
