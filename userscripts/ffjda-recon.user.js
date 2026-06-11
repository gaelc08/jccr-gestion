// ==UserScript==
// @name         FFJDA Recon — Capture debug data
// @namespace    https://github.com/gaelc08/jccattenom-app
// @version      1.0.0
// @description  Capture les données debugbar CI4 + structure formulaires sur moncompte.ffjudo.com
// @author       Gaël CANTARERO
// @match        https://moncompte.ffjudo.com/*
// @match        https://api.ffjudo.com/*
// @grant        GM_download
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const RECON_DATA = {
    timestamp: new Date().toISOString(),
    pages: [],
    routes: new Set(),
    sqlQueries: new Set(),
    formFields: {},
    cookies: document.cookie,
    localStorage: JSON.stringify(Object.keys(localStorage)),
  };

  // ─── Style du panneau flottant ───
  const style = document.createElement('style');
  style.textContent = `
    #recon-panel {
      position: fixed; top: 10px; right: 10px; z-index: 99999;
      background: #1a1a2e; color: #eee; border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5); font-family: monospace;
      font-size: 12px; width: 350px; max-height: 80vh; overflow: hidden;
      border: 1px solid #333;
    }
    #recon-header {
      background: #16213e; padding: 8px 12px; display: flex;
      align-items: center; justify-content: space-between; cursor: pointer;
    }
    #recon-header span { font-weight: 700; font-size: 13px; }
    #recon-header .badge { background: #0f3460; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
    #recon-body { padding: 10px 12px; max-height: 60vh; overflow-y: auto; }
    #recon-log { white-space: pre-wrap; word-break: break-all; line-height: 1.6; }
    .recon-btn {
      width: 100%; border: none; border-radius: 6px; padding: 8px; margin-top: 6px;
      font-size: 12px; font-weight: 600; cursor: pointer; font-family: monospace;
    }
    #recon-export { background: #0f3460; color: #e94560; }
    #recon-export:hover { background: #1a4a8e; }
    #recon-clipboard { background: #333; color: #0f0; }
    #recon-clipboard:hover { background: #444; }
    .recon-ok { color: #0f0; } .recon-warn { color: #ff0; } .recon-err { color: #f00; }
    .recon-info { color: #6cf; }
  `;
  document.head.appendChild(style);

  // ─── Panneau UI ───
  const panel = document.createElement('div');
  panel.id = 'recon-panel';
  panel.innerHTML = `
    <div id="recon-header">
      <span>🔍 FFJDA Recon</span>
      <span class="badge">ACTIVE</span>
    </div>
    <div id="recon-body">
      <div id="recon-log">En attente…</div>
      <button class="recon-btn" id="recon-export">💾 Exporter JSON</button>
      <button class="recon-btn" id="recon-clipboard">📋 Copier dans le clipboard</button>
    </div>
  `;
  document.body.appendChild(panel);

  const log = document.getElementById('recon-log');
  let logLines = [];
  const MAX_LOGS = 300;

  function appendLog(msg, cls = '') {
    // Déduplication : ne pas log 2x le même message consécutif
    if (logLines.length > 0 && logLines[logLines.length - 1].msg === msg) return;
    logLines.push({ msg, cls });
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    log.appendChild(line);
    // Limiter le nombre de lignes pour éviter la saturation
    while (log.children.length > MAX_LOGS) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  // Toggle panel
  document.getElementById('recon-header').addEventListener('click', () => {
    const body = document.getElementById('recon-body');
    body.style.display = body.style.display === 'none' ? '' : 'none';
  });

  // ─── Interception XHR pour capturer les debugbar dumps ───
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._reconUrl = url;
    this._reconMethod = method;
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this._reconUrl || '';
        const method = this._reconMethod || 'GET';

        // Capturer le header Debugbar-Time
        const debugbarTime = this.getResponseHeader('Debugbar-Time');
        if (debugbarTime) {
          appendLog(`🔧 Debugbar-Time: ${debugbarTime}`, 'recon-info');
          fetchDebugbarDump(debugbarTime);
        }

        // Tracker les routes API
        if (url.includes('api.ffjudo.com') || url.includes('index.php')) {
          RECON_DATA.routes.add(`${method} ${url}`);
          appendLog(`📡 ${method} ${url.split('?')[0]}`, 'recon-info');
        }

        // Capturer les réponses JSON
        const ct = this.getResponseHeader('content-type') || '';
        if (ct.includes('json') && this.responseText) {
          try {
            const json = JSON.parse(this.responseText);
            RECON_DATA.pages.push({
              url: location.href,
              endpoint: url,
              response: json,
            });
          } catch (e) { /* pas du JSON valide */ }
        }
      } catch (e) { /* ignore */ }
    });
    return _origSend.apply(this, arguments);
  };

  // ─── Fetch le dump debugbar complet ───
  function fetchDebugbarDump(timestamp) {
    const url = `https://api.ffjudo.com/index.php?debugbar_time=${timestamp}`;
    fetch(url)
      .then(r => r.text())
      .then(html => {
        // Extraire les infos du dump HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Routes
        doc.querySelectorAll('[data-debugbar-route]').forEach(el => {
          const route = el.textContent.trim();
          if (route) {
            RECON_DATA.routes.add(route);
            appendLog(`🛤 Route: ${route}`, 'recon-ok');
          }
        });

        // Requêtes SQL
        doc.querySelectorAll('table tbody tr').forEach(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 2) {
            const label = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();
            if (label.toLowerCase().includes('sql') || label.toLowerCase().includes('query') || value.toLowerCase().includes('select')) {
              RECON_DATA.sqlQueries.add(value);
              appendLog(`🗃 SQL: ${value.substring(0, 120)}…`, 'recon-warn');
            }
          }
        });

        // Variables / config exposées
        doc.querySelectorAll('dt').forEach(dt => {
          const key = dt.textContent.trim();
          if (/password|secret|key|token|app_key|encryption/i.test(key)) {
            appendLog(`🔑 Sensible: ${key}`, 'recon-err');
          }
        });

        // Views / fichiers chargés
        const views = [];
        html.match(/APPPATH\/Views[^\s<"]+/g)?.forEach(v => views.push(v));
        if (views.length) {
          views.forEach(v => appendLog(`📄 Vue: ${v}`, 'recon-info'));
        }

      })
      .catch(err => appendLog(`❌ Erreur debugbar: ${err.message}`, 'recon-err'));
  }

  // ─── Scan du DOM pour les formulaires ───
  function scanForms() {
    const forms = document.querySelectorAll('form');
    if (forms.length === 0) {
      appendLog('📝 Aucun formulaire détecté sur cette page', 'recon-warn');
      return;
    }

    appendLog(`📝 ${forms.length} formulaire(s) trouvé(s)`, 'recon-ok');

    forms.forEach((form, i) => {
      const pageInfo = location.pathname + (location.search || '');
      const fields = [];

      form.querySelectorAll('input, select, textarea').forEach(el => {
        fields.push({
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          name: el.name || '',
          id: el.id || '',
          placeholder: el.placeholder || '',
          required: el.required,
          className: el.className || '',
          labels: Array.from(document.querySelectorAll(`label[for="${el.id}"]`)).map(l => l.textContent.trim()),
          options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value: o.value, text: o.text })) : undefined,
        });
      });

      RECON_DATA.formFields[pageInfo] = RECON_DATA.formFields[pageInfo] || [];
      RECON_DATA.formFields[pageInfo].push({
        formIndex: i,
        action: form.action || '',
        method: form.method || 'GET',
        id: form.id || '',
        fields: fields,
      });

      appendLog(`  → Form ${i}: ${fields.length} champs (action: ${form.action || '∅'})`, 'recon-ok');
      fields.forEach(f => {
        if (f.name) appendLog(`    ${f.tag}[name="${f.name}"] type=${f.type}`, '');
      });
    });
  }

  // ─── Scan des variables JS globales ───
  function scanGlobals() {
    const interesting = ['base_url', 'site_url', 'api_url', 'csrf', 'token', 'config', 'routes'];
    interesting.forEach(key => {
      if (window[key]) {
        try {
          const val = typeof window[key] === 'object' ? JSON.stringify(window[key]).substring(0, 200) : String(window[key]).substring(0, 100);
          appendLog(`🌐 window.${key} = ${val}`, 'recon-info');
        } catch (e) { /* ignore */ }
      }
    });

    // Chercher aussi les variables globales courantes
    if (typeof base_url !== 'undefined' && base_url) {
      appendLog(`🌐 base_url = ${base_url}`, 'recon-info');
    }
  }

  // ─── Init ───
  function init() {
    appendLog(`📍 Page: ${location.pathname}`, 'recon-ok');
    scanForms();
    scanGlobals();

    // Tenter de charger le debugbar initial
    const loader = document.getElementById('debugbar_loader');
    if (loader) {
      const time = loader.getAttribute('data-time');
      if (time) {
        appendLog(`⏱ Debugbar initiale: ${time}`, 'recon-info');
        fetchDebugbarDump(time);
      }
    }
  }

  // ─── Export ───
  function exportData() {
    // Convertir les Sets en Arrays pour la sérialisation
    const exportObj = {
      ...RECON_DATA,
      routes: Array.from(RECON_DATA.routes),
      sqlQueries: Array.from(RECON_DATA.sqlQueries),
    };
    return JSON.stringify(exportObj, null, 2);
  }

  document.getElementById('recon-export').addEventListener('click', () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ffjda-recon-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog('💾 Export téléchargé !', 'recon-ok');
  });

  document.getElementById('recon-clipboard').addEventListener('click', () => {
    const json = exportData();

    // Méthode 1 : navigator.clipboard (moderne, nécessite focus)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(json).then(() => {
        appendLog('📋 Copié dans le clipboard !', 'recon-ok');
      }).catch(() => fallbackCopy(json));
    } else {
      fallbackCopy(json);
    }

    function fallbackCopy(text) {
      // Méthode 2 : textarea + execCommand (fonctionne partout)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        const ok = document.execCommand('copy');
        appendLog(ok ? '📋 Copié (fallback) !' : '❌ execCommand a échoué', ok ? 'recon-ok' : 'recon-err');
      } catch (e) {
        appendLog('❌ Clipboard non disponible : ' + e.message, 'recon-err');
      }
      document.body.removeChild(ta);
    }
  });

  // Observer les changements de page (SPA possible)
  // IMPORTANT : exclure notre propre panneau pour éviter la boucle infinie
  let _scanTimer = null;
  const reconPanel = document.getElementById('recon-panel');
  const observer = new MutationObserver((mutations) => {
    // Ignorer les mutations qui viennent uniquement de notre panneau
    const external = mutations.some(m => !reconPanel.contains(m.target));
    if (!external) return;
    clearTimeout(_scanTimer);
    _scanTimer = setTimeout(scanForms, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Lancer le scan initial
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
