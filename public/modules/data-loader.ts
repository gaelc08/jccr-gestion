// data-loader.ts — Loads all data from Supabase and populates dropdowns
import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeEmail } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentUser, currentAccessToken,
  setCoaches, setTimeData, setFrozenMonths,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { getProfileLabel, getCoachDisplayName } from './profile-utils.js';

import type { Coach } from '../../src/types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────
export interface RestFilter {
  0: string; // column
  1: string; // operator (eq, neq, gte…)
  2: string | number; // value
}

export interface RestSelectOptions {
  select?: string;
  filters?: RestFilter[];
  order?: { column: string; direction?: 'asc' | 'desc' };
  limit?: number | null;
}

export interface RestSelectResult<T = unknown> {
  data: T[] | null;
  error: { message: string } | null;
  status?: number;
  statusText?: string;
}

export type RestSelectFn = <T = unknown>(
  table: string,
  opts?: RestSelectOptions
) => Promise<RestSelectResult<T>>;

export interface DataLoaderOptions {
  restSelect: RestSelectFn;
}

export interface TimeDataEntry {
  hours: number;
  competition: boolean;
  km: number;
  description: string;
  departurePlace: string;
  arrivalPlace: string;
  peage: number;
  justificationUrl: string;
  hotel: number;
  hotelJustificationUrl: string;
  achat: number;
  achatJustificationUrl: string;
  coachId: number | null;
  ownerUid: string | null;
  ownerEmail: string | null;
  id: number;
}

// ─── Init ───────────────────────────────────────────────────────────────────────
let _restSelect: RestSelectFn | null = null;

export function initDataLoader({ restSelect }: DataLoaderOptions): void {
  _restSelect = restSelect;
}

// ─── Dropdown ──────────────────────────────────────────────────────────────────
export function loadCoaches(): void {
  const select = document.getElementById('coachSelect') as HTMLSelectElement | null;
  const topSelect = document.getElementById('adminTopBarCoachSelect') as HTMLSelectElement | null;
  const selects = [select, topSelect].filter((s): s is HTMLSelectElement => s !== null);
  if (selects.length === 0) return;

  const current = select?.value ?? topSelect?.value ?? '';

  selects.forEach((s) => {
    s.innerHTML = '<option value="">-- Sélectionner --</option>';
    (coaches as Coach[]).forEach((coach) => {
      const opt = document.createElement('option');
      opt.value = String(coach.id);
      const label = getProfileLabel(coach, { capitalized: true });
      const displayName =
        getCoachDisplayName(coach) ||
        (coach as unknown as Record<string, unknown>).name as string ||
        coach.email ||
        String(coach.id);
      opt.textContent = `${displayName} (${label})`;
      s.appendChild(opt);
    });
    if (current && (coaches as Coach[]).find((c) => String(c.id) === current)) {
      s.value = current;
    }
  });
}

// ─── Main loader ───────────────────────────────────────────────────────────────
export async function loadAllDataFromSupabase(
  { isAdminOverride }: { isAdminOverride?: boolean } = {}
): Promise<void> {
  if (!_restSelect) throw new Error('initDataLoader() not called');

  const isAdmin =
    typeof isAdminOverride === 'boolean' ? isAdminOverride : await isCurrentUserAdminDB();

  console.log('DEBUG loadAllDataFromSupabase start, isAdmin=', isAdmin);
  if (!currentUser) return;
  if (!currentAccessToken) throw new Error('No access token; cannot load data');

  // --- Coaches ---
  let newCoaches: Coach[] = [];
  if (isAdmin) {
    const res = await _restSelect<Coach>('profiles');
    if (res.error) throw new Error(res.error.message);
    newCoaches = (res.data ?? []).map((d) => ({ ...d }));
  } else {
    let res = await _restSelect<Coach>('profiles', {
      filters: [['owner_uid', 'eq', (currentUser as { id: string }).id] as unknown as RestFilter],
    });
    if (res.error) throw new Error(res.error.message);
    let rows = res.data ?? [];

    if (rows.length === 0 && (currentUser as { email?: string }).email) {
      const claimRes = await globalThis.fetch(`${supabaseUrl}/rest/v1/rpc/claim_user_profile`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${currentAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (claimRes.ok) {
        res = await _restSelect<Coach>('profiles', {
          filters: [['owner_uid', 'eq', (currentUser as { id: string }).id] as unknown as RestFilter],
        });
        if (res.error) throw new Error(res.error.message);
        rows = res.data ?? [];
      } else {
        const text = await claimRes.text().catch(() => '');
        console.warn('DEBUG claim_user_profile failed:', claimRes.status, text);
      }
    }
    newCoaches = rows.map((d) => ({ ...d }));
  }
  setCoaches(newCoaches);
  loadCoaches();

  // --- Time data ---
  type TimeRow = Record<string, unknown>;
  let timeSnap: TimeRow[] = [];

  if (isAdmin) {
    const res = await _restSelect<TimeRow>('time_data');
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data ?? [];
  } else if ((coaches as Coach[]).length > 0) {
    const coachId = (coaches as Coach[])[0].id;
    const res = await _restSelect<TimeRow>('time_data', {
      filters: [['coach_id', 'eq', coachId] as unknown as RestFilter],
    });
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data ?? [];
  }

  const newTimeData: Record<string, TimeDataEntry> = {};
  for (const data of timeSnap) {
    const key = `${data.coach_id}-${data.date}`;
    newTimeData[key] = {
      hours:                 Number(data.hours)    || 0,
      competition:           Boolean(data.competition),
      km:                    Number(data.km)       || 0,
      description:           String(data.description  ?? ''),
      departurePlace:        String(data.departure_place ?? ''),
      arrivalPlace:          String(data.arrival_place  ?? ''),
      peage:                 Number(data.peage)    || 0,
      justificationUrl:      String(data.justification_url       ?? ''),
      hotel:                 Number(data.hotel)    || 0,
      hotelJustificationUrl: String(data.hotel_justification_url ?? ''),
      achat:                 Number(data.achat)    || 0,
      achatJustificationUrl: String(data.achat_justification_url ?? ''),
      coachId:               data.coach_id != null  ? Number(data.coach_id)  : null,
      ownerUid:              data.owner_uid  != null ? String(data.owner_uid)  : null,
      ownerEmail:            data.owner_email != null ? String(data.owner_email) : null,
      id:                    Number(data.id),
    };
  }
  setTimeData(newTimeData);

  // --- Frozen timesheets ---
  const frozenRes = await _restSelect<{ coach_id: number; month: string }>('frozen_timesheets');
  if (!frozenRes.error) {
    const newFrozen = new Set<string>();
    for (const r of frozenRes.data ?? []) {
      newFrozen.add(`${r.coach_id}-${r.month}`);
    }
    setFrozenMonths(newFrozen);
  }
}
