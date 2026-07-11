// admin-service.ts — Admin role detection: REST check + local claims cache.
// Exports isCurrentUserAdminDB(), __isAdminForUi() and notifyAdminAlert().

import { isAdminViaLocalClaims, isAdminViaRest } from './auth-admin.js';
import { __hasAdminClaim } from './shared-utils.js';
import { supabaseUrl, supabaseKey } from './env.js';
import type { User, Session } from '../../src/types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SupabaseFunctions {
  invoke(name: string, opts?: { body?: unknown }): Promise<unknown>;
}
interface SupabaseClient {
  functions: SupabaseFunctions;
}

export interface AdminServiceOptions {
  getCurrentUser: () => User | null;
  getCurrentSession: () => Session | null;
  getCurrentAccessToken: () => string | null;
  supabase: SupabaseClient | null;
}

export interface AdminCache {
  userId: string | null;
  value: boolean | null;
  atMs: number;
}

const ADMIN_TTL_MS = 5 * 60 * 1000;

// ─── Injected dependencies ────────────────────────────────────────────────────
let _getCurrentUser: () => User | null = () => null;
let _getCurrentSession: () => Session | null = () => null;
let _getCurrentAccessToken: () => string | null = () => null;
let _supabase: SupabaseClient | null = null;

export function initAdminService({
  getCurrentUser,
  getCurrentSession,
  getCurrentAccessToken,
  supabase,
}: AdminServiceOptions): void {
  _getCurrentUser = getCurrentUser;
  _getCurrentSession = getCurrentSession;
  _getCurrentAccessToken = getCurrentAccessToken;
  _supabase = supabase;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
export let __adminCache: AdminCache = { userId: null, value: null, atMs: 0 };
export let __adminInFlight: Promise<boolean> | null = null;

export function resetAdminCache(userId: string | null = null): void {
  __adminCache = { userId, value: null, atMs: 0 };
  __adminInFlight = null;
}

// ─── __isAdminForUi (sync, uses cache + local claims) ────────────────────────
export function __isAdminForUi(): boolean {
  const currentUser = _getCurrentUser();
  if (!currentUser) return false;

  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();

  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    Date.now() - __adminCache.atMs < ADMIN_TTL_MS
  ) {
    return __adminCache.value;
  }

  return isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });
}

// ─── isCurrentUserAdminDB (async, REST + local fallback) ─────────────────────
export async function isCurrentUserAdminDB(): Promise<boolean> {
  const currentUser = _getCurrentUser();
  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();

  if (!currentUser) {
    console.log('DEBUG no currentUser');
    return false;
  }

  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });

  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    Date.now() - __adminCache.atMs < ADMIN_TTL_MS
  ) {
    return __adminCache.value;
  }

  if (__adminInFlight) {
    try { return await __adminInFlight; } catch { /* fall through */ }
  }

  __adminInFlight = (async () => {
    let value = await isAdminViaRest({
      supabaseUrl,
      supabaseKey,
      accessToken: currentAccessToken,
      currentUser,
      fetchImpl: globalThis.fetch?.bind(globalThis),
    });
    if (!value && localAdmin) {
      console.warn('DEBUG is_admin REST returned false, using local admin claim fallback');
      value = true;
    }
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();

  try {
    const value = await __adminInFlight;
    console.log('DEBUG is_admin (REST):', value);
    return value;
  } catch (e) {
    console.warn('DEBUG is_admin (REST) failed:', e);
    if (localAdmin) {
      console.warn('DEBUG is_admin using local admin claim fallback:', localAdmin);
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      console.warn('DEBUG is_admin using cached value:', __adminCache.value);
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}

// ─── notifyAdminAlert (coach-side push via Edge Function) ────────────────────
export async function notifyAdminAlert(
  coachName: string,
  date: string,
  data: Record<string, unknown>
): Promise<void> {
  if (__isAdminForUi()) return;
  if (!_supabase) {
    console.warn('notifyAdminAlert: admin-service not initialised with supabase');
    return;
  }
  try {
    await _supabase.functions.invoke('alert-admin', { body: { coachName, date, data } });
  } catch (err) {
    console.error('notifyAdminAlert: failed to notify admin', err);
  }
}
