import { getSupabaseSession } from './supabaseClient';

export function getAuthenticatedApiHeaders(): Record<string, string> {
  return {};
}

export function isAuthenticatedApiAvailable() {
  return typeof window !== 'undefined' && Boolean(getSupabaseSession());
}
