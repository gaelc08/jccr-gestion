// helloasso-ui.js — HelloAsso UI module
// Extracted from app-modular.js (main branch)

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
  // buildMemberTable
  // ─────────────────────────────────────────────────────────────────

  function buildMemberTable(group, showCategory = false) {
    if (group.length === 0) return '<p class="audit-status">Aucun adhérent.</p>';
    const rows = group.map((m) => {
      const amount = m.membership_amount != null
        ? `${Number(m.membership_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
        : '—';
      const date = m.membership_date ? new Date(m.membership_date).toLocaleDateString('fr-FR') : '—';
      const ffjCategory = showCategory ? getFfjCategory(m.date_of_birth) : null;
      const categoryCell = showCategory ? `<td>${escapeHtml(ffjCategory ?? m.judo_category ?? '—')}</td>` : '';
      const dob = m.date_of_birth ? escapeHtml(m.date_of_birth) : '—';
      return `<tr>
        <td>${escapeHtml(m.first_name ?? '')}</td>
        <td>${escapeHtml(m.last_name ?? '')}</td>
        <td>${escapeHtml(m.email ?? '')}</td>
        ${categoryCell}
        <td>${dob}</td>
        <td>${amount}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');
    const categoryHeader = showCategory ? '<th>Catégorie</th>' : '';
    return `
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead><tr>
            <th>Prénom</th><th>Nom</th><th>Email</th>
            ${categoryHeader}
            <th>Naissance</th><th>Montant (€)</th><th>Date adhésion</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // renderHelloAssoSection
  // ─────────────────────────────────────────────────────────────────

  async function renderHelloAssoSection() {
    const contentEl = document.getElementById('helloAssoContent');
    if (!contentEl) return;
    contentEl.innerHTML = '<p>Chargement…</p>';

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

        const ffjOrder = ['Baby Judo', 'Mini-Poussin', 'Poussin', 'Benjamin', 'Minime', 'Cadet', 'Junior', 'Senior', 'Vétéran'];
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
            return `<tr>
              <td>${escapeHtml(m.first_name ?? '')}</td>
              <td>${escapeHtml(m.last_name ?? '')}</td>
              <td>${escapeHtml(m.email ?? '')}</td>
              ${showCategory ? `<td>${escapeHtml(ffjCat)}</td>` : ''}
              <td>${escapeHtml(m.date_of_birth || '')}</td>
              <td>${amount}</td>
              <td>${statusBadge}</td>
            </tr>`;
          }).join('');
          const catHeader = showCategory ? '<th>Catégorie</th>' : '';
          return `<div class="audit-table-wrap"><table class="audit-table"><thead><tr>
            <th>Prénom</th><th>Nom</th><th>Email</th>
            ${catHeader}<th>Naissance</th><th>Montant</th><th>FFJDA</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`;
        };

        tableHtml = `
          <h3>🥋 Judo (${byDiscipline.judo.length})</h3>${buildTable(byDiscipline.judo, true)}
          <h3>🗡️ Iaïdo (${byDiscipline.iaido.length})</h3>${buildTable(byDiscipline.iaido, false)}
          <h3>🤸 Taïso (${byDiscipline.taiso.length})</h3>${buildTable(byDiscipline.taiso, false)}
        `;
      }

      contentEl.innerHTML = `
        <div class="audit-toolbar">
          <span class="audit-status">${escapeHtml(syncInfo)}</span>
          <button id="syncHelloAssoBtn" class="btn-secondary">🔄 Synchroniser</button>
          <label class="btn-secondary" style="cursor:pointer;margin-left:0.5rem" title="Importer un export CSV HelloAsso pour enrichir les dates de naissance">
            📂 Importer CSV
            <input type="file" id="helloAssoCsvInput" accept=".csv" style="display:none">
          </label>
        </div>
        ${tableHtml}`;

      // Sync button
      const syncBtn = document.getElementById('syncHelloAssoBtn');
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = '⏳ Synchronisation…';
          try {
            const result = await syncHelloAssoMembers(supabase);
            console.log('DEBUG sync-helloasso result:', result);
          } catch (e) {
            console.error('DEBUG sync-helloasso error:', e);
            alert(`Erreur lors de la synchronisation : ${e.message || e}`);
          } finally {
            await renderHelloAssoSection();
          }
        };
      }

      // CSV import
      const csvInput = document.getElementById('helloAssoCsvInput');
      if (csvInput) {
        csvInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const rows = parseHelloAssoCsv(text);
            if (rows.length === 0) { alert('Aucune donnée trouvée dans le CSV. Vérifiez le format du fichier.'); return; }
            const withDob = rows.filter((r) => r.date_of_birth);
            if (withDob.length === 0) { alert('Le CSV ne contient pas de colonne "date de naissance". Vérifiez les colonnes exportées depuis HelloAsso.'); return; }
            const { updated, notFound } = await importHelloAssoCsvData(supabase, withDob);
            let msg = `✅ ${updated} date(s) de naissance importée(s).`;
            if (notFound.length > 0) msg += `\n⚠️ ${notFound.length} email(s) non trouvé(s) dans la base.`;
            alert(msg);
            await renderHelloAssoSection();
          } catch (err) {
            alert(`Erreur lors de l'import CSV : ${err.message || err}`);
          }
          csvInput.value = '';
        };
      }
    } catch (e) {
      console.error('DEBUG renderHelloAssoSection error:', e);
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
      if (!token) { sel.innerHTML = '<option value="">Token non configuré</option>'; return; }
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

    // Toggle panel
    configBtn.addEventListener('click', () => {
      const isHidden = configPanel.style.display === 'none';
      configPanel.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        // Load current token
        const token = localStorage.getItem('jcc_api_token') || '';
        tokenInput.value = token;
      }
    });

    // Save token
    saveBtn?.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (token) {
        localStorage.setItem('jcc_api_token', token);
        showStatus(statusEl, '✅ Token enregistré', 'success');
      } else {
        localStorage.removeItem('jcc_api_token');
        showStatus(statusEl, '🗑️ Token supprimé', 'info');
      }
    });

    // Test connection
    testBtn?.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) {
        showStatus(statusEl, '⚠️ Aucun token à tester', 'warning');
        return;
      }

      showStatus(statusEl, '🔄 Test en cours...', 'info');

      try {
        const resp = await fetch('https://sync.judo-cattenom.fr/stats', {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (resp.ok) {
          const data = await resp.json();
          showStatus(statusEl, `✅ Connexion OK — ${data.paid || '?'} adhérents`, 'success');
        } else {
          showStatus(statusEl, `❌ Erreur ${resp.status}: ${resp.statusText}`, 'error');
        }
      } catch (err) {
        showStatus(statusEl, `❌ Erreur réseau: ${err.message}`, 'error');
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
  };
}
