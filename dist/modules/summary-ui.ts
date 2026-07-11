// summary-ui.ts — Monthly summary, freeze management, CEA button.
import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeMonth } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentCoach, currentMonth, currentUser, currentAccessToken,
  setFrozenMonths, setCurrentMonth,
  __getProfileType, __isVolunteerProfile,
  __buildMonthlyAuditPayload,
  __calculateAnnualMileageAmount, __getMileageYearBreakdown, __formatNumberFr,
} from './app-context.js';
import { isCurrentUserAdminDB, __isAdminForUi } from './admin-service.js';
import { currencyDisplay, numberDisplay } from './display-format.js';
import { getCoachCivilite } from './profile-utils.js';
import type { Coach, User } from '../../src/types/index.js';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
type LogAuditFn = (action: string, entity: string, payload: Record<string, unknown>) => Promise<void>;

interface CEAPayload {
  nomCoach:         string;
  mois:             string;
  heures:           number;
  tauxHoraire:      number;
  salaireFormation: number;
  joursComp:        number;
  salaireComp:      number;
  salaireBrut:      number;
}

interface DayData {
  hours?:       number;
  km?:          number;
  peage?:       number;
  hotel?:       number;
  achat?:       number;
  competition?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────────────────────────────────────
let _logAuditEvent: LogAuditFn | null = null;

export function initSummaryUi({ logAuditEvent }: { logAuditEvent: LogAuditFn }): void {
  _logAuditEvent = logAuditEvent;
}

// ──────────────────────────────────────────────────────────────────────────────
// Freeze helpers
// ──────────────────────────────────────────────────────────────────────────────
export function isCurrentMonthFrozen(): boolean {
  if (!currentCoach || !currentMonth) return false;
  return (frozenMonths as Set<string>).has(`${(currentCoach as Coach).id}-${__normalizeMonth(currentMonth)}`);
}

export function updateFreezeUI(): void {
  const frozen = isCurrentMonthFrozen();
  const banner = document.getElementById('frozenBanner') as HTMLElement | null;
  const btn    = document.getElementById('freezeBtn')    as HTMLButtonElement | null;
  if (banner) banner.style.display = frozen ? 'block' : 'none';
  if (btn) {
    if (frozen) {
      btn.textContent = '\uD83D\uDD13 Dégeler la fiche';
      btn.classList.add('frozen');
    } else {
      btn.textContent = '\uD83D\uDD12 Geler la fiche';
      btn.classList.remove('frozen');
    }
  }
}

export async function toggleFreezeMonth(): Promise<void> {
  if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin)           { alert("Seul l'admin peut geler ou dégeler une fiche."); return; }
  if (!currentAccessToken) { alert('Session invalide. Reconnectez-vous puis réessayez.'); return; }

  const coach          = currentCoach as Coach;
  const normalizedMonth = __normalizeMonth(currentMonth);
  const frozen         = isCurrentMonthFrozen();
  const key            = `${coach.id}-${normalizedMonth}`;

  if (frozen) {
    const urlObj = new URL(`${supabaseUrl}/rest/v1/frozen_timesheets`);
    urlObj.searchParams.set('coach_id', `eq.${coach.id}`);
    urlObj.searchParams.set('month',    `eq.${normalizedMonth}`);
    const res = await globalThis.fetch(urlObj.toString(), {
      method: 'DELETE',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      alert('Erreur lors du dégel : ' + (text || `${res.status} ${res.statusText}`));
      return;
    }
    const newFrozen = new Set(frozenMonths as Set<string>);
    newFrozen.delete(key);
    setFrozenMonths(newFrozen);
    await _logAuditEvent!('timesheet.unfreeze', 'frozen_timesheet', __buildMonthlyAuditPayload({
      coach, entityId: key, month: normalizedMonth,
    }));
  } else {
    const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/frozen_timesheets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        coach_id:   coach.id,
        month:      normalizedMonth,
        frozen_by:  (currentUser as User | null)?.email ?? null,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      const lower = String(text ?? '').toLowerCase();
      if (lower.includes('check constraint') || lower.includes('23514')) {
        alert('Erreur lors du gel : la colonne month de frozen_timesheets refuse la valeur. Appliquez la correction SQL du format YYYY-MM dans la migration frozen_timesheets.');
      } else {
        alert('Erreur lors du gel : ' + (text || `${res.status} ${res.statusText}`));
      }
      return;
    }
    const newFrozen = new Set(frozenMonths as Set<string>);
    newFrozen.add(key);
    setFrozenMonths(newFrozen);
    await _logAuditEvent!('timesheet.freeze', 'frozen_timesheet', __buildMonthlyAuditPayload({
      coach, entityId: key, month: normalizedMonth,
    }));
  }
  setCurrentMonth(normalizedMonth);
  updateFreezeUI();
}

// ──────────────────────────────────────────────────────────────────────────────
// Current profile UI
// ──────────────────────────────────────────────────────────────────────────────
export function updateCurrentProfileUI(): void {
  if (!currentCoach) return;
  const isVolunteer = __isVolunteerProfile(currentCoach);
  const ids: Array<[string, boolean]> = [
    ['mileageSection',  !isVolunteer],
    ['salarySection',   !isVolunteer],
    ['mileageBtn',      !isVolunteer],
    ['timesheetBtn',    true],          // always shown
    ['declarationBtn',  !isVolunteer],
  ];
  ids.forEach(([id, show]) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) el.style.display = show ? '' : 'none';
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Monthly summary
// ──────────────────────────────────────────────────────────────────────────────
export function updateSummary(): void {
  const setVal = (id: string, val: string) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) el.textContent = val;
  };

  const EMPTY_IDS = [
    'totalHours','hourlyRate','trainingPayment','compDays','compPayment',
    'totalKm','kmPayment','tollPayment','hotelPayment','purchasePayment',
    'urssafTotalPayment','reimbursementTotalPayment',
  ];

  if (!currentCoach || !currentMonth) {
    EMPTY_IDS.forEach((id) => setVal(id, '\u2014'));
    return;
  }

  const coach = currentCoach as Coach;
  const matchingKeys = Object.keys(timeData as Record<string, unknown>)
    .filter((k) => k.startsWith(`${coach.id}-${currentMonth}`));

  if (matchingKeys.length === 0) {
    EMPTY_IDS.forEach((id) => setVal(id, '0'));
    updateFreezeUI();
    updateCurrentProfileUI();
    return;
  }

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isVolunteer = __isVolunteerProfile(coach);

  let totalHours = 0, totalKm = 0, totalPeage = 0, totalHotel = 0, totalAchat = 0;
  let competitionDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = (timeData as Record<string, DayData>)[`${coach.id}-${dateStr}`];
    if (!data) continue;
    totalHours += data.hours ?? 0;
    totalKm    += data.km    ?? 0;
    totalPeage += data.peage ?? 0;
    totalHotel += data.hotel ?? 0;
    totalAchat += data.achat ?? 0;
    if (data.competition) competitionDays++;
  }

  const hourlyRate      = (coach as Record<string, number>).hourly_rate     ?? 0;
  const dailyAllowance  = (coach as Record<string, number>).daily_allowance ?? 0;
  const kmRate          = (coach as Record<string, number>).km_rate         ?? 0;

  const salaryHours      = totalHours * hourlyRate;
  const salaryCompetition = competitionDays * dailyAllowance;
  const kmAmount          = totalKm * kmRate;
  const totalReimbursement = kmAmount + totalPeage + totalHotel + totalAchat;
  const totalGross         = salaryHours + salaryCompetition;

  const hideIds = isVolunteer
    ? ['summaryRateItem','summaryTrainingPaymentItem','summaryCompPaymentItem','summaryUrssafTotalItem']
    : [];
  ['summaryRateItem','summaryTrainingPaymentItem','summaryCompPaymentItem','summaryUrssafTotalItem'].forEach((id) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) el.style.display = hideIds.includes(id) ? 'none' : '';
  });

  setVal('totalHours',                numberDisplay(totalHours, 2) + ' h');
  setVal('hourlyRate',                currencyDisplay(hourlyRate));
  setVal('trainingPayment',           currencyDisplay(salaryHours));
  setVal('compDays',                  competitionDays + ' j');
  setVal('compPayment',               currencyDisplay(salaryCompetition));
  setVal('totalKm',                   numberDisplay(totalKm) + ' km');
  setVal('kmPayment',                 currencyDisplay(kmAmount));
  setVal('tollPayment',               currencyDisplay(totalPeage));
  setVal('hotelPayment',              currencyDisplay(totalHotel));
  setVal('purchasePayment',           currencyDisplay(totalAchat));
  setVal('urssafTotalPayment',        currencyDisplay(totalGross));
  setVal('reimbursementTotalPayment', currencyDisplay(totalReimbursement));

  _updateCEAButton({
    nomCoach:         `${getCoachCivilite(coach)} ${(coach as Record<string, unknown>).name ?? ''} ${(coach as Record<string, unknown>).first_name ?? ''}`.trim(),
    mois:             currentMonth,
    heures:           totalHours,
    tauxHoraire:      hourlyRate,
    salaireFormation: salaryHours,
    joursComp:        competitionDays,
    salaireComp:      salaryCompetition,
    salaireBrut:      totalGross,
  });

  updateFreezeUI();
  updateCurrentProfileUI();
}

// ──────────────────────────────────────────────────────────────────────────────
// CEA copy button
// ──────────────────────────────────────────────────────────────────────────────
let _ceaPayload: CEAPayload | null = null;

function _updateCEAButton(payload: CEAPayload): void {
  _ceaPayload = payload;
  const btn = document.getElementById('cea-copy-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
}

export function initCEACopyButton(): void {
  if (document.getElementById('cea-copy-btn')) return;

  const btn = document.createElement('button') as HTMLButtonElement;
  btn.id        = 'cea-copy-btn';
  btn.type      = 'button';
  btn.disabled  = true;
  btn.innerHTML = '\uD83D\uDCCB Copier pour CEA';
  btn.title     = 'Copie les données du mois dans le presse-papier pour le script Tampermonkey CEA URSSAF';
  btn.style.cssText = [
    'display:block', 'margin:12px auto 4px', 'padding:8px 20px',
    'background:#1E3A7B', 'color:#fff', 'border:none', 'border-radius:6px',
    'font-size:0.95rem', 'cursor:pointer', 'opacity:0.6', 'transition:opacity .2s',
  ].join(';');

  btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.opacity = '0.85'; });
  btn.addEventListener('click', async () => {
    if (!_ceaPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(_ceaPayload, null, 2));
      btn.innerHTML = '\u2705 Copié !';
      setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copier pour CEA'; }, 2500);
    } catch {
      alert("Impossible d'accéder au presse-papier. Vérifiez les permissions du navigateur.");
    }
  });

  const target =
    document.getElementById('summarySection') ??
    document.getElementById('summary') ??
    document.querySelector('.summary') as HTMLElement | null;

  if (target) {
    target.appendChild(btn);
  } else {
    setTimeout(() => {
      const t = document.querySelector('.summary') as HTMLElement | null;
      if (t) t.appendChild(btn);
    }, 800);
  }
}

// Globals for backwards compat
(window as Record<string, unknown>).updateSummary        = updateSummary;
(window as Record<string, unknown>).updateFreezeUI       = updateFreezeUI;
(window as Record<string, unknown>).isCurrentMonthFrozen = isCurrentMonthFrozen;
(window as Record<string, unknown>).toggleFreezeMonth    = toggleFreezeMonth;
(window as Record<string, unknown>).initCEACopyButton    = initCEACopyButton;
