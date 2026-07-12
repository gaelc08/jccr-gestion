// members-section.ts — Point d'entrée du module membres
// Ce fichier orchestre les sous-modules ; la logique est dans :
//   members-types.ts         — interfaces et types
//   members-core.ts          — état global, helpers, constantes FFJ
//   members-modal.ts         — modal d'édition de nom (remplace prompt())
//   members-list.ts          — onglet "Liste"
//   members-age.ts           — onglet "Par catégorie d'âge"
//   members-whatsapp.ts      — onglet "Groupes WhatsApp"
//   members-mail.ts          — onglet "Envois groupes"
//   members-reconciliation.ts — onglet "Réconciliation"

import {
  setDeps, setMembers, setLastSync, setActiveTab, setMembersVisible,
  getDeps, getMembers, getActiveTab, isMembersVisible, getLastSync,
} from './members-core.ts';
import type { ServiceDeps } from './members-types.ts';
import { renderListTab }            from './members-list.ts';
import { renderAgeTab }             from './members-age.ts';
import { renderWhatsappTab }        from './members-whatsapp.ts';
import { renderMailTab }            from './members-mail.ts';
import { renderReconciliationTab }  from './members-reconciliation.ts';

// ─── Public API ──────────────────────────────────────────────────────────────

export function initMembersSection(deps: ServiceDeps): void {
  setDeps(deps);
}

export function toggleMembersSection(show?: boolean): void {
  const section = document.getElementById('membersSection');
  if (!section) return;
  const next = show !== undefined ? show : !isMembersVisible();
  setMembersVisible(next);
  section.style.display = next ? 'block' : 'none';
  showCalendarElements(!next);

  const compSection = document.getElementById('competitionsSection');
  if (compSection && next) compSection.style.display = 'none';

  if (next) void loadAndRenderAll();
}

export function hideMembersSection(): void {
  toggleMembersSection(false);
}

export function bootMembersSection(): void {
  wireToolbarEvents();
}

// ─── Internals ───────────────────────────────────────────────────────────────

function showCalendarElements(show: boolean): void {
  const els: (HTMLElement | null)[] = [
    document.getElementById('coachSelectorGroup'),
    document.getElementById('monthSelect')?.closest('label') as HTMLElement | null,
    document.getElementById('frozenBanner'),
    document.getElementById('calendar'),
    document.querySelector('.summary.card') as HTMLElement | null,
    document.querySelector('.legend.card') as HTMLElement | null,
    document.getElementById('coachGreeting'),
  ];
  els.forEach((el) => { if (el) el.style.display = show ? '' : 'none'; });
}

async function loadAndRenderAll(): Promise<void> {
  try {
    const [lastSync, members] = await Promise.all([
      getDeps().getLastSyncTime(),
      getDeps().getHelloAssoMembers(),
    ]);
    setLastSync(lastSync);
    setMembers(members);
    void renderActiveTab();
    void updateToolbarInfo();
    void loadCampaigns();
  } catch (e) {
    const panel = document.getElementById('membersTabList');
    if (panel) panel.innerHTML = `<div class="members-empty">Erreur de chargement : ${getDeps().escapeHtml(String((e as Error).message || e))}</div>`;
  }
}

async function updateToolbarInfo(): Promise<void> {
  const members = getMembers();
  const syncEl  = document.getElementById('membersSyncInfo');
  const lastSync = getLastSync();
  if (syncEl) syncEl.textContent = lastSync
    ? `Dernière sync. : ${new Date(lastSync).toLocaleString('fr-FR')}`
    : 'Jamais synchronisé';

  const unsaisis  = members.filter((m) => !m.raw_data?.saisie_ffjda).length;
  const counterEl = document.getElementById('membersCounter');
  if (counterEl) {
    counterEl.textContent = `${unsaisis}/${members.length} à saisir`;
    counterEl.style.color = unsaisis > 0 ? '#e57373' : '#81c784';
  }
}

async function loadCampaigns(): Promise<void> {
  const sel = document.getElementById('membersCampaignSelect') as HTMLSelectElement | null;
  if (!sel) return;
  try {
    const token = localStorage.getItem('jcc_api_token');
    if (!token) { sel.innerHTML = '<option value="">Token non configuré</option>'; return; }
    const r = await fetch('https://sync.judo-cattenom.fr/campaigns', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) { sel.innerHTML = '<option value="">Erreur API</option>'; return; }
    const data = await r.json() as { campaigns?: Array<{ type?: string; slug: string }>; current?: string };
    const campaigns = (data.campaigns ?? []).filter((c) => (c.type ?? 'Membership') === 'Membership' && c.slug.includes('adhesion'));
    sel.innerHTML = '';
    for (const c of campaigns) {
      const opt = document.createElement('option');
      opt.value = c.slug;
      opt.textContent = c.slug.replace(/^adhesion-(\d{4})-(\d{4})-sport$/, 'Saison $1/$2');
      if (c.slug === data.current) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch (e) {
    sel.innerHTML = `<option value="">Erreur: ${getDeps().escapeHtml((e as Error).message)}</option>`;
  }
}

function switchTab(tabId: string): void {
  setActiveTab(tabId);
  document.querySelectorAll('.members-tab').forEach((t) => t.classList.remove('is-active'));
  document.querySelectorAll('.members-tab-panel').forEach((p) => p.classList.remove('is-active'));
  document.querySelector(`.members-tab[data-tab="${tabId}"]`)?.classList.add('is-active');
  const id = 'membersTab' + tabId.charAt(0).toUpperCase() + tabId.slice(1);
  document.getElementById(id)?.classList.add('is-active');
  void renderActiveTab();
}

async function renderActiveTab(): Promise<void> {
  switch (getActiveTab()) {
    case 'list':           return renderListTab();
    case 'age':            return renderAgeTab();
    case 'whatsapp':       return renderWhatsappTab();
    case 'mail':           return renderMailTab();
    case 'reconciliation': return renderReconciliationTab();
  }
}

function wireToolbarEvents(): void {
  document.getElementById('membersTabs')?.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest('.members-tab') as HTMLButtonElement | null;
    if (tab?.dataset.tab) switchTab(tab.dataset.tab);
  });

  const syncBtn = document.getElementById('syncMembersBtn') as HTMLButtonElement | null;
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Synchronisation...';
      try { await getDeps().syncHelloAssoMembers(); }
      catch (e) { alert('Erreur synchronisation : ' + ((e as Error).message || e)); }
      finally { await loadAndRenderAll(); syncBtn.disabled = false; syncBtn.textContent = 'Synchroniser'; }
    };
  }

  const sel = document.getElementById('membersCampaignSelect') as HTMLSelectElement | null;
  if (sel) {
    sel.onchange = async () => {
      const slug = sel.value;
      if (!slug) return;
      const token = localStorage.getItem('jcc_api_token');
      try {
        await fetch('https://sync.judo-cattenom.fr/campaigns/current', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ form_slug: slug }),
        });
      } catch { /* ignore */ }
      await loadAndRenderAll();
    };
  }

  const filterChk = document.getElementById('membersUnsaisieOnly') as HTMLInputElement | null;
  if (filterChk) {
    filterChk.onchange = () => { if (getActiveTab() === 'list') void renderListTab(); };
  }

  const csvInput = document.getElementById('membersCsvInput') as HTMLInputElement | null;
  if (csvInput) {
    csvInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = getDeps().parseHelloAssoCsv(text);
        if (!rows.length) { alert('Aucune donnée trouvée dans le CSV.'); return; }
        const withDob = rows.filter((r) => r.date_of_birth);
        if (!withDob.length) { alert('Le CSV ne contient pas de colonne "date de naissance".'); return; }
        const { updated, notFound } = await getDeps().importHelloAssoCsvData(getDeps().supabase, withDob);
        let msg = `${updated} date(s) de naissance importée(s).`;
        if (notFound.length) msg += `\n${notFound.length} email(s) non trouvé(s).`;
        alert(msg);
        await loadAndRenderAll();
      } catch (err) { alert('Erreur import CSV : ' + ((err as Error).message || err)); }
      csvInput.value = '';
    };
  }

  const ffjdaInput = document.getElementById('membersFfjdaCsvInput') as HTMLInputElement | null;
  if (ffjdaInput) {
    ffjdaInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = await getDeps().importFfjdaCsv(text);
        let msg = `${result.matched}/${result.total} adhérents marqués comme saisis.`;
        if (result.not_found) msg += `\n${result.not_found} non trouvé(s).`;
        alert(msg);
        await loadAndRenderAll();
      } catch (err) {
        const msg = (err as Record<string, string>)?.message ?? (err as Record<string, string>)?.detail ?? String(err);
        alert('Erreur import FFJDA : ' + msg);
      }
      ffjdaInput.value = '';
    };
  }

  document.getElementById('membersReconBtn')?.addEventListener('click', () => {
    (document.querySelector('.members-tab[data-tab="reconciliation"]') as HTMLButtonElement | null)?.click();
  });

  // API token config
  const tokenInput = document.getElementById('membersTokenInput') as HTMLInputElement | null;
  const saveBtn    = document.getElementById('membersTokenSave');
  const testBtn    = document.getElementById('membersTokenTest');
  const statusEl   = document.getElementById('membersTokenStatus');

  if (tokenInput) tokenInput.value = localStorage.getItem('jcc_api_token') ?? '';

  saveBtn?.addEventListener('click', () => {
    if (!tokenInput) return;
    const token = tokenInput.value.trim();
    if (token) { localStorage.setItem('jcc_api_token', token); }
    else { localStorage.removeItem('jcc_api_token'); }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent   = token ? 'Token enregistré' : 'Token supprimé';
      statusEl.style.color   = token ? '#28a745' : '#17a2b8';
    }
  });

  testBtn?.addEventListener('click', async () => {
    if (!tokenInput || !statusEl) return;
    const token = tokenInput.value.trim();
    if (!token) { statusEl.style.display = 'block'; statusEl.textContent = 'Aucun token à tester'; statusEl.style.color = '#ffc107'; return; }
    statusEl.style.display = 'block'; statusEl.textContent = 'Test en cours...'; statusEl.style.color = '#17a2b8';
    try {
      const resp = await fetch('https://sync.judo-cattenom.fr/stats', { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const d = await resp.json() as { paid?: number };
        statusEl.textContent = `Connexion OK — ${d.paid ?? '?'} adhérents`;
        statusEl.style.color = '#28a745';
      } else {
        statusEl.textContent = `Erreur ${resp.status}: ${resp.statusText}`;
        statusEl.style.color = '#dc3545';
      }
    } catch (err) {
      statusEl.textContent = `Erreur réseau: ${(err as Error).message}`;
      statusEl.style.color = '#dc3545';
    }
  });
}
