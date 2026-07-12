// members-reconciliation.ts — Onglet "Réconciliation" HelloAsso ↔ FFJDA

import { getDeps, esc, renderEditableName, wireEditButtons, getStatusHtml } from './members-core.ts';
import { openEditNameModal } from './members-modal.ts';

const DISC_MAP:    Record<string, string> = { '1': 'judo', '13': 'iaido', '3': 'taiso' };
const DISC_LABELS: Record<string, string> = { judo: 'Judo', iaido: 'Iaido', taiso: 'Taiso' };
const DISC_ORDER  = ['judo', 'iaido', 'taiso'];
const STATUS_ORDER = ['matched', 'name_mismatch', 'corrected', 'unmatched', 'ffjda_only'];
const STATUS_LABELS: Record<string, string> = {
  matched:       '✅ Match',
  name_mismatch: '⚠️ Nom diff.',
  corrected:     '✏️ Corrigé',
  unmatched:     '❌ Non matché',
  ffjda_only:    '🆕 FFJDA seul',
};

function normalizeDisc(val: unknown): string {
  return DISC_MAP[String(val ?? '').trim()] ?? '';
}

export async function renderReconciliationTab(): Promise<void> {
  const panel = document.getElementById('membersTabReconciliation');
  if (!panel) return;

  panel.innerHTML = '<div class="members-empty" style="padding:20px;text-align:center">Chargement de la réconciliation...</div>';

  try {
    const data = await getDeps().getReconciliation() as Record<string, unknown> | null;
    if (!data?.reconciliation) {
      panel.innerHTML = '<div class="members-empty">Aucune donnée de réconciliation. Importez d abord un CSV FFJDA.</div>';
      return;
    }

    const rec          = data.reconciliation as Array<Record<string, unknown>>;
    const matched      = (data.matched      as number) || 0;
    const nameMismatch = (data.name_mismatch as number) || 0;
    const corrected    = (data.corrected    as number) || 0;
    const unmatched    = (data.unmatched    as number) || 0;
    const ffjdaOnly    = (data.ffjda_only   as number) || 0;
    const totalHa      = (data.total_ha     as number) || 0;
    const totalFfjda   = (data.total_ffjda  as number) || 0;

    const disciplineSet = new Set(rec.map((r) => normalizeDisc(r.ha_discipline)).filter(Boolean));
    const disciplines   = DISC_ORDER.filter((d) => disciplineSet.has(d));
    if (!disciplines.length) disciplines.push(...DISC_ORDER);

    const statusSet     = new Set(rec.map((r) => String(r.status ?? '')));
    const statuses      = STATUS_ORDER.filter((s) => statusSet.has(s));

    const currentSearch    = panel.dataset.reconSearch ?? '';
    const currentDiscs     = panel.dataset.reconDiscs
      ? (panel.dataset.reconDiscs as string).split(',').filter(Boolean)
      : disciplines.slice();
    const currentStatuses  = panel.dataset.reconStatuses
      ? (panel.dataset.reconStatuses as string).split(',').filter(Boolean)
      : statuses.slice();

    // ── Filter bar ──
    const filterBar = `<div class="members-list-controls" style="margin-bottom:10px">
      <div class="members-filter-row" style="flex-wrap:wrap;gap:10px">
        <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5)">
          Disciplines :
          ${disciplines.map((d) => `<label class="members-disc-toggle ${currentDiscs.includes(d) ? 'active' : ''}">
            <input type="checkbox" data-recon-disc="${esc(d)}" ${currentDiscs.includes(d) ? 'checked' : ''}>
            ${esc(DISC_LABELS[d] ?? d)}</label>`).join('')}
        </span>
        <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5)">
          Statut :
          ${statuses.map((s) => `<label class="members-disc-toggle ${currentStatuses.includes(s) ? 'active' : ''}">
            <input type="checkbox" data-recon-status="${esc(s)}" ${currentStatuses.includes(s) ? 'checked' : ''}>
            ${esc(STATUS_LABELS[s] ?? s)}</label>`).join('')}
        </span>
        <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:600;margin-left:auto">
          Rechercher :
          <input type="text" id="reconSearchInput" value="${esc(currentSearch)}"
            placeholder="Nom, email, licence..."
            style="background:rgba(255,255,255,0.08);color:#e0e0e0;border:1px solid rgba(255,255,255,0.12);
              border-radius:4px;padding:3px 8px;font-size:0.8rem;font-weight:600;width:200px">
        </label>
      </div>
    </div>`;

    // ── Stats bar ──
    const statsBar = `<div class="members-stats-bar" style="margin-bottom:8px">
      <span class="members-stat matched">✅ <strong>${matched}</strong> match</span>
      <span class="members-stat mismatch">⚠️ <strong>${nameMismatch}</strong> nom diff.</span>
      <span class="members-stat corrected">✏️ <strong>${corrected}</strong> corrigé</span>
      <span class="members-stat unmatched">❌ <strong>${unmatched}</strong> non matché</span>
      <span class="members-stat ffjda-only">🆕 <strong>${ffjdaOnly}</strong> FFJDA seul</span>
      <span style="margin-left:auto;color:rgba(255,255,255,0.5);font-size:0.82rem">${totalHa} HA · ${totalFfjda} FFJDA</span>
    </div>`;

    // ── Filter rows ──
    const filtered = rec.filter((r) => {
      if (!currentStatuses.includes(String(r.status ?? ''))) return false;
      const disc = normalizeDisc(r.ha_discipline);
      if (disc && currentDiscs.length && !currentDiscs.includes(disc)) return false;
      if (!disc && currentDiscs.length < disciplines.length) return false;
      if (currentSearch) {
        const q = currentSearch.toLowerCase();
        const hay = [r.ha_first_name, r.ha_last_name, r.ffjda_first_name, r.ffjda_last_name,
          r.ha_email, r.ffjda_email, r.ffjda_licence].filter(Boolean).map(String).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let tableHtml = `<div class="members-table-wrap" style="max-height:50vh">
      <table class="members-table" style="font-size:0.8rem">
        <thead><tr>
          <th>HelloAsso</th><th>FFJDA</th><th>Email HA</th><th>Email FFJDA</th>
          <th>Naiss. HA</th><th>Naiss. FFJDA</th><th>Licence</th><th>Statut</th>
        </tr></thead><tbody>`;

    for (const r of filtered) {
      const haName    = (r.ha_first_name || r.ha_last_name)
        ? renderEditableName(r.item_id, r.ha_first_name as string, r.ha_last_name as string) : '\u2014';
      const ffjdaName = (r.ffjda_first_name || r.ffjda_last_name)
        ? `${esc(r.ffjda_first_name)} ${esc(r.ffjda_last_name)}` : '\u2014';
      tableHtml += `<tr>
        <td>${haName}</td><td>${ffjdaName}</td>
        <td style="font-size:0.78rem">${r.ha_email    ? esc(r.ha_email)    : '\u2014'}</td>
        <td style="font-size:0.78rem">${r.ffjda_email ? esc(r.ffjda_email) : '\u2014'}</td>
        <td style="font-size:0.78rem">${r.ha_dob      ? esc(r.ha_dob)      : '\u2014'}</td>
        <td style="font-size:0.78rem">${r.ffjda_dob   ? esc(r.ffjda_dob)   : '\u2014'}</td>
        <td style="font-size:0.78rem">${r.ffjda_licence ? esc(r.ffjda_licence) : '\u2014'}</td>
        <td>${getStatusHtml(String(r.status ?? ''))}</td>
      </tr>`;
    }
    tableHtml += `</tbody></table>
      <div style="text-align:right;font-size:0.75rem;color:rgba(255,255,255,0.4);padding:4px 8px">
        ${filtered.length} / ${rec.length} lignes
      </div></div>`;

    panel.innerHTML = filterBar + statsBar + tableHtml;

    // Wire checkboxes
    panel.querySelectorAll('input[data-recon-disc]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const disc = (cb as HTMLInputElement).dataset.reconDisc ?? '';
        const checked = (cb as HTMLInputElement).checked;
        (cb as HTMLInputElement).closest('.members-disc-toggle')?.classList.toggle('active', checked);
        const updated = checked ? [...currentDiscs, disc] : currentDiscs.filter((d) => d !== disc);
        panel.dataset.reconDiscs = updated.join(',');
        void renderReconciliationTab();
      });
    });
    panel.querySelectorAll('input[data-recon-status]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const st = (cb as HTMLInputElement).dataset.reconStatus ?? '';
        const checked = (cb as HTMLInputElement).checked;
        (cb as HTMLInputElement).closest('.members-disc-toggle')?.classList.toggle('active', checked);
        const updated = checked ? [...currentStatuses, st] : currentStatuses.filter((s) => s !== st);
        panel.dataset.reconStatuses = updated.join(',');
        void renderReconciliationTab();
      });
    });

    const searchInput = document.getElementById('reconSearchInput') as HTMLInputElement | null;
    if (searchInput) {
      let debounce: ReturnType<typeof setTimeout>;
      searchInput.addEventListener('input', () => {
        panel.dataset.reconSearch = searchInput.value;
        clearTimeout(debounce);
        debounce = setTimeout(() => void renderReconciliationTab(), 400);
      });
    }

    wireEditButtons(panel, (itemId, first, last) =>
      openEditNameModal(itemId, first, last, () => void renderReconciliationTab()));

  } catch (e) {
    console.error('Reconciliation render error:', e);
    panel.innerHTML = `<div class="members-empty">Erreur : ${esc(String(e))}</div>`;
  }
}
