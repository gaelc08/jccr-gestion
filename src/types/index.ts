/**
 * index.ts — Types métier JCC
 * Source unique pour tous les modules JS/TS.
 * Importer via : import type { Coach, TimeEntry } from '@types/index';
 */

import type { User, Session } from '@supabase/supabase-js';

// ─── Re-exports Supabase ──────────────────────────────────────────────────────
export type { User, Session };

// ─── Coach ───────────────────────────────────────────────────────────────────
export interface Coach {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  owner_uid?: string | null;
  /** Taux horaire brut en euros */
  hourly_rate?: number | null;
  /** Indemnité kilométrique en €/km */
  mileage_rate?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ─── TimeEntry ────────────────────────────────────────────────────────────────
export interface TimeEntry {
  id: number;
  coach_id: number;
  date: string;          // ISO 8601 YYYY-MM-DD
  start_time: string;    // HH:MM
  end_time: string;      // HH:MM
  duration_hours: number;
  note?: string | null;
  created_at?: string | null;
}

// ─── MileageEntry ─────────────────────────────────────────────────────────────
export interface MileageEntry {
  id: number;
  coach_id: number;
  date: string;
  km: number;
  purpose?: string | null;
  amount?: number | null;
  created_at?: string | null;
}

// ─── MileageBreakdown ─────────────────────────────────────────────────────────
export interface MileageBreakdown {
  totalKm: number;
  totalAmount: number;
  entries: MileageEntry[];
}

// ─── AuditLog ─────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: number | string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

// ─── AdminProfile ─────────────────────────────────────────────────────────────
export interface AdminProfile {
  id: number;
  owner_uid: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

// ─── Competition ──────────────────────────────────────────────────────────────
export type CompetitionLevel = 'departmental' | 'regional' | 'national' | 'international';
export type CompetitionStatus = 'planned' | 'confirmed' | 'cancelled' | 'done';

export interface Competition {
  id: number;
  name: string;
  date: string;
  location?: string | null;
  level?: CompetitionLevel | null;
  status?: CompetitionStatus | null;
  notes?: string | null;
  created_at?: string | null;
}

// ─── AppContext ───────────────────────────────────────────────────────────────
/** État global de l'application (miroir de app-context.js) */
export interface AppContext {
  currentUser: User | null;
  currentSession: Session | null;
  currentAccessToken: string | null;
  currentCoach: Coach | null;
  coaches: Coach[];
  timeData: Record<string, TimeEntry[]>;
  auditLogs: AuditLog[];
  eventListenersSetup: boolean;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AdminCheckResult {
  isAdmin: boolean;
  source: 'cache' | 'rest' | 'local_claims' | 'fallback';
}

export interface InitAuthListenersOptions {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  isCurrentUserAdminDB: () => Promise<boolean>;
  loadAllDataFromSupabase: (opts: { isAdminOverride: boolean }) => Promise<void>;
  loadCoaches: () => void;
  updateCoachGreeting: (user: User | null, coach: Partial<Coach> | null, isAdmin: boolean) => void;
  updateCalendar: () => void;
  updateSummary: () => void;
  setupEventListeners: () => void;
  inviteFlowActive: boolean;
  setInviteFlowActive: (v: boolean) => void;
}

// ─── Export ───────────────────────────────────────────────────────────────────
export type ExportFormat = 'pdf' | 'csv' | 'xlsx';
export type ExportScope = 'month' | 'year' | 'custom';

export interface ExportOptions {
  coachId: number;
  format: ExportFormat;
  scope: ExportScope;
  month?: string;   // YYYY-MM
  dateFrom?: string;
  dateTo?: string;
}
