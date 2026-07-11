// helloasso-ui.js — HelloAsso UI module
// Extracted from app-modular.js (main branch)
// v2: + inline name editing + reconciliation view

/**
 * createHelloAssoUI — factory that injects all dependencies
 * and returns the HelloAsso UI functions as a module API.
 */
export function createHelloAssoUI({
  // Services
  supabase,
  syncHelloAssoMembers,
  getHelloAssoMembers,
  getLastSyncTime,
  parseHelloAssoCsv,
  importHelloAssoCsvData,
  importFfjdaCsv,
  correctMemberName,
  getReconciliation,
  getFfjdaMembers,

  // Utilities
  escapeHtml,
}) {

  // ─────────────────────────────────────────────────────────────────
  // FFJ category helper
  // ─────────────────────────────────────────────────────────────────

  function getFfjCategory(dateOfBirth) {
    if (!dateOfBirth) return null;
    const yearMatch = String(dateOfBirth).match(/(?:^|\D)(\d{4})(?:\D|$)/);
    if (!yearMatch) return null;
    const year = parseInt(yearMatch[1], 10);
    if (isNaN(year)) return null;
    if (year >= 2020) return 'Baby Judo';
    if (year >= 2018) return 'Mini-Poussin';
    if (year >= 2016) return 'Poussin';
    if (year >= 2014) return 'Benjamin';
    if (year >= 2012) return 'Minime';
    if (year >= 2009) return 'Cadet';
    if (year >= 2006) return 'Junior';
    if (year >= 1996) return 'Senior';
    return 'Vétéran';
  }

  // ─────────────────────────────────────────────────────────────────
  // Inline edit helpers
  // ─────────────────────────────────────────────────────────────────

  async function saveNameCorrection(itemId, firstName, lastName) {
    try {
      const result = await correctMemberName(itemId, firstName, lastName);
      if (result.success) {
        // Re-render the whole section to reflect changes
        await renderHelloAssoSection();
      }
    } catch (e) {
      alert('Erreur lors de la correction du nom : ' + (e.message || e));
    }
  }

  function renderEditableNameCell(itemId, firstName, lastName) {
    const escapedFirst = escapeHtml(firstName || '');
    const escapedLast = escapeHtml(lastName || '');
    const displayName = `${escapedFirst} ${escapedLast}`.trim();
    return `
      <span class="ha-name-display" style="cursor:pointer" data-item-id="${escapedFirst}" title="Cliquer pour éditer">
        ${displayName || '—'}
        <button class="ha-edit-btn" data-item-id="${escapeHtml(String(itemId))}"
          data-first="${escapedFirst}" data-last="${escapedLast}"
          style="border:none;background:none;cursor:pointer;font-size:12px;padding:0 4px;opacity:0.5;vertical-align:middle"
          title="Corriger le nom">✏️</button>
      </span>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // Reconciliation view
  // ─────────────────────────────────────────────────────────────────

  async function openReconciliationView() {
    const modal = document.getElementById('reconciliationModal');
    if (!modal) return;
    modal.classList.add('active');

    const content = document.getElementById('reconciliationContent');
    if (!content) return;
    content.innerHTML = '<p>Chargement…</p>';

    try {
      const data = await getReconciliation();
      if (!data || !data.reconciliation) {
        content.innerHTML = '<p class="audit-status">Aucune donnée de réconciliation disponible. Importez d\'abord un CSV FFJDA.</p>';
        return;
      }

      // Stats bar
      const statsHtml = `
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:13px">
          <span style="background:#e3f2fd;padding:4px 10px;border-radius:4px">
            ✅ <strong>${data.matched}</strong> matché(s)
          </span>
          <span style="background:#fff3e0;padding:4px 10px;border-radius:4px">
            ⚠️ <strong>${data.name_mismatch}</strong> nom(s) différent(s)
          </span>
          <span style="background:#e8f5e9;padding:4px 10px;border-radius:4px">
            ✏️ <strong>${data.corrected}</strong> corrigé(s)
          </span>
          <span style="background:#ffebee;padding:4px 10px;border-radius:4px">
            ❌ <strong>${data.unmatched}</strong> non matché(s)
          </span>
          <span style="background:#f3e5f5;padding:4px 10px;border-radius:4px">
            🆕 <strong>${data.ffjda_only}</strong> FFJDA seulement
          </span>
          <span style="margin-left:auto;color:#888">${data.total_ha} HA · ${data.total_ffjda} FFJDA</span>
        </div>`;

      // Build table
      const rows = data.reconciliation.map(r => {
        const statusBadge = getStatusBadge(r.status);
        const haName = r.ha_first_name || r.ha_last_name
          ? renderEditableNameCell(r.item_id, r.ha_first_name, r.ha_last_name)
          : '—';
        const ffjdaName = (r.ffjda_first_name || r.ffjda_last_name)
          ? `${escapeHtml(r.ffjda_first_name)} ${escapeHtml(r.ffjda_last_name)}`
          : '—';
        const haDob = r.ha_dob ? escapeHtml(r.ha_dob) : '—';
        const ffjdaDob = r.ffjda_dob ? escapeHtml(r.ffjda_dob) : '—';
        const haEmail = r.ha_email ? escapeHtml(r.ha_email) : '—';
        const ffjdaEmail = r.ffjda_email ? escapeHtml(r.ffjda_email) : '—';
        const licence = r.ffjda_licence ? escapeHtml(r.ffjda_licence) : '—';

        return `<tr>
          <td>${haName}</td>
          <td>${ffjdaName}</td>
          <td style="font-size:11px">${haEmail}</td>
          <td style="font-size:11px">${ffjdaEmail}</td>
          <td style="font-size:11px;white-space:nowrap">${haDob}</td>
          <td style="font-size:11px;white-space:nowrap">${ffjdaDob}</td>
          <td style="font-size:11px">${licence}</td>
          <td>${statusBadge}</td>
        </tr>`;
      }).join('');

      const tableHtml = `
        <div class="reconciliation-table-wrap" style="overflow-x:auto;max-height:60vh;overflow-y:auto">
          <table class="audit-table" style="font-size:12px">
            <thead>
              <tr>
                <th>HelloAsso</th>
                <th>FFJDA</th>
                <th>Email HA</th>
                <th>Email FFJDA</th>
                <th>Naiss. HA</th>
                <th>Naiss. FFJDA</th>
                <th>Licence</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      content.innerHTML = statsHtml + tableHtml;

      // Wire edit buttons
      content.querySelectorAll('.ha-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const itemId = btn.dataset.itemId;
          const currentFirst = btn.dataset.first;
          const currentLast = btn.dataset.last;
          openInlineEdit(itemId, currentFirst, currentLast);
        });
      });

    } catch (e) {
      console.error('Reconciliation error:', e);
      content.innerHTML = `<p class="audit-status">Erreur : ${escapeHtml(String(e))}</p>`;
    }
  }

  function getStatusBadge(status) {
    const badges = {
      'matched': '<span style="background:#c8e6c9;color:#1b5e20;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">✅ Match</span>',
      'name_mismatch': '<span style="background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">⚠️ Nom diff.</span>',
      'corrected': '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">✏️ Corrigé</span>',
      'unmatched': '<span style="background:#ffcdd2;color:#b71c1c;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">❌ Non matché</span>',
      'ffjda_only': '<span style="background:#e1bee7;color:#4a148c;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">🆕 FFJDA seul</span>',
    };
    return badges[status] || `<span style="background:#eee;padding:2px 6px;border-radius:3px;font-size:10px">${escapeHtml(status)}</span>`;
  }

  function openInlineEdit(itemId, currentFirst, currentLast) {
    const first = prompt('Prénom (HelloAsso) :', currentFirst);
    if (first === null) return; // cancelled
    const last = prompt('Nom (HelloAsso) :', currentLast);
    if (last === null) return;
    saveNameCorrection(itemId, first.trim(), last.trim());
  }

  // ─────────────────────────────────────────────────────────────────
  // renderHelloAssoSection — main content rendering
  // ─────────────────────────────────────────────────────────────────

  async function renderHelloAssoSection() {
    const contentEl = document.getElementById('helloAssoContent');
    if (!contentEl) return;
    contentEl.innerHTML = '<p class="audit-status">Chargement…</p>';

    try {
      const [lastSync, members] = await Promise.all([
        getLastSyncTime(supabase),
        getHelloAssoMembers(supabase),
      ]);

      const syncInfo = lastSync
        ? `Dernière synchronisation : ${new Date(lastSync).toLocaleString('fr-FR')}`
        : 'Jamais synchronisé';

      // Appliquer le filtre "non saisis"
      const unsaisieOnly = document.getElementById('haUnsaisieOnly')?.checked;
      let filtered = members;
      if (unsaisieOnly) {
        filtered = members.filter(m => !m.raw_data?.saisie_ffjda);
      }

      // Compteur
      const total = members.length;
      const unsaisis = members.filter(m => !m.raw_data?.saisie_ffjda).length;
      const counterEl = document.getElementById('haCounter');
      if (counterEl) {
        counterEl.textContent = `${unsaisis}/${total} à saisir`;
        counterEl.style.color = unsaisis > 0 ? '#c62828' : '#2e7d32';
      }

      let tableHtml = '';
      if (filtered.length === 0) {
        const msg = unsaisieOnly ? '✅ Tous les adhérents sont saisis sur FFJDA !' : 'Aucun membre synchronisé. Cliquez sur Synchroniser.';
        tableHtml = `<p class="audit-status">${msg}</p>`;
      } else {
        const sorted = [...filtered].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr'));

        const byDiscipline = { judo: [], iaido: [], taiso: [] };
        for (const m of sorted) {
          const disc = m.discipline || 'judo';
          if (byDiscipline[disc]) byDiscipline[disc].push(m);
          else byDiscipline.judo.push(m);
        }

        const buildTable = (group, showCategory = false) => {
          if (group.length === 0) return '';
          const rows = group.map(m => {
            const amount = m.membership_amount != null
              ? `${Number(m.membership_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
              : '—';
            const date = m.membership_date ? new Date(m.membership_date).toLocaleDateString('fr-FR') : '—';
            const ffjCat = showCategory ? (getFfjCategory(m.date_of_birth) ?? m.judo_category ?? '—') : null;
            const saisie = m.raw_data?.saisie_ffjda;
            const statusBadge = saisie
              ? '<span style="background:#c8e6c9;color:#1b5e20;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">✓ FFJDA</span>'
              : '<span style="background:#ffcdd2;color:#b71c1c;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">À saisir</span>';
            const nameCell = renderEditableNameCell(
              m.helloasso_id || m.id,
              m.first_name,
              m.last_name
            );
            const catCell = showCategory ? `<td>${escapeHtml(ffjCat)}</td>` : '';
            return `<tr>
              <td>${nameCell}</td>
              ${catCell}
              <td>${escapeHtml(m.email ?? '')}</td>
              <td>${escapeHtml(m.date_of_birth || '')}</td>
              <td>${amount}</td>
              <td>${date}</td>
              <td>${statusBadge}</td>
            </tr>`;
          }).join('');
          const catHeader = showCategory ? '<th>Catégorie</th>' : '';
          return `<div class="audit-table-wrap"><table class="audit-table"><thead><tr>
            <th>Nom</th>${catHeader}<th>Email</th><th>Naissance</th><th>Montant</th><th>Date</th><th>FFJDA</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`;
        };

        tableHtml = `
          <h3>Judo (${byDiscipline.judo.length})</h3>${buildTable(byDiscipline.judo, true)}
          <h3>Iaido (${byDiscipline.iaido.length})</h3>${buildTable(byDiscipline.iaido, false)}
          <h3>Taiso (${byDiscipline.taiso.length})</h3>${buildTable(byDiscipline.taiso, false)}
        `;
      }

      contentEl.innerHTML = `
        <div class="audit-toolbar">
          <span class="audit-status">${escapeHtml(syncInfo)}</span>
          <button id="syncHelloAssoBtn" class="btn-secondary" style="margin-left:0.5rem">Synchroniser</button>
          <label class="btn-secondary" style="cursor:pointer;margin-left:0.5rem" title="Importer un export CSV HelloAsso pour enrichir les dates de naissance">
            CSV HelloAsso
            <input type="file" id="helloAssoCsvInput" accept=".csv" style="display:none">
          </label>
          <label class="btn-secondary" style="cursor:pointer;margin-left:0.5rem;background:#e2b13c;color:#0a0f1c" title="Importer un export CSV FFJDO (liste des licencies) pour marquer les adherents comme saisis">
            CSV FFJDO
            <input type="file" id="ffjdaCsvInput" accept=".csv" style="display:none">
          </label>
          <button id="openReconciliationBtn" class="btn-secondary" style="margin-left:0.5rem;background:#1565c0;color:#fff" title="Voir les ecarts entre HelloAsso et FFJDA">
            Voir les ecarts
          </button>
        </div>
        ${tableHtml}`;

      // Wire sync button
      const syncBtn = document.getElementById('syncHelloAssoBtn');
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = 'Synchronisation…';
          try {
            await syncHelloAssoMembers(supabase);
          } catch (e) {
            console.error('Sync error:', e);
            alert('Erreur lors de la synchronisation : ' + (e.message || e));
          } finally {
            await renderHelloAssoSection();
          }
        };
      }

      // Wire edit buttons
      contentEl.querySelectorAll('.ha-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const itemId = btn.dataset.itemId;
          const currentFirst = btn.dataset.first;
          const currentLast = btn.dataset.last;
          openInlineEdit(itemId, currentFirst, currentLast);
        });
      });

      // Wire CSV inputs
      const csvInput = document.getElementById('helloAssoCsvInput');
      if (csvInput) {
        csvInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const rows = parseHelloAssoCsv(text);
            if (rows.length === 0) { alert('Aucune donnee trouvee dans le CSV.'); return; }
            const withDob = rows.filter((r) => r.date_of_birth);
            if (withDob.length === 0) { alert('Le CSV ne contient pas de colonne "date de naissance".'); return; }
            const { updated, notFound } = await importHelloAssoCsvData(supabase, withDob);
            let msg = `${updated} date(s) de naissance importee(s).`;
            if (notFound.length > 0) msg += `\n${notFound.length} email(s) non trouve(s).`;
            alert(msg);
            await renderHelloAssoSection();
          } catch (err) {
            alert('Erreur import CSV : ' + (err.message || err));
          }
          csvInput.value = '';
        };
      }

      // Wire FFJDA CSV input
      const ffjdaInput = document.getElementById('ffjdaCsvInput');
      if (ffjdaInput) {
        ffjdaInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const result = await importFfjdaCsv(text);
            let msg = `${result.matched}/${result.total} adherents marques comme saisis.`;
            if (result.not_found > 0) msg += `\n${result.not_found} non trouve(s).`;
            alert(msg);
            await renderHelloAssoSection();
          } catch (err) {
            const msg = err?.message || err?.detail || (typeof err === 'object' ? JSON.stringify(err) : String(err));
            alert('Erreur import FFJDA : ' + msg);
          }
          ffjdaInput.value = '';
        };
      }

      // Wire reconciliation button
      const reconBtn = document.getElementById('openReconciliationBtn');
      if (reconBtn) {
        reconBtn.onclick = () => openReconciliationView();
      }

    } catch (e) {
      console.error('renderHelloAssoSection error:', e);
      contentEl.innerHTML = `<p class="audit-status">Erreur : ${escapeHtml(String(e))}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // openHelloAssoModal
  // ─────────────────────────────────────────────────────────────────

  async function loadHaCampaigns() {
    const sel = document.getElementById('haCampaignSelect');
    if (!sel) return;
    try {
      const token = localStorage.getItem('jcc_api_token');
      if (!token) { sel.innerHTML = '<option value="">Token non configure</option>'; return; }
      const r = await fetch('https://sync.judo-cattenom.fr/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!r.ok) { sel.innerHTML = '<option value="">Erreur API</option>'; return; }
      const data = await r.json();
      const campaigns = (data.campaigns || []).filter(
        c => (c.type || 'Membership') === 'Membership' && c.slug.includes('adhesion')
      );
      sel.innerHTML = '';
      for (const c of campaigns) {
        const opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.slug.replace(/^adhesion-(\d{4})-(\d{4})-sport$/, 'Saison $1/$2');
        if (c.slug === data.current) opt.selected = true;
        sel.appendChild(opt);
      }
    } catch (e) {
      sel.innerHTML = '<option value="">Erreur: ' + escapeHtml(e.message) + '</option>';
    }
  }

  async function openHelloAssoModal() {
    const modal = document.getElementById('helloAssoModal');
    if (!modal) return;
    modal.classList.add('active');

    // Load campaigns
    await loadHaCampaigns();

    // Campaign selector: re-sync on change
    const sel = document.getElementById('haCampaignSelect');
    if (sel) {
      sel.onchange = async () => {
        const slug = sel.value;
        if (!slug) return;
        try {
          const token = localStorage.getItem('jcc_api_token');
          await fetch('https://sync.judo-cattenom.fr/campaigns/current', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ form_slug: slug }),
          });
        } catch (e) { /* ignore */ }
        await renderHelloAssoSection();
      };
    }

    // Unsaisie filter: re-render on toggle
    const filterChk = document.getElementById('haUnsaisieOnly');
    if (filterChk) {
      filterChk.onchange = async () => {
        await renderHelloAssoSection();
      };
    }

    await renderHelloAssoSection();
    initApiConfigUI();
  }

  // ─────────────────────────────────────────────────────────────────
  // API Config UI
  // ─────────────────────────────────────────────────────────────────

  function initApiConfigUI() {
    const configBtn = document.getElementById('helloAssoConfigBtn');
    const configPanel = document.getElementById('helloAssoConfig');
    const tokenInput = document.getElementById('helloAssoTokenInput');
    const saveBtn = document.getElementById('helloAssoTokenSave');
    const testBtn = document.getElementById('helloAssoTokenTest');
    const statusEl = document.getElementById('helloAssoTokenStatus');

    if (!configBtn || !configPanel) return;

    configBtn.addEventListener('click', () => {
      const isHidden = configPanel.style.display === 'none';
      configPanel.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        const token = localStorage.getItem('jcc_api_token') || '';
        tokenInput.value = token;
      }
    });

    saveBtn?.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (token) {
        localStorage.setItem('jcc_api_token', token);
        showStatus(statusEl, 'Token enregistre', 'success');
      } else {
        localStorage.removeItem('jcc_api_token');
        showStatus(statusEl, 'Token supprime', 'info');
      }
    });

    testBtn?.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        showStatus(statusEl, 'Aucun token a tester', 'warning');
        return;
      }
      showStatus(statusEl, 'Test en cours...', 'info');
      try {
        const resp = await fetch('https://sync.judo-cattenom.fr/stats', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          showStatus(statusEl, `Connexion OK — ${data.paid || '?'} adherents`, 'success');
        } else {
          showStatus(statusEl, `Erreur ${resp.status}: ${resp.statusText}`, 'error');
        }
      } catch (err) {
        showStatus(statusEl, `Erreur reseau: ${err.message}`, 'error');
      }
    });
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
    el.style.color = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8';
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  return {
    renderHelloAssoSection,
    openHelloAssoModal,
    openReconciliationView,
  };
}
