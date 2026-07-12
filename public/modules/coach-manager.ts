// coach-manager.js
// Coach profile CRUD: saveCoach, deleteCoach, inviteCoach, inviteAdmin
// and modal UI helpers: clearCoachForm, updateCoachFormProfileUI, openCoachModal

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeEmail, __escapeHtml } from './shared-utils.js';
import {
  coaches, currentUser, currentAccessToken, currentCoach,
  setCoaches, setCurrentCoach, editMode, editingCoachId, setEditMode, setEditingCoachId,
  __getProfileType, __isVolunteerProfile, __getLegacyKmRateFromFiscalPower,
  __buildAuditPayload, __findExistingProfileByEmail, __getFreshAccessToken,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { updateSummary } from './summary-ui.js';
import { updateCalendar } from './calendar-ui.js';
import { loadCoaches } from './data-loader.js';

let _supabase: any = null;
let _coachWriteViaRest: ((data: any, opts: { editingId: string | null }) => Promise<any>) | null = null;
let _logAuditEvent: ((action: string, entity: string, payload: any) => Promise<any>) | null = null;

export function initCoachManager({ supabase, coachWriteViaRest, logAuditEvent }) {
  _supabase = supabase;
  _coachWriteViaRest = coachWriteViaRest;
  _logAuditEvent = logAuditEvent;
}

// ===== Modal open helper =====
export function fillCoachForm(coach: Record<string, any>) {
  if (!coach) return;
  const profileType = coach.profile_type || coach.role || 'coach';
  const profileTypeEl = document.getElementById('coachProfileType') as HTMLSelectElement | null;
  if (profileTypeEl) profileTypeEl.value = profileType;
  const set = (id: string, val: any) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = val ?? ''; };
  set('coachName',        coach.name);
  set('coachFirstName',   coach.first_name);
  const civiliteEl = document.getElementById('coachCivilite') as HTMLSelectElement | null;
  if (civiliteEl) civiliteEl.value = coach.civilite || 'MR';
  set('coachEmail',       coach.email);
  set('coachAddress',     coach.address);
  set('coachVehicle',     coach.vehicle);
  set('coachFiscalPower', coach.fiscal_power);
  set('coachRate',        coach.hourly_rate);
  set('dailyAllowance',   coach.daily_allowance);
  set('coachOwnerUid',    coach.owner_uid);
  updateCoachFormProfileUI(profileType);
}

export function openCoachModal(mode: string, coach: Record<string, any> | null = null) {
  const modal = document.getElementById('coachModal') as HTMLElement | null;
  if (!modal) return;
  if (mode === 'edit') {
    (document.getElementById('coachModalTitle') as HTMLElement).textContent = 'Modifier le profil';
    setEditMode(true);
    if (coach) {
      setEditingCoachId(coach.id);
      fillCoachForm(coach);
    }
  } else {
    (document.getElementById('coachModalTitle') as HTMLElement).textContent = 'Ajouter un profil';
    clearCoachForm();
    setEditMode(false);
    setEditingCoachId(null as any);
  }
  modal.classList.add('active');
}

// ===== Form helpers =====
export function updateCoachFormProfileUI(profileType: string | null = null) {
  const profileTypeEl = document.getElementById('coachProfileType') as HTMLSelectElement | null;
  const resolvedType = __getProfileType(profileType || profileTypeEl?.value);
  const isVolunteer = resolvedType === 'benevole';
  const isAdmin = resolvedType === 'admin';
  const title = document.getElementById('coachModalTitle') as HTMLElement | null;
  const rateGroup = document.getElementById('coachRateGroup') as HTMLElement | null;
  const allowanceGroup = document.getElementById('dailyAllowanceGroup') as HTMLElement | null;
  if (title) title.textContent = isVolunteer ? 'Bénévole' : (isAdmin ? 'Administrateur' : 'Entraîneur');
  if (rateGroup) rateGroup.style.display = isVolunteer ? 'none' : '';
  if (allowanceGroup) allowanceGroup.style.display = isVolunteer ? 'none' : '';
}

export function clearCoachForm() {
  (document.getElementById('coachProfileType')! as HTMLInputElement).value = 'coach';
  (document.getElementById('coachName')! as HTMLInputElement).value = '';
  (document.getElementById('coachFirstName')! as HTMLInputElement).value = '';
  const civiliteResetEl = document.getElementById('coachCivilite') as HTMLInputElement | null;
  if (civiliteResetEl) civiliteResetEl.value = 'MR';
  (document.getElementById('coachEmail')! as HTMLInputElement).value = '';
  (document.getElementById('coachAddress')! as HTMLInputElement).value = '';
  (document.getElementById('coachVehicle')! as HTMLInputElement).value = '';
  (document.getElementById('coachFiscalPower')! as HTMLInputElement).value = '';
  (document.getElementById('coachRate')! as HTMLInputElement).value = '';
  (document.getElementById('dailyAllowance')! as HTMLInputElement).value = '';
  updateCoachFormProfileUI('coach');
}

// ===== Save coach =====
export async function saveCoach() {
  console.log('DEBUG saveCoach START');
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut effectuer cette action."); return; }

  const name = (document.getElementById('coachName')! as HTMLInputElement).value.trim();
  const profileType = __getProfileType((document.getElementById('coachProfileType')! as HTMLInputElement).value);
  const isVolunteer = profileType === 'benevole';
  const isAdminProfile = profileType === 'admin';
  const firstName = (document.getElementById('coachFirstName')! as HTMLInputElement).value.trim();
  const email = __normalizeEmail((document.getElementById('coachEmail')! as HTMLInputElement).value);
  const address = (document.getElementById('coachAddress')! as HTMLInputElement).value.trim();
  const vehicle = (document.getElementById('coachVehicle')! as HTMLInputElement).value.trim();
  const fiscalPower = (document.getElementById('coachFiscalPower')! as HTMLInputElement).value.trim();
  const rate = isVolunteer ? 0 : (parseFloat((document.getElementById('coachRate')! as HTMLInputElement).value) || 0);
  const allowance = isVolunteer ? 0 : (parseFloat((document.getElementById('dailyAllowance')! as HTMLInputElement).value) || 0);
  const kmRate = isVolunteer ? 0 : (__getLegacyKmRateFromFiscalPower(fiscalPower) || 0);
  const ownerUid = (document.getElementById('coachOwnerUid') as HTMLInputElement | null)?.value?.trim() || null;
  const civilite = (document.getElementById('coachCivilite') as HTMLInputElement | null)?.value || 'MR';

  if (!name) { alert('Veuillez saisir un nom.'); return; }

  if (email) {
    const existing = __findExistingProfileByEmail(email, { excludeId: editMode ? editingCoachId : null });
    if (existing) { alert(`Un profil avec l'e-mail ${email} existe déjà.`); return; }
  }

  const coachData = {
    name,
    role: isVolunteer ? 'benevole' : (isAdminProfile ? 'admin' : 'entraineur'),
    profile_type: profileType,
    civilite,
    first_name: firstName,
    email: email || null,
    address: address || null,
    vehicle: vehicle || null,
    fiscal_power: fiscalPower || null,
    hourly_rate: rate,
    daily_allowance: allowance,
    km_rate: kmRate,
    owner_uid: ownerUid || null,
  };

  const wasEditMode = !!(editMode && editingCoachId);
  const editedId = editingCoachId;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));

  let res: any;
  const dbPromise = wasEditMode
    ? _supabase!.from('profiles').update([coachData]).eq('id', editedId).select()
    : _supabase!.from('profiles').insert([coachData]).select();

  try {
    res = await Promise.race([dbPromise, timeoutPromise]);
  } catch (e: any) {
    console.warn('DEBUG saveCoach Supabase timeout, falling back to REST:', e.message);
    res = await _coachWriteViaRest!(coachData, { editingId: editedId! });
  }

  if (res.error) { alert('Erreur lors de la sauvegarde : ' + res.error.message); return; }
  if (!res.data?.length) { alert('Erreur : aucune donnée retournée.'); return; }

  const saved = { id: res.data[0].id, ...res.data[0] };

  if (wasEditMode) {
    setCoaches(coaches!.map((c: any) => (c.id === editedId ? saved : c)));
    if (currentCoach?.id === editedId) {
      setCurrentCoach(saved);
    }
  } else {
    setCoaches([...coaches!, saved]);
  }

  await _logAuditEvent!(
    wasEditMode ? 'profile.update' : 'profile.create',
    'user_profile',
    __buildAuditPayload({ coach: saved, entityId: saved.id }),
  );

  (document.getElementById('coachModal')!).classList.remove('active');
  clearCoachForm();
  setEditMode(false);
  setEditingCoachId(null as any);
  loadCoaches();
  updateSummary();
  updateCalendar();
}

// ===== Delete coach =====
export async function deleteCoach() {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut supprimer un profil."); return; }
  if (!editingCoachId) { alert('Aucun profil sélectionné.'); return; }

  const coach = coaches!.find((c: any) => c.id === editingCoachId);
  if (!confirm(`Supprimer le profil « ${coach?.name || editingCoachId} » ? Cette action est irréversible.`)) return;

  if (coach?.owner_uid) {
    try {
      const accessToken = await __getFreshAccessToken(_supabase!);
      await globalThis.fetch(`${supabaseUrl}/functions/v1/delete-coach-user`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ userId: coach.owner_uid }),
      });
    } catch (e) {
      console.warn('DEBUG deleteCoach: delete-coach-user failed:', e);
    }
  }

  const { error: e1 } = await _supabase!.from('profiles').delete().eq('id', editingCoachId);
  if (e1) { alert('Erreur lors de la suppression : ' + e1.message); return; }

  await _supabase!.from('time_data').delete().eq('coach_id', editingCoachId);

  await _logAuditEvent!('profile.delete', 'user_profile', __buildAuditPayload({ coach, entityId: editingCoachId }));

  setCoaches(coaches!.filter((c: any) => c.id !== editingCoachId));
  (document.getElementById('coachModal')!).classList.remove('active');
  clearCoachForm();
  setEditMode(false);
  setEditingCoachId(null as any);
  loadCoaches();
  updateSummary();
  updateCalendar();
}

// ===== Invite coach =====
export async function inviteCoach(email: string) {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut inviter un entraîneur."); return; }
  const normalizedEmail = __normalizeEmail(email);
  if (!normalizedEmail) { alert("Adresse e-mail invalide."); return; }
  const accessToken = await __getFreshAccessToken(_supabase!);
  if (!accessToken) { alert('Session invalide. Reconnectez-vous.'); return; }
  try {
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-coach`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ email: normalizedEmail, redirectTo: window.location.origin + window.location.pathname }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert('Erreur lors de l\'invitation : ' + (json.error || res.statusText)); return; }
    alert(`Invitation envoyée à ${normalizedEmail}.`);
  } catch (e: any) {
    alert('Erreur : ' + e.message);
  }
}

// ===== Invite admin =====
export async function inviteAdmin(email: string) {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut inviter un administrateur."); return; }
  const normalizedEmail = __normalizeEmail(email);
  if (!normalizedEmail) { alert("Adresse e-mail invalide."); return; }
  const accessToken = await __getFreshAccessToken(_supabase!);
  if (!accessToken) { alert('Session invalide. Reconnectez-vous.'); return; }
  try {
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-admin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ email: normalizedEmail, redirectTo: window.location.origin + window.location.pathname }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert('Erreur lors de l\'invitation admin : ' + (json.error || res.statusText)); return; }
    alert(`Invitation admin envoyée à ${normalizedEmail}.`);
  } catch (e: any) {
    alert('Erreur : ' + e.message);
  }
}
