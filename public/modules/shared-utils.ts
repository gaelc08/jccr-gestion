// shared-utils.ts — Pure utility functions (no DOM, no Supabase)

export interface JwtDescription {
  present: boolean;
  length?: number;
  segments?: number;
  sub?: string | null;
  email?: string | null;
  appMetadataIsAdmin?: boolean | null;
  role?: string | null;
  aud?: string | string[] | null;
  iss?: string | null;
  exp?: number | null;
  expIso?: string | null;
  expired?: boolean | null;
}

interface JwtPayload {
  sub?: string;
  email?: string;
  app_metadata?: { is_admin?: boolean | string };
  role?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  [key: string]: unknown;
}

export function __safeBase64UrlDecode(value: unknown): string {
  const normalized = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padded = normalized + '='.repeat(remainder === 0 ? 0 : 4 - remainder);
  return window.atob(padded);
}

export function __maskEmail(email: unknown): string | null {
  if (email == null) return null;
  const value = String(email).trim();
  if (!value) return null;
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return '[invalid-email]';
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const maskedLocal =
    local.length <= 2
      ? `${local[0]}${'*'.repeat(Math.max(local.length - 1, 0))}`
      : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}

export function __normalizeEmail(email: unknown): string | null {
  const value = String(email ?? '').trim().toLowerCase();
  return value || null;
}

export function __decodeJwtPayload(token: unknown): JwtPayload | null {
  const parts = String(token ?? '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(__safeBase64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

export function __describeJwt(token: unknown): JwtDescription {
  const value = String(token ?? '').trim();
  if (!value) return { present: false };

  const payload = __decodeJwtPayload(value);
  const expMs = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;

  return {
    present: true,
    length: value.length,
    segments: value.split('.').length,
    sub: payload?.sub ?? null,
    email: __maskEmail(payload?.email),
    appMetadataIsAdmin: payload?.app_metadata?.is_admin as boolean ?? null,
    role: payload?.role ?? null,
    aud: payload?.aud ?? null,
    iss: payload?.iss ?? null,
    exp: payload?.exp ?? null,
    expIso: expMs ? new Date(expMs).toISOString() : null,
    expired: expMs ? expMs <= Date.now() : null,
  };
}

export function __hasAdminClaim(token: unknown): boolean {
  const isAdmin = __decodeJwtPayload(token)?.app_metadata?.is_admin;
  return isAdmin === true || isAdmin === 'true';
}

export function __normalizeMonth(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : s;
}

type JsonSafe = string | number | boolean | null | JsonSafe[] | { [k: string]: JsonSafe };

export function __toAuditJson(value: unknown): JsonSafe {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof File) {
    return { name: value.name ?? null, size: Number(value.size) || 0, type: value.type ?? null };
  }
  if (Array.isArray(value)) return value.map(__toAuditJson);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v !== 'function' && v !== undefined)
        .map(([k, v]) => [k, __toAuditJson(v)])
    );
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export function __escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
