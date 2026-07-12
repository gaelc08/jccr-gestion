// calendar-ui.ts — Calendar rendering, day modal, saveDay/deleteDay, file upload.
import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeMonth, __escapeHtml } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentCoach, currentMonth, currentUser,
  currentAccessToken, selectedDay,
  setTimeData, setSelectedDay,
  __getCoachDisplayName, __getProfileLabel, __isVolunteerProfile, __buildAuditPayload,
} from './app-context.js';
import { isCurrentUserAdminDB, __isAdminForUi } from './admin-service.js';
import { createHolidayService } from './holidays-service.js';
import { publicHolidaysFallback, schoolHolidaysFallback } from './holidays-data.js';
import { updateSummary, updateFreezeUI, isCurrentMonthFrozen } from './summary-ui.js';
import type { Coach, User } from '../../src/types/index.js';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface SupabaseStorageFile {
  error: { message: string } | null;
}
interface SupabaseStorage {
  from(bucket: string): {
    upload(path: string, file: File, opts?: Record<string, unknown>): Promise<SupabaseStorageFile>;
    getPublicUrl(path: string): { data: { publicUrl: string } | null };
  };
}
interface SupabaseFrom {
  upsert(rows: unknown[], opts?: Record<string, unknown>): {
    select(): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  };
  delete(): {
    eq(col: string, val: unknown): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}
interface SupabaseClient {
  from(table: string): SupabaseFrom;
  storage: SupabaseStorage;
}

export interface CalendarUiOptions {
  supabase: SupabaseClient;
  logAuditEvent: (
    action: string,
    entity: string,
    payload: Record<string, unknown>
  ) => Promise<void>;
  notifyAdminAlert?: (
    coachName: string,
    date: string,
    data: Record<string, unknown>
  ) => Promise<void>;
}

interface DayData {
  hours?: number;
  km?: number;
  peage?: number;
  hotel?: number;
  achat?: number;
  competition?: boolean;
  description?: string;
  departurePlace?: string;
  arrivalPlace?: string;
  justificationUrl?: string;
  hotelJustificationUrl?: string;
  achatJustificationUrl?: string;
  [key: string]: unknown;
}

interface DayElementOptions {
  publicHolidayDates: Set<string>;
  schoolHolidayDates: Set<string>;
  frozen: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Holiday service
// ──────────────────────────────────────────────────────────────────────────────
const __holidayService = (createHolidayService as any)({
  publicFallback: publicHolidaysFallback,
  schoolFallback: schoolHolidaysFallback,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console,
});
const fetchPublicHolidays = __holidayService.fetchPublicHolidays;
const fetchSchoolHolidays = __holidayService.fetchSchoolHolidays;

// ──────────────────────────────────────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────────────────────────────────────
let _supabase: SupabaseClient | null = null;
let _logAuditEvent: CalendarUiOptions['logAuditEvent'] | null = null;
let _notifyAdminAlert: CalendarUiOptions['notifyAdminAlert'] | null = null;

export function initCalendarUi({ supabase, logAuditEvent, notifyAdminAlert }: CalendarUiOptions): void {
  _supabase = supabase;
  _logAuditEvent = logAuditEvent;
  _notifyAdminAlert = notifyAdminAlert;
}

// ──────────────────────────────────────────────────────────────────────────────
// Coach dropdown & greeting
// ──────────────────────────────────────────────────────────────────────────────
export function loadCoaches(): void {
  const select = document.getElementById('coachSelect') as HTMLSelectElement | null;
  if (!select) return;
  const prevValue = select.value;
  select.innerHTML = '<option value="">— Sélectionnez un profil —</option>';
  (coaches as Coach[]).forEach((coach) => {
    const opt = document.createElement('option');
    opt.value = String(coach.id);
    const label = __getProfileLabel(coach);
    opt.textContent = `${__getCoachDisplayName(coach)}${label ? ` (${label})` : ''}`;
    select.appendChild(opt);
  });
  if (prevValue && (coaches as Coach[]).find((c) => String(c.id) === prevValue)) {
    select.value = prevValue;
  }
}

export function clearCoachForm(): void {
  (['coachName','coachFirstName','coachEmail','coachAddress',
    'coachVehicle','coachFiscalPower','coachRate','dailyAllowance','coachOwnerUid'] as const)
    .forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = '';
    });
  const profileType = document.getElementById('coachProfileType') as HTMLSelectElement | null;
  if (profileType) profileType.value = 'coach';
}

export function updateCoachGreeting(
  user: User | null,
  coach: Partial<{ first_name: string; user_metadata?: Record<string, string>; email?: string; id?: string }> | null,
  _isAdmin: boolean
): void {
  const el = document.getElementById('coachGreeting') as HTMLElement | null;
  if (!el) return;
  if (!user) { el.textContent = ''; el.style.display = 'none'; return; }
  const firstName =
    coach?.first_name?.trim() ||
    (user as { user_metadata?: Record<string, string> }).user_metadata?.first_name?.trim() ||
    (user as { user_metadata?: Record<string, string> }).user_metadata?.firstname?.trim() ||
    null;
  const displayName = firstName || (coach ? __getCoachDisplayName(coach as any) : (user.email || user.id));
  el.textContent = `Bonjour ${displayName},`;
  el.style.display = '';
}

// ──────────────────────────────────────────────────────────────────────────────
// File upload
// ──────────────────────────────────────────────────────────────────────────────
async function __uploadExpenseJustification(file: File, prefix: string): Promise<string> {
  if (!currentUser) return '';
  const safeDate = selectedDay || 'nodate';
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${(currentUser as User).id}/${safeDate}_${prefix}_${safeName}`;
  const { error } = await _supabase!.storage.from('justifications').upload(path, file, { upsert: true });
  if (error) { console.error('Upload justification error:', error.message); return ''; }
  const { data } = _supabase!.storage.from('justifications').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Calendar rendering
// ──────────────────────────────────────────────────────────────────────────────
export async function updateCalendar(): Promise<void> {
  const calendar = document.getElementById('calendar') as HTMLElement | null;
  if (!calendar) return;
  calendar.innerHTML = '';

  if (!currentCoach || !currentMonth) {
    const legendCard   = document.querySelector('.legend.card')  as HTMLElement | null;
    const summaryCard  = document.querySelector('.summary.card') as HTMLElement | null;
    if (legendCard)  legendCard.style.display  = 'none';
    if (summaryCard) summaryCard.style.display = 'none';
    updateFreezeUI();
    return;
  }

  const legendCard   = document.querySelector('.legend.card')  as HTMLElement | null;
  const summaryCard  = document.querySelector('.summary.card') as HTMLElement | null;
  if (legendCard)  legendCard.style.display  = '';
  if (summaryCard) summaryCard.style.display = '';

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const startOffset = (firstDay + 6) % 7;

  ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach((d) => {
    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = d;
    calendar.appendChild(header);
  });

  let publicHolidays: Record<string, unknown> = {};
  let schoolHolidays: Array<{ start?: string; end?: string }> = [];
  try {
    [publicHolidays, schoolHolidays] = await Promise.all([
      fetchPublicHolidays(year) as Promise<Record<string, unknown>>,
      fetchSchoolHolidays(year) as Promise<Array<{ start?: string; end?: string }>>,
    ]);
  } catch (e) {
    console.warn('calendar-ui: holidays fetch error', e);
  }

  const publicHolidayDates = new Set(Object.keys(publicHolidays));
  const schoolHolidayDates = new Set(
    schoolHolidays.flatMap((h) => {
      if (!h.start || !h.end) return [];
      const dates: string[] = [];
      const cur = new Date(h.start);
      const end = new Date(h.end);
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    })
  );

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    calendar.appendChild(empty);
  }

  const frozen = isCurrentMonthFrozen();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendar.appendChild(createDayElement(d, dateStr, { publicHolidayDates, schoolHolidayDates, frozen }));
  }

  updateFreezeUI();
}

function createDayElement(day: number, dateStr: string, { publicHolidayDates, schoolHolidayDates, frozen }: DayElementOptions): HTMLElement {
  const dayDiv = document.createElement('div');
  const dow = new Date(dateStr).getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isPublicHoliday = publicHolidayDates.has(dateStr);
  const isSchoolHoliday = schoolHolidayDates.has(dateStr);

  const coach = currentCoach as Coach;
  const key = `${coach.id}-${dateStr}`;
  const data = (timeData as Record<string, DayData>)[key];

  const classes = ['calendar-day'];
  if (isWeekend) classes.push('weekend');
  if (isPublicHoliday) classes.push('public-holiday');
  if (isSchoolHoliday) classes.push('school-holiday');
  if (data) {
    if (data.competition) classes.push('has-competition');
    else if ((data.hours ?? 0) > 0 || (data.km ?? 0) > 0) classes.push('has-data');
    if ((data.peage ?? 0) > 0 || (data.hotel ?? 0) > 0 || (data.achat ?? 0) > 0) classes.push('has-purchase');
  }
  if (frozen) classes.push('frozen');
  dayDiv.className = classes.join(' ');

  const dayNumber = document.createElement('span');
  dayNumber.className = 'day-number';
  dayNumber.textContent = String(day);
  dayDiv.appendChild(dayNumber);

  if (data) {
    const indicator = document.createElement('span');
    indicator.className = 'day-indicator';
    if (data.competition)           indicator.textContent = '\uD83C\uDFC6';
    else if ((data.hours ?? 0) > 0) indicator.textContent = `${data.hours}h`;
    else if ((data.km ?? 0) > 0)    indicator.textContent = `${data.km}km`;
    dayDiv.appendChild(indicator);
  }

  dayDiv.addEventListener('click', () => handleDayClick(dateStr));
  dayDiv.dataset.date = dateStr;
  return dayDiv;
}

async function handleDayClick(dateStr: string): Promise<void> {
  if (!currentCoach) { alert('Veuillez sélectionner un profil.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  const frozen = isCurrentMonthFrozen();
  if (!isAdmin && frozen) { alert("Cette fiche est gelée. Seul l'administrateur peut la modifier."); return; }
  openDayModal(dateStr);
}

// ──────────────────────────────────────────────────────────────────────────────
// Day modal
// ──────────────────────────────────────────────────────────────────────────────
export function openDayModal(dateStr: string): void {
  setSelectedDay(dateStr);

  const coach = currentCoach as Coach;
  const key = `${coach.id}-${dateStr}`;
  const data: DayData = (timeData as Record<string, DayData>)[key] ?? {};

  const title = document.getElementById('dayTitle') as HTMLElement | null;
  if (title) title.textContent = `Modifier le ${dateStr}`;

  const isVolunteerOrAdmin =
    __isVolunteerProfile(coach) ||
    (coach as unknown as Record<string, unknown>).profile_type === 'admin' ||
    (coach as unknown as Record<string, unknown>).role === 'admin';
  const hoursGroup = document.getElementById('trainingHoursGroup') as HTMLElement | null;
  if (hoursGroup) hoursGroup.style.display = isVolunteerOrAdmin ? 'none' : '';

  _setField('trainingHours',          data.hours         ?? '');
  _setField('kilometers',             data.km            ?? '');
  _setField('peage',                  data.peage         ?? '');
  _setField('hotel',                  data.hotel         ?? '');
  _setField('achat',                  data.achat         ?? '');
  _setField('competitionDescription', data.description   ?? '');
  _setField('departurePlace',         data.departurePlace ?? '');
  _setField('arrivalPlace',           data.arrivalPlace  ?? '');

  const compCb = document.getElementById('competitionDay') as HTMLInputElement | null;
  if (compCb) compCb.checked = !!data.competition;

  const travelGroup = document.getElementById('travelGroup') as HTMLElement | null;
  if (travelGroup) travelGroup.style.display = data.competition ? '' : 'none';

  _showJustificationLink('peageJustificationLink', 'existingPeageJustification',  data.justificationUrl      ?? '');
  _showJustificationLink('hotelJustificationLink', 'existingHotelJustification',  data.hotelJustificationUrl ?? '');
  _showJustificationLink('achatJustificationLink', 'existingAchatJustification',  data.achatJustificationUrl ?? '');

  ['peageJustification','hotelJustification','achatJustification'].forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = '';
  });

  const deleteBtn = document.getElementById('deleteDay') as HTMLElement | null;
  if (deleteBtn) deleteBtn.style.display = Object.keys(data).length ? '' : 'none';

  document.getElementById('dayModal')?.classList.add('active');
}

function _setField(id: string, value: unknown): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = String(value ?? '');
}

function _showJustificationLink(linkId: string, wrapperId: string, url: string): void {
  const link    = document.getElementById(linkId)    as HTMLAnchorElement | null;
  const wrapper = document.getElementById(wrapperId) as HTMLElement | null;
  if (link)    link.href             = url || '#';
  if (wrapper) wrapper.style.display = url ? '' : 'none';
}

// ──────────────────────────────────────────────────────────────────────────────
// Save / Delete
// ──────────────────────────────────────────────────────────────────────────────
export async function saveDay(): Promise<void> {
  if (!currentCoach || !selectedDay) { alert('Aucun profil ou jour sélectionné.'); return; }

  const g = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement | null)?.value ?? '') || 0;
  const hours       = g('trainingHours');
  const km          = g('kilometers');
  const peage       = g('peage');
  const hotel       = g('hotel');
  const achat       = g('achat');
  const description = (document.getElementById('competitionDescription') as HTMLInputElement | null)?.value?.trim() || null;
  const departurePlace = (document.getElementById('departurePlace') as HTMLInputElement | null)?.value?.trim() || null;
  const arrivalPlace   = (document.getElementById('arrivalPlace')   as HTMLInputElement | null)?.value?.trim() || null;
  const competition    = (document.getElementById('competitionDay') as HTMLInputElement | null)?.checked ?? false;

  const peageFile = (document.getElementById('peageJustification') as HTMLInputElement | null)?.files?.[0];
  const hotelFile = (document.getElementById('hotelJustification') as HTMLInputElement | null)?.files?.[0];
  const achatFile = (document.getElementById('achatJustification') as HTMLInputElement | null)?.files?.[0];

  const coach = currentCoach as Coach;
  const key = `${coach.id}-${selectedDay}`;
  const existing: DayData = (timeData as Record<string, DayData>)[key] ?? {};

  if (peage > 0 && !peageFile && !existing.justificationUrl)      { alert('Veuillez joindre un justificatif de péage.'); return; }
  if (hotel > 0 && !hotelFile && !existing.hotelJustificationUrl) { alert("Veuillez joindre un justificatif d'hébergement."); return; }
  if (achat > 0 && !achatFile && !existing.achatJustificationUrl) { alert("Veuillez joindre un justificatif d'achat."); return; }

  let peageUrl = existing.justificationUrl      ?? null;
  let hotelUrl = existing.hotelJustificationUrl ?? null;
  let achatUrl = existing.achatJustificationUrl ?? null;

  if (peageFile) peageUrl = await __uploadExpenseJustification(peageFile, 'peage');
  if (hotelFile) hotelUrl = await __uploadExpenseJustification(hotelFile, 'hotel');
  if (achatFile) achatUrl = await __uploadExpenseJustification(achatFile, 'achat');

  const payload = {
    coach_id:                coach.id,
    date:                    selectedDay,
    hours, km, peage, hotel, achat,
    description,
    departure_place:         departurePlace,
    arrival_place:           arrivalPlace,
    competition,
    justification_url:       peageUrl,
    hotel_justification_url: hotelUrl,
    achat_justification_url: achatUrl,
    owner_uid:               (currentUser as User | null)?.id    ?? null,
    owner_email:             (currentUser as User | null)?.email ?? null,
  };

  const { data: saved, error } = await _supabase!
    .from('time_data')
    .upsert([payload], { onConflict: 'coach_id,date' })
    .select();

  if (error) { alert('Erreur lors de la sauvegarde : ' + error.message); return; }

  const newTimeData = { ...(timeData as Record<string, DayData>) };
  newTimeData[key] = (saved?.[0] ?? payload) as DayData;
  setTimeData(newTimeData);

  await _logAuditEvent!(
    'timesheet.update', 'time_data',
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay, hours, km } }),
  );

  if (_notifyAdminAlert) {
    const coachName = __getCoachDisplayName(coach) || (coach as unknown as Record<string, unknown>).name as string || 'Inconnu';
    _notifyAdminAlert(coachName, selectedDay, { hours, km, peage, hotel, achat, competition }).catch(() => {});
  }

  document.getElementById('dayModal')?.classList.remove('active');
  await updateCalendar();
  updateSummary();
}

export async function deleteDay(): Promise<void> {
  if (!currentCoach || !selectedDay) return;
  const coach = currentCoach as Coach;
  const key = `${coach.id}-${selectedDay}`;
  const existing = (timeData as Record<string, DayData>)[key];
  if (!existing) { document.getElementById('dayModal')?.classList.remove('active'); return; }
  if (!confirm(`Supprimer les données du ${selectedDay} ?`)) return;

  const { error } = await _supabase!
    .from('time_data')
    .delete()
    .eq('coach_id', coach.id)
    .eq('date', selectedDay);

  if (error) { alert('Erreur lors de la suppression : ' + error.message); return; }

  await _logAuditEvent!(
    'timesheet.delete', 'time_data',
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay } }),
  );

  const newTimeData = { ...(timeData as Record<string, DayData>) };
  delete newTimeData[key];
  setTimeData(newTimeData);

  document.getElementById('dayModal')?.classList.remove('active');
  await updateCalendar();
  updateSummary();
}

// Globals for backwards compat
(window as Record<string, unknown>).updateCalendar = updateCalendar;
(window as Record<string, unknown>).openDayModal   = openDayModal;
(window as Record<string, unknown>).saveDay        = saveDay;
(window as Record<string, unknown>).deleteDay      = deleteDay;
(window as Record<string, unknown>).loadCoaches    = loadCoaches;
