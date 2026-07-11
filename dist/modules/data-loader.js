// data-loader.js
// Loads all data from Supabase (coaches, time_data, frozen_timesheets)
// and populates the coachSelect dropdown.

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeEmail } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentUser, currentAccessToken,
  setCoaches, setTimeData, setFrozenMonths,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { getProfileLabel, getCoachDisplayName } from './profile-utils.js';

let _restSelect = null;
export function initDataLoader({ restSelect }) {
  _restSelect = restSelect;
}

// ===== Coach select dropdown =====
export function loadCoaches() {
  const select = document.getElementById('coachSelect');
  const topSelect = document.getElementById('adminTopBarCoachSelect');
  const selects = [select, topSelect].filter(Boolean);
  if (selects.length === 0) return;
  const current = select ? select.value : (topSelect ? topSelect.value : '');
  selects.forEach((s) => {
    s.innerHTML = '<option value="">-- S\u00e9lectionner --</option>';
    coaches.forEach((coach) => {
      const opt = document.createElement('option');
      opt.value = coach.id;
      const label = getProfileLabel(coach, { capitalized: true });
      const displayName = getCoachDisplayName(coach) || coach.name || coach.email || coach.id;
      opt.textContent = `${displayName} (${label})`;
      s.appendChild(opt);
    });
    if (current && coaches.find((c) => c.id === current)) {
      s.value = current;
    }
  });
}

// ===== Main data loader =====
export async function loadAllDataFromSupabase({ isAdminOverride } = {}) {
  const isAdmin = (typeof isAdminOverride === 'boolean') ? isAdminOverride : await isCurrentUserAdminDB();
  console.log('DEBUG loadAllDataFromSupabase start, isAdmin=', isAdmin);
  if (!currentUser) return;
  if (!currentAccessToken) throw new Error('No access token; cannot load data');

  // --- Coaches ---
  let newCoaches = [];
  if (isAdmin) {
    const res = await _restSelect('profiles');
    if (res.error) throw new Error(res.error.message);
    newCoaches = (res.data || []).map(d => ({ id: d.id, ...d }));
  } else {
    let res = await _restSelect('profiles', { filters: [['owner_uid', 'eq', currentUser.id]] });
    if (res.error) throw new Error(res.error.message);
    let rows = res.data || [];

    // Invitation flow: claim unclaimed profile by email
    if (rows.length === 0 && currentUser.email) {
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
        res = await _restSelect('profiles', { filters: [['owner_uid', 'eq', currentUser.id]] });
        if (res.error) throw new Error(res.error.message);
        rows = res.data || [];
      } else {
        const text = await claimRes.text().catch(() => '');
        console.warn('DEBUG claim_user_profile failed:', claimRes.status, text);
      }
    }
    newCoaches = rows.map(d => ({ id: d.id, ...d }));
  }
  setCoaches(newCoaches);
  loadCoaches();

  // --- Time data ---
  let timeSnap = [];
  if (isAdmin) {
    const res = await _restSelect('time_data');
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data || [];
  } else {
    if (coaches.length > 0) {
      const coachId = coaches[0].id;
      const res = await _restSelect('time_data', { filters: [['coach_id', 'eq', coachId]] });
      if (res.error) throw new Error(res.error.message);
      timeSnap = res.data || [];
    }
  }

  const newTimeData = {};
  (timeSnap || []).forEach((data) => {
    const key = `${data.coach_id}-${data.date}`;
    newTimeData[key] = {
      hours: data.hours || 0,
      competition: !!data.competition,
      km: data.km || 0,
      description: data.description || '',
      departurePlace: data.departure_place || '',
      arrivalPlace: data.arrival_place || '',
      peage: data.peage || 0,
      justificationUrl: data.justification_url || '',
      hotel: data.hotel || 0,
      hotelJustificationUrl: data.hotel_justification_url || '',
      achat: data.achat || 0,
      achatJustificationUrl: data.achat_justification_url || '',
      coachId: data.coach_id || null,
      ownerUid: data.owner_uid || null,
      ownerEmail: data.owner_email || null,
      id: data.id,
    };
  });
  setTimeData(newTimeData);

  // --- Frozen timesheets ---
  // Pour les non-admins : filtrer explicitement par les coach_id du profil
  // afin de ne pas d\u00e9pendre uniquement de la RLS (qui peut retourner 0 lignes
  // si la politique n'est pas encore configur\u00e9e pour les coaches).
  let frozenRes;
  if (isAdmin) {
    frozenRes = await _restSelect('frozen_timesheets');
  } else {
    const coachIds = newCoaches.map(c => c.id);
    if (coachIds.length > 0) {
      // Charger les fiches gel\u00e9es pour chaque coach_id du profil
      const allFrozen = [];
      for (const cid of coachIds) {
        const r = await _restSelect('frozen_timesheets', { filters: [['coach_id', 'eq', cid]] });
        if (!r.error) allFrozen.push(...(r.data || []));
      }
      frozenRes = { data: allFrozen, error: null };
    } else {
      frozenRes = { data: [], error: null };
    }
  }

  if (!frozenRes.error) {
    const newFrozen = new Set();
    (frozenRes.data || []).forEach(r => newFrozen.add(`${r.coach_id}-${r.month}`));
    console.log('DEBUG frozenMonths loaded:', [...newFrozen]);
    setFrozenMonths(newFrozen);
  } else {
    console.warn('DEBUG frozenMonths load error:', frozenRes.error);
  }
}
