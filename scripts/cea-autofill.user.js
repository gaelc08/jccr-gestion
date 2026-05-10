// ==UserScript==
// @name         JCC Cattenom → CEA URSSAF Autofill
// @namespace    https://github.com/gaelc08/jccattenom-app
// @version      1.0.0
// @description  Lit la synthèse du mois depuis l'app JCC Cattenom et pré-remplit les champs de saisie du portail CEA URSSAF
// @author       Gaël CANTARERO
// @match        https://www.cea.urssaf.fr/*
// @match        https://cea.urssaf.fr/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'jcc_cea_payload';

  // ─── STYLES ───────────────────────────────────────────────────────────────
  GM_addStyle(`
    #jcc-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: #1c2b3a;
      color: #e8f0f7;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      min-width: 280px;
      max-width: 340px;
      overflow: hidden;
    }
    #jcc-panel-header {
      background: #0d3b5e;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
    }
    #jcc-panel-header span { font-weight: 600; font-size: 14px; }
    #jcc-panel-body { padding: 12px 14px; }
    #jcc-panel table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    #jcc-panel td { padding: 3px 0; }
    #jcc-panel td:first-child { color: #8bacc8; width: 60%; }
    #jcc-panel td:last-child { text-align: right; font-weight: 500; }
    #jcc-fill-btn, #jcc-import-btn {
      width: 100%;
      border: none;
      border-radius: 7px;
      padding: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-bottom: 6px;
    }
    #jcc-fill-btn { background: #1a6fa8; color: white; }
    #jcc-fill-btn:hover { background: #1e84c8; }
    #jcc-fill-btn:disabled { background: #555; cursor: default; }
    #jcc-import-btn { background: #2d4a3e; color: #7ec8a0; }
    #jcc-import-btn:hover { background: #3a5e4f; }
    #jcc-status { margin-top: 6px; font-size: 11px; color: #7ec8a0; min-height: 16px; text-align: center; }
    #jcc-status.error { color: #f08080; }
    .jcc-badge { background: #e67e22; color: white; border-radius: 9999px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
  `);

  // ─── PAYLOAD ──────────────────────────────────────────────────────────────
  let payload = null;

  function loadPayload() {
    try {
      const raw = GM_getValue(STORAGE_KEY, null);
      if (raw) payload = JSON.parse(raw);
    } catch (e) { payload = null; }
  }

  function savePayload(data) {
    payload = data;
    GM_setValue(STORAGE_KEY, JSON.stringify(data));
  }

  // ─── UI PANEL ─────────────────────────────────────────────────────────────
  function buildPanel() {
    loadPayload();

    const panel = document.createElement('div');
    panel.id = 'jcc-panel';

    const header = document.createElement('div');
    header.id = 'jcc-panel-header';
    header.innerHTML = `<span>\uD83E\uDD4B JCC Cattenom \u2192 CEA</span><span class="jcc-badge">AUTO</span>`;

    const body = document.createElement('div');
    body.id = 'jcc-panel-body';

    const importBtn = document.createElement('button');
    importBtn.id = 'jcc-import-btn';
    importBtn.textContent = '\uD83D\uDCCB Coller les données depuis l\'app';

    const table = document.createElement('table');
    table.id = 'jcc-data-table';

    const fillBtn = document.createElement('button');
    fillBtn.id = 'jcc-fill-btn';
    fillBtn.textContent = '\u25B6 Remplir les champs CEA';

    const status = document.createElement('div');
    status.id = 'jcc-status';

    body.appendChild(importBtn);
    body.appendChild(table);
    body.appendChild(fillBtn);
    body.appendChild(status);
    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // Toggle panel
    header.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });

    // Import clipboard
    importBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);
        if (data.salaireBrut == null && data.heures == null) throw new Error('Format invalide');
        savePayload(data);
        renderTable();
        setStatus('\u2705 Données importées !');
      } catch (e) {
        setStatus('\u274C Clipboard invalide. Utilisez "Copier pour CEA" dans l\'app.', true);
      }
    });

    // Remplissage
    fillBtn.addEventListener('click', () => {
      if (!payload) { setStatus('\u26A0 Importez d\'abord les données depuis l\'app.', true); return; }
      const filled = fillCEAFields(payload);
      setStatus(filled > 0 ? `\u2705 ${filled} champ(s) rempli(s)` : '\u26A0 Aucun champ trouvé sur cette page.');
    });

    renderTable();
  }

  function renderTable() {
    const table = document.getElementById('jcc-data-table');
    if (!table) return;
    table.innerHTML = '';
    if (!payload) {
      table.innerHTML = '<tr><td colspan="2" style="color:#8bacc8;font-style:italic;text-align:center;padding:8px">Aucune donnée chargée</td></tr>';
      return;
    }
    const fmt = v => (v != null ? v : '\u2014');
    [
      ['Coach',               fmt(payload.nomCoach)],
      ['Mois',                fmt(payload.mois)],
      ['Heures travaillées',  payload.heures != null ? `${payload.heures} h` : '\u2014'],
      ['Taux horaire',        payload.tauxHoraire != null ? `${payload.tauxHoraire} \u20AC` : '\u2014'],
      ['Salaire formation',   payload.salaireFormation != null ? `${payload.salaireFormation} \u20AC` : '\u2014'],
      ['Jours compétition',   payload.joursComp != null ? `${payload.joursComp} j` : '\u2014'],
      ['Salaire compét.',     payload.salaireComp != null ? `${payload.salaireComp} \u20AC` : '\u2014'],
      ['Total brut URSSAF',   payload.salaireBrut != null ? `${payload.salaireBrut} \u20AC` : '\u2014'],
    ].forEach(([label, val]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${val}</td>`;
      table.appendChild(tr);
    });
  }

  function setStatus(msg, isError = false) {
    const s = document.getElementById('jcc-status');
    if (!s) return;
    s.textContent = msg;
    s.className = isError ? 'error' : '';
    setTimeout(() => { if (s) s.textContent = ''; }, 4000);
  }

  // ─── REMPLISSAGE CEA ──────────────────────────────────────────────────────
  // Sélecteurs basés sur l'inspection du portail CEA.
  // Si un champ n'est pas rempli, inspecte son name/id dans DevTools et ajuste ici.
  function fillCEAFields(data) {
    let filled = 0;

    const tryFill = (selector, value) => {
      if (value == null) return;
      const el = document.querySelector(selector);
      if (!el) return;
      el.value = String(value).replace('.', ',');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    };

    const tryFillByLabel = (labelText, value) => {
      if (value == null) return;
      for (const el of document.querySelectorAll('label, th, td, span')) {
        if (el.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
          const input =
            el.nextElementSibling?.querySelector?.('input') ||
            el.closest('tr')?.querySelector('input') ||
            el.closest('td')?.nextElementSibling?.querySelector('input');
          if (input) {
            input.value = String(value).replace('.', ',');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            return;
          }
        }
      }
    };

    // Salaire brut (champ principal déclaration CEA)
    tryFill('input[name="salairebrut"]',        data.salaireBrut);
    tryFill('input[id*="salairebrut"]',          data.salaireBrut);
    tryFill('input[id*="salaireBrut"]',          data.salaireBrut);
    tryFill('input[id*="remunerationBrute"]',    data.salaireBrut);

    // Heures travaillées
    tryFill('input[name="nbheures"]',            data.heures);
    tryFill('input[id*="nbHeures"]',             data.heures);
    tryFill('input[id*="heures"]',               data.heures);

    // Taux horaire
    tryFill('input[name="tauxhoraire"]',         data.tauxHoraire);
    tryFill('input[id*="tauxHoraire"]',          data.tauxHoraire);

    // Fallback label
    tryFillByLabel('salaire brut',               data.salaireBrut);
    tryFillByLabel('nombre d\'heures',           data.heures);
    tryFillByLabel('heures travaillées',         data.heures);
    tryFillByLabel('taux horaire',               data.tauxHoraire);

    return filled;
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }

})();
