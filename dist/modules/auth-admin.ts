// auth-admin.ts — Admin detection via local JWT claims or REST RPC
import type { User, Session } from '../../src/types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface LocalClaimsOptions {
  accessToken: string | null;
  currentUser: User | null;
  currentSession: Session | null;
  hasAdminClaim: (token: string | null) => boolean;
}

export interface RestAdminOptions {
  supabaseUrl: string;
  supabaseKey: string;
  accessToken: string | null;
  currentUser: User | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// ─── isAdminViaLocalClaims ────────────────────────────────────────────────────
export function isAdminViaLocalClaims({
  accessToken,
  currentUser,
  currentSession,
  hasAdminClaim,
}: LocalClaimsOptions): boolean {
  const tokenAdmin = hasAdminClaim(accessToken);
  const currentUserAdmin =
    (currentUser as Record<string, unknown> | null)?.app_metadata &&
    ((currentUser as { app_metadata: Record<string, unknown> }).app_metadata.is_admin === true ||
      (currentUser as { app_metadata: Record<string, unknown> }).app_metadata.is_admin === 'true');
  const sessionUserAdmin =
    currentSession?.user?.app_metadata &&
    (currentSession.user.app_metadata['is_admin'] === true ||
      currentSession.user.app_metadata['is_admin'] === 'true');
  return !!(tokenAdmin || currentUserAdmin || sessionUserAdmin);
}

// ─── isAdminViaRest ───────────────────────────────────────────────────────────
export async function isAdminViaRest({
  supabaseUrl,
  supabaseKey,
  accessToken,
  currentUser,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = 10_000,
}: RestAdminOptions): Promise<boolean> {
  if (!currentUser || !accessToken) return false;

  const fetchFn = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) throw new Error('fetch is not available in this browser environment');

  const url = `${supabaseUrl}/rest/v1/rpc/is_admin`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => { try { controller.abort(); } catch { /* ignore */ } }, timeoutMs)
    : null;

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: controller?.signal ?? undefined,
    });

    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    if (!res.ok) {
      const j = json as Record<string, unknown> | null;
      const msg = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
      throw new Error(`is_admin REST failed: ${String(msg)}`);
    }

    return !!json;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
