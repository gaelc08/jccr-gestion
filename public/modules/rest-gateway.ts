// rest-gateway.ts — Typed wrapper around the Supabase REST API
import type { User } from '../../src/types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────
export interface RestResult<T = unknown> {
  data: T[] | null;
  error: { message: string } | null;
  status: number;
  statusText: string;
}

export type FilterTuple = [string, string, string | number];

export interface RestSelectOptions {
  select?: string;
  filters?: FilterTuple[];
  order?: { column: string; direction?: 'asc' | 'desc' } | null;
  limit?: number | null;
}

export interface LogAuditOptions {
  entityId?: string | number | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RestGatewayOptions {
  supabaseUrl: string;
  supabaseKey: string;
  getAccessToken: () => string | null;
  getCurrentUser: () => User | null;
  normalizeEmail: (email: unknown) => string | null;
  toAuditJson: (value: unknown) => unknown;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'warn' | 'log'>;
}

export interface RestGateway {
  coachWriteViaRest: (
    coachData: Record<string, unknown>,
    opts?: { editingId?: number | null }
  ) => Promise<RestResult>;
  restSelect: <T = unknown>(
    table: string,
    opts?: RestSelectOptions
  ) => Promise<RestResult<T>>;
  logAuditEvent: (
    action: string,
    entityType: string,
    opts?: LogAuditOptions
  ) => Promise<null>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────
export function createRestGateway(options: RestGatewayOptions): RestGateway {
  const {
    supabaseUrl,
    supabaseKey,
    getAccessToken,
    getCurrentUser,
    normalizeEmail,
    toAuditJson,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    logger = console,
  } = options;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('createRestGateway requires supabaseUrl and supabaseKey');
  }
  if (!fetchImpl) {
    throw new Error('fetch is not available in this browser environment');
  }

  // — coachWriteViaRest —
  async function coachWriteViaRest(
    coachData: Record<string, unknown>,
    { editingId = null }: { editingId?: number | null } = {}
  ): Promise<RestResult> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return { data: null, error: { message: 'No access token available (not logged in yet?)' }, status: 0, statusText: 'NO_TOKEN' };
    }

    const isUpdate = editingId != null;
    const baseUrl = `${supabaseUrl}/rest/v1/users`;
    const url = isUpdate ? `${baseUrl}?id=eq.${encodeURIComponent(editingId!)}` : baseUrl;

    try {
      const res = await fetchImpl(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(coachData),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      if (!res.ok) {
        const j = json as Record<string, unknown> | null;
        const message = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
        return { data: null, error: { message: String(message) }, status: res.status, statusText: res.statusText };
      }
      return {
        data: Array.isArray(json) ? json : json ? [json] : [],
        error: null, status: res.status, statusText: res.statusText,
      };
    } catch (e) {
      return { data: null, error: { message: (e as Error)?.message ?? String(e) }, status: 0, statusText: 'FETCH_ERROR' };
    }
  }

  // — restSelect —
  async function restSelect<T = unknown>(
    table: string,
    { select = '*', filters = [], order = null as any, limit = null }: RestSelectOptions = {}
  ): Promise<RestResult<T>> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return { data: null, error: { message: 'No access token available' }, status: 0, statusText: 'NO_TOKEN' };
    }

    const urlObj = new URL(`${supabaseUrl}/rest/v1/${table}`);
    urlObj.searchParams.set('select', select);
    for (const [col, op, value] of filters) {
      urlObj.searchParams.set(col, `${op}.${value}`);
    }
    if (order?.column) {
      const dir = String(order.direction ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      urlObj.searchParams.set('order', `${order.column}.${dir}`);
    }
    if (Number.isFinite(limit) && Number(limit) > 0) {
      urlObj.searchParams.set('limit', String(limit));
    }

    try {
      const res = await fetchImpl(urlObj.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      if (!res.ok) {
        const j = json as Record<string, unknown> | null;
        const message = j?.message ?? j?.error_description ?? j?.error ?? text ?? `${res.status} ${res.statusText}`;
        return { data: null, error: { message: String(message) }, status: res.status, statusText: res.statusText };
      }
      return {
        data: Array.isArray(json) ? (json as T[]) : json ? [json as T] : [],
        error: null, status: res.status, statusText: res.statusText,
      };
    } catch (e) {
      return { data: null, error: { message: (e as Error)?.message ?? String(e) }, status: 0, statusText: 'FETCH_ERROR' };
    }
  }

  // — logAuditEvent —
  async function logAuditEvent(
    action: string,
    entityType: string,
    { entityId = null, targetUserId = null, targetEmail = null, metadata = {} }: LogAuditOptions = {}
  ): Promise<null> {
    const currentUser = getCurrentUser();
    const accessToken = getAccessToken();
    if (!currentUser || !accessToken) return null;

    try {
      const resp = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/log_audit_event`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          p_action:        String(action       ?? '').trim(),
          p_entity_type:   String(entityType   ?? '').trim(),
          p_entity_id:     entityId     == null ? null : String(entityId),
          p_target_user_id: targetUserId ?? null,
          p_target_email:  normalizeEmail(targetEmail) ?? (targetEmail ? String(targetEmail) : null),
          p_metadata:      toAuditJson(metadata ?? {}),
        }),
      });
      if (!resp.ok) throw new Error(`Failed to log audit event: ${resp.status}`);
    } catch (e) {
      logger?.warn?.('DEBUG audit log failed:', action, e);
    }
    return null;
  }

  return { coachWriteViaRest, restSelect, logAuditEvent };
}
