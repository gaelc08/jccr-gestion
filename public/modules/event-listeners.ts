// event-listeners.ts — Binds all UI event handlers after login.
import {
  currentMonth, currentCoach, coaches,
  setCurrentCoach, setCurrentMonth,
} from './app-context.js';
import type { Coach, User } from '../../src/types/index.js';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface SupabaseAuth {
  signOut(opts?: { scope?: string }): Promise<{ error: { message: string } | null }>;
  getUser(): Promise<{ data: { user: User | null } }>;
}
interface SupabaseFrom {
  select(cols: string): {
    eq(col: string, val: string): {
      maybeSingle(): Promise<{ data: Record<string, unknown> | null }>;
    };
  };
  upsert(rows: unknown[], opts?: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
}
interface SupabaseRpc {
  rpc(name: string): Promise<unknown>;
}
interface SupabaseClient extends SupabaseAuth, SupabaseRpc {
  auth: SupabaseAuth;
  from(table: string): SupabaseFrom;
}

export interface EventListenerHandlers {
  updateCalendar?: () => Promise<void> | void;
  updateSummary?: () => void;
  openCoachModal?: (mode: 'add' | 'edit', coach?: Coach | null) => void;
  saveCoach?: () => void;
  deleteCoach?: () => void;
  inviteCoach?: () => void;
  inviteAdmin?: () => void;
  openDayModal?: (date: string) => void;
  saveDay?: () => void;
  deleteDay?: () => void;
  toggleFreezeMonth?: () => void;
  openAuditLogsModal?: () => void;
  loadAuditLogs?: () => void;
  toggleMembersSection?: (show?: boolean) => void;
  exportDeclarationXLS?: () => void;
  exportTimesheetHTML?: () => void;
  exportExpenseHTML?: () => void;
  exportMonthlyExpenses?: () => void;
  openMileagePreviewModal?: () => void;
  openMonthlySummaryPreviewModal?: () => void;
  importCoachData?: (file: File) => void;
  exportBackupJSON?: () => void;
  reloadData?: (opts?: { isAdminOverride?: boolean }) => Promise<void>;
  supabase: SupabaseClient;
}

// ──────────────────────────────────────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────────────────────────────────────
let _handlers: EventListenerHandlers = {} as EventListenerHandlers;

export function initEventListeners(handlers: EventListenerHandlers): void {
  _handlers = handlers;
}

// ──────────────────────────────────────────────────────────────────────────────
// Competitions section toggle
// ──────────────────────────────────────────────────────────────────────────────
let _competitionsVisible = false;

function toggleCompetitionsSection(show?: boolean): void {
  const section = document.getElementById('competitionsSection');
  if (!section) return;
  _competitionsVisible = show !== undefined ? show : !_competitionsVisible;
  section.style.display = _competitionsVisible ? 'block' : 'none';
  section.hidden = !_competitionsVisible;

  // Hide members section if competitions is shown
  if (_competitionsVisible) {
    const membersSection = document.getElementById('membersSection');
    if (membersSection) { membersSection.style.display = 'none'; membersSection.hidden = true; }
  }

  const planningEls: (Element | null)[] = [
    document.getElementById('coachSelectorGroup'),
    document.getElementById('monthSelect')?.closest('label') ?? null,
    document.getElementById('adminTopBar'),
    document.getElementById('frozenBanner'),
    document.getElementById('calendar'),
    document.querySelector('.summary.card'),
    document.querySelector('.legend.card'),
  ];
  planningEls.forEach((el) => {
    if (el) (el as HTMLElement).style.display = _competitionsVisible ? 'none' : '';
  });

  if (_competitionsVisible) {
    import('./competitions-ui.js').then((m) => {
      (m as { showCompetitionsSection?: () => void }).showCompetitionsSection?.();
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// setupEventListeners
// ──────────────────────────────────────────────────────────────────────────────
export function setupEventListeners(): void {
  const {
    updateCalendar, updateSummary,
    openCoachModal, saveCoach, deleteCoach,
    inviteCoach, inviteAdmin,
    openDayModal, saveDay, deleteDay,
    toggleFreezeMonth,
    openAuditLogsModal, loadAuditLogs, toggleMembersSection,
    exportDeclarationXLS, exportTimesheetHTML,
    exportExpenseHTML, exportMonthlyExpenses,
    openMileagePreviewModal, openMonthlySummaryPreviewModal,
    importCoachData, exportBackupJSON,
    supabase,
  } = _handlers;

  const bindClick = (id: string, handler: () => void): HTMLElement | null => {
    const el = document.getElementById(id);
    if (!el) { console.warn(`WARN missing element for click binding: #${id}`); return null; }
    el.onclick = handler;
    return el;
  };
  const bindChange = (id: string, handler: (e: Event) => void): HTMLElement | null => {
    const el = document.getElementById(id);
    if (!el) { console.warn(`WARN missing element for change binding: #${id}`); return null; }
    el.onchange = handler;
    return el;
  };

  // Month picker — init to currentMonth
  const monthSelectEl = document.getElementById('monthSelect') as HTMLSelectElement | null;
  if (monthSelectEl) monthSelectEl.value = currentMonth;

  // App-level logout button
  const logoutBtnApp = document.getElementById('logoutBtnApp') as HTMLButtonElement | null;
  if (logoutBtnApp) {
    logoutBtnApp.addEventListener('click', async () => {
      logoutBtnApp.disabled = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) { alert('Déconnexion échouée : ' + error.message); return; }
        (document.getElementById('appContainer')  as HTMLElement).style.display = 'none';
        (document.getElementById('authContainer') as HTMLElement).style.display = 'flex';
      } catch (e) {
        alert('Erreur de déconnexion : ' + (e as Error).message);
      } finally {
        logoutBtnApp.disabled = false;
      }
    });
  }

  // Month select
  bindChange('monthSelect', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    setCurrentMonth(val);
    const topMonth = document.getElementById('adminTopBarMonthSelect') as HTMLSelectElement | null;
    if (topMonth && topMonth.value !== val) topMonth.value = val;
    updateCalendar?.();
    updateSummary?.();
  });

  // Admin top bar month select
  const adminTopBarMonthEl = document.getElementById('adminTopBarMonthSelect') as HTMLSelectElement | null;
  if (adminTopBarMonthEl) {
    const sidebarMonthEl = document.getElementById('monthSelect') as HTMLSelectElement | null;
    if (sidebarMonthEl) adminTopBarMonthEl.value = sidebarMonthEl.value;
    adminTopBarMonthEl.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      setCurrentMonth(val);
      if (sidebarMonthEl && sidebarMonthEl.value !== val) sidebarMonthEl.value = val;
      updateCalendar?.();
      updateSummary?.();
    });
  }

  // Coach select
  bindChange('coachSelect', async (e) => {
    const val = (e.target as HTMLSelectElement).value;
    const coach = (coaches as Coach[]).find((c) => String(c.id) === val) ?? null;
    setCurrentCoach(coach);
    const topCoach = document.getElementById('adminTopBarCoachSelect') as HTMLSelectElement | null;
    if (topCoach && topCoach.value !== val) topCoach.value = val;
    if (_competitionsVisible) toggleCompetitionsSection(false);
    await updateCalendar?.();
    updateSummary?.();
  });

  // Admin top bar coach select
  const adminTopBarCoachEl = document.getElementById('adminTopBarCoachSelect') as HTMLSelectElement | null;
  if (adminTopBarCoachEl) {
    const sidebarCoachEl = document.getElementById('coachSelect') as HTMLSelectElement | null;
    adminTopBarCoachEl.addEventListener('change', async (e) => {
      const val = (e.target as HTMLSelectElement).value;
      const coach = (coaches as Coach[]).find((c) => String(c.id) === val) ?? null;
      setCurrentCoach(coach);
      if (sidebarCoachEl && sidebarCoachEl.value !== val) sidebarCoachEl.value = val;
      if (_competitionsVisible) toggleCompetitionsSection(false);
      await updateCalendar?.();
      updateSummary?.();
    });
  }

  // Coach management
  bindClick('addCoachBtn',  () => openCoachModal?.('add'));
  bindClick('editCoachBtn', () => openCoachModal?.('edit', currentCoach as Coach | null));
  bindClick('cancelCoach',  () => document.getElementById('coachModal')?.classList.remove('active'));
  bindClick('cancelDay',    () => document.getElementById('dayModal')?.classList.remove('active'));
  bindClick('inviteAdminBtn', () => inviteAdmin?.());

  // Freeze
  bindClick('freezeBtn', () => toggleFreezeMonth?.());

  // Audit / HelloAsso / Competitions
  bindClick('auditLogsBtn',  () => openAuditLogsModal?.());
  bindClick('helloAssoBtn', () => toggleMembersSection?.());
  bindClick('competitionsBtn', () => toggleCompetitionsSection());

  // Admin profile modal
  bindClick('adminProfileBtn', async () => {
    const { data: _apUser } = await supabase.auth.getUser();
    const { data } = await supabase.from('admin_profiles').select('*').eq('owner_uid', _apUser?.user?.id ?? '').maybeSingle();
    const f = (id: string, val: unknown) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = String(val ?? '');
    };
    f('adminProfileName',        (data as Record<string, unknown>)?.name);
    f('adminProfileFirstName',   (data as Record<string, unknown>)?.first_name);
    f('adminProfileFunction',    (data as Record<string, unknown>)?.function_title);
    f('adminProfileAddress',     (data as Record<string, unknown>)?.address);
    f('adminProfileVehicle',     (data as Record<string, unknown>)?.vehicle);
    f('adminProfileFiscalPower', (data as Record<string, unknown>)?.fiscal_power);
    f('adminProfileKmRate',      (data as Record<string, unknown>)?.km_rate ?? 0.35);
    document.getElementById('adminProfileModal')?.classList.add('active');
  });
  bindClick('cancelAdminProfile', () => document.getElementById('adminProfileModal')?.classList.remove('active'));
  bindClick('saveAdminProfile', async () => {
    const btn = document.getElementById('saveAdminProfile') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const g = (id: string): string | null =>
        (document.getElementById(id) as HTMLInputElement | null)?.value?.trim() || null;
      const payload: Record<string, unknown> = {
        name:           g('adminProfileName'),
        first_name:     g('adminProfileFirstName'),
        function_title: g('adminProfileFunction'),
        address:        g('adminProfileAddress'),
        vehicle:        g('adminProfileVehicle'),
        fiscal_power:   g('adminProfileFiscalPower'),
        km_rate:        parseFloat((document.getElementById('adminProfileKmRate') as HTMLInputElement)?.value) || 0.35,
        updated_at:     new Date().toISOString(),
      };
      const user = (await supabase.auth.getUser()).data?.user;
      if (!user) { alert('Non connecté.'); return; }
      payload.owner_uid = user.id;
      const { error } = await supabase.from('admin_profiles').upsert([payload], { onConflict: 'owner_uid' });
      if (error) { alert('Erreur : ' + error.message); return; }
      try { await supabase.rpc('sync_admin_profile_to_profiles'); } catch (e) { console.warn('sync_admin_profile_to_profiles failed:', e); }
      if (_handlers.reloadData) {
        await _handlers.reloadData({ isAdminOverride: true }).catch((e) => console.warn('reloadData failed:', e));
      }
      document.getElementById('adminProfileModal')?.classList.remove('active');
    } catch (e) {
      alert('Erreur inattendue : ' + (e as Error).message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Exports
  bindClick('exportMonthlyExpensesBtn', () => openMonthlySummaryPreviewModal?.());
  bindClick('backupBtn',               () => exportBackupJSON?.());

  // Delegated export buttons (injected dynamically by export/summary modules)
  document.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement | null)?.id;
    if (id === 'exportDeclarationBtn')                              exportDeclarationXLS?.();
    else if (id === 'exportTimesheetBtn' || id === 'timesheetBtn') exportTimesheetHTML?.();
    else if (id === 'exportExpenseBtn'   || id === 'mileageBtn')   exportExpenseHTML?.();
    else if (id === 'exportMileagePreviewBtn')                      openMileagePreviewModal?.();
    else if (id === 'monthlySummaryPreviewBtn')                     openMonthlySummaryPreviewModal?.();
  });

  // Import
  const importInput = document.getElementById('importFile') as HTMLInputElement | null;
  if (importInput) {
    importInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) importCoachData?.(file);
      importInput.value = '';
    };
  }

  // Coach modal
  bindClick('saveCoach',   () => saveCoach?.());
  bindClick('deleteCoach', () => deleteCoach?.());
  bindClick('inviteCoach', () => inviteCoach?.());

  // Day modal
  bindClick('saveDay',   () => saveDay?.());
  bindClick('deleteDay', () => deleteDay?.());

  // competition checkbox ↔ travelGroup
  const competitionDayCb = document.getElementById('competitionDay') as HTMLInputElement | null;
  if (competitionDayCb) {
    competitionDayCb.addEventListener('change', () => {
      const travelGroup = document.getElementById('travelGroup') as HTMLElement | null;
      if (travelGroup) travelGroup.style.display = competitionDayCb.checked ? '' : 'none';
    });
  }

  // Generic modal-close-btn
  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    (btn as HTMLElement).onclick = () => btn.closest('.modal')?.classList.remove('active');
  });

  ['closeAuditLogs', 'closeHelp'].forEach((id) => {
    bindClick(id, () => document.getElementById(id)?.closest('.modal')?.classList.remove('active'));
  });

  bindClick('helpBtn',            () => document.getElementById('helpModal')?.classList.add('active'));
  bindClick('refreshAuditLogsBtn', () => _handlers.loadAuditLogs?.());

  // Calendar grid (delegated) — frozen check is in openDayModal
  const calendarGrid = document.getElementById('calendarGrid');
  if (calendarGrid) {
    calendarGrid.onclick = async (e) => {
      const dayEl = (e.target as HTMLElement | null)?.closest('[data-date]');
      const date = (dayEl as HTMLElement | null)?.dataset?.date;
      if (date) await openDayModal?.(date);
    };
  }

  // Sidebar hamburger
  const sidebarToggle  = document.getElementById('sidebarToggle');
  const sidebarEl      = document.getElementById('appSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  const openSidebar = () => {
    const scrollW = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-width', scrollW + 'px');
    sidebarEl?.classList.add('is-open');
    sidebarOverlay?.classList.add('is-open');
    document.body.classList.add('sidebar-open');
  };
  const closeSidebar = () => {
    sidebarEl?.classList.remove('is-open');
    sidebarOverlay?.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');
    document.documentElement.style.removeProperty('--scrollbar-width');
  };

  sidebarToggle?.addEventListener('click', () => {
    if (sidebarEl?.classList.contains('is-open')) closeSidebar();
    else openSidebar();
  });
  sidebarOverlay?.addEventListener('click', closeSidebar);
  sidebarEl?.querySelectorAll('.sidebar-nav-btn').forEach((btn) => {
    btn.addEventListener('click', closeSidebar);
  });

  // Admin section déjà gérée par auth-listeners.ts via adminEls

  // Force le décalage du contenu pour la sidebar desktop
  const _adjustSidebarLayout = () => {
    const w = window.innerWidth;
    if (w >= 768) {
      const app = document.getElementById('appContainer');
      if (app) { app.style.marginLeft = '280px'; app.style.width = 'calc(100% - 280px)'; }
    } else {
      const app = document.getElementById('appContainer');
      if (app) { app.style.marginLeft = ''; app.style.width = ''; }
    }
  };
  _adjustSidebarLayout();
  window.addEventListener('resize', _adjustSidebarLayout);

  // Dark mode permanent
  document.documentElement.dataset.theme = 'dark';
}
