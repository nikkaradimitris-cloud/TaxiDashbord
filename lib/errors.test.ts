import { describe, expect, it } from 'vitest';
import { authErrorMessage, dataErrorMessage, isMissingSchemaError, isNetworkError, NETWORK_MESSAGE } from './errors';

describe('isNetworkError', () => {
  it('αναγνωρίζει αποτυχίες δικτύου', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
    expect(isNetworkError({ message: 'TypeError: fetch failed' })).toBe(true);
    expect(isNetworkError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
  });
});

describe('authErrorMessage', () => {
  it('μεταφράζει γνωστά σφάλματα σύνδεσης', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Λάθος email ή κωδικός.',
    );
    expect(authErrorMessage({ message: 'Email not confirmed' })).toContain('επιβεβαιώσει');
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE);
  });
});

describe('dataErrorMessage', () => {
  it('RLS, μοναδικότητα, ξένο κλειδί, λείπει σχήμα', () => {
    expect(dataErrorMessage({ code: '42501', message: '' })).toContain('δικαίωμα');
    expect(dataErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "drivers_email_key"' })).toContain(
      'email',
    );
    expect(dataErrorMessage({ code: '23503', message: '' })).toContain('Απενεργοποιήστε');
    expect(isMissingSchemaError({ code: 'PGRST205' })).toBe(true);
    expect(dataErrorMessage({ code: 'PGRST205', message: '' })).toContain('SQL');
  });

  it('διπλή εβδομάδα ή διπλό τιμολόγιο εφαρμογής', () => {
    const duplicate = (index: string) =>
      dataErrorMessage({ code: '23505', message: `duplicate key value violates unique constraint "${index}"` });
    expect(duplicate('platform_statements_week_key')).toContain('εβδομάδα');
    expect(duplicate('platform_statements_invoice_key')).toContain('τιμολόγιο');
  });
});
