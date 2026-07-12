// auth-admin-cache.js — Admin check avec cache TTL
import { supabaseUrl, supabaseKey } from './env.js';
import { currentUser, currentAccessToken, currentSession } from './app-context.js';
import { __hasAdminClaim } from './shared-utils.js';

let __adminCache: { userId: string | null; value: boolean | null; atMs: number } = { userId: null, value: null, atMs: 0 };
let __adminInFlight: any = null;
const TTL_MS = 5 * 60 * 1000;

export async function isCurrentUserAdminDB() {
  if (!currentUser) return false;

  const { isAdminViaLocalClaims, isAdminViaRest } = await import('./auth-admin.js');

  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });

  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    (Date.now() - __adminCache.atMs) < TTL_MS
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
    if (!value && localAdmin) value = true;
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();

  try {
    return await __adminInFlight;
  } catch (e) {
    console.warn('isCurrentUserAdminDB (REST) failed:', e);
    if (localAdmin) {
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}

export function invalidateAdminCache() {
  __adminCache = { userId: null, value: null, atMs: 0 };
  __adminInFlight = null;
}
