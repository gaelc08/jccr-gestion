// popup.js — v2026.06.11-04 (séparation Judo/Iaïdo + API HelloAsso)
const Api = window.JccApi;

// Tous les adhérents (106 HelloAsso)
let adherents = [];
// Index originaux sélectionnés (Set<number>)
let selected  = new Set();
let currentMode = 'nouvelle';
// Filtre discipline : 'judo' | 'iaido' | 'all'
// Par défaut : 'judo' — Iaïdo est un club distinct côté fédé
let currentFilter = 'judo';

const list    = document.getElementById('adherent-list');
const btnFill = document.getElementById('btn-fill');
const btnLoad = document.getElementById('btn-load');
const btnAll  = document.getElementById('btn-all');
const btnNone = document.getElementById('btn-none');
const counter = document.getElementById('counter');
const status  = document.getElementById('status');
const progressWrap = document.querySelector('.progress-wrap');
const progressFill = document.querySelector('.progress-fill');
const progressCurrent = document.querySelector('.progress-current');
const selDiscipline = document.getElementById('sel-discipline');
const countJudo = document.getElementById('count-judo');
const countIaido = document.getElementById('count-iaido');
const countAll = document.getElementById('count-all');
const apiNotice = document.getElementById('api-notice');

// --- Filtre discipline ---
function isIaido(a) {
  // pratique=13 OU tier contenant "iaïdo"/"iaido"/"cercle"
  const tier = (a.tier || '').toLowerCase();
  return a.pratique === '13' || tier.includes('iaido') || tier.includes('iaïdo') || tier.includes('cercle');
}

function getFiltered() {
  // Retourne les items avec leur index original dans `adherents`
  return adherents.map((a, idx) => ({ a, idx })).filter(({ a }) => {
    if (currentFilter === 'iaido') return isIaido(a);
    if (currentFilter === 'judo')  return !isIaido(a);
    return true;
  });
}

function updateDisciplineCounts() {
  const nJudo  = adherents.filter(a => !isIaido(a)).length;
  const nIaido = adherents.filter(a => isIaido(a)).length;
  countJudo.textContent  = nJudo;
  countIaido.textContent = nIaido;
  countAll.textContent   = adherents.length;
}

selDiscipline.addEventListener('change', () => {
  currentFilter = selDiscipline.value;
  chrome.storage.local.set({ disciplineFilter: currentFilter });
  // Nettoyer la sélection des items qui ne sont plus visibles
  const visible = new Set(getFiltered().map(f => f.idx));
  selected = new Set([...selected].filter(i => visible.has(i)));
  renderList();
});

// Restaurer le filtre précédent
chrome.storage.local.get(['disciplineFilter'], r => {
  if (r.disciplineFilter && ['judo', 'iaido', 'all'].includes(r.disciplineFilter)) {
    currentFilter = r.disciplineFilter;
    selDiscipline.value = currentFilter;
  }
});

// --- Onglets ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.tab;
    selected.clear();
    renderList();
    btnFill.textContent = currentMode === 'renouvellement'
      ? '▶ Lancer le renouvellement'
      : '▶ Lancer la saisie';
    status.className = 'status hidden';
  });
});

// --- Import HelloAsso XLSX ---
document.getElementById('btn-import-helloasso').addEventListener('click', () => {
  window.location.href = 'import.html';
});

// --- Paramètres API ---
const btnSettings = document.getElementById('btn-settings');
const apiWarning  = document.getElementById('api-warning');
const linkConfig  = document.getElementById('link-config');

btnSettings.addEventListener('click', () => {
  window.location.href = 'settings.html';
});
linkConfig.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = 'settings.html';
});

async function checkApiToken() {
  const hasToken = await Api.hasApiToken();
  if (!hasToken) {
    apiWarning.classList.remove('hidden');
    return false;
  }
  apiWarning.classList.add('hidden');
  return true;
}

// --- Sync HelloAsso (via API) ---
const btnSync = document.getElementById('btn-sync');
btnSync.addEventListener('click', async () => {
  if (!(await checkApiToken())) {
    showStatus('Token API non configuré.', 'error');
    return;
  }
  btnSync.disabled = true;
  btnSync.textContent = '…';
  showStatus('🔄 Synchronisation HelloAsso en cours...', 'info');

  const syncResult = await Api.triggerSync();
  if (!syncResult.ok) {
    showStatus(`❌ Sync échoué : ${syncResult.data.detail || 'erreur'}`, 'error');
    btnSync.disabled = false;
    btnSync.textContent = '🔄';
    return;
  }

  showStatus(`✅ ${syncResult.data.paid} adhérent(s) synchronisé(s).`, 'success');

  // Re-charger depuis l'API
  const adhResult = await Api.getAdherents();
  if (adhResult.ok) {
    adherents = adhResult.data.adherents;
    // Mirroiter dans chrome.storage.local (fallback offline)
    chrome.storage.local.set({ adherents });
    selected.clear();
    renderList();
  }

  btnSync.disabled = false;
  btnSync.textContent = '🔄';
});

function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}

function updateCounter() {
  const n = selected.size;
  counter.textContent = `${n} sélectionné(s)`;
  btnFill.disabled = n === 0;
}

function renderList() {
  list.innerHTML = '';
  const filtered = getFiltered();
  updateDisciplineCounts();
  updateCounter();

  if (adherents.length === 0) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#999;font-size:12px">Aucun adhérent — cliquer 🔄 (sync) ou 📥 (import XLSX)</div>';
    return;
  }
  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#999;font-size:12px">Aucun adhérent dans cette discipline.</div>';
    return;
  }
  filtered.forEach(({ a, idx }) => {
    const item = document.createElement('label');
    const isSaisie = !!a.saisie_ffjda;
    item.className = 'adherent-item' + (selected.has(idx) ? ' checked' : '') + (isSaisie ? ' saisie' : '');
    const sexeWarn = !a.sexe ? ' ⚠' : '';
    const saisieBadge = isSaisie ? '<span class="saisie-badge">✓ Saisie</span>' : '';
    const tierBadge = isIaido(a) ? '<span class="tier-badge iaido">⚔️</span>' : '';
    item.innerHTML = `
      <input type="checkbox" data-origidx="${idx}" ${selected.has(idx) ? 'checked' : ''}>
      <span class="name">${a.nom} ${a.prenom}${sexeWarn}${tierBadge}${saisieBadge}</span>
      <span class="ddn">${a.date_naissance || ''}</span>
    `;
    item.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) { selected.add(idx);     item.classList.add('checked'); }
      else                  { selected.delete(idx);  item.classList.remove('checked'); }
      updateCounter();
    });
    list.appendChild(item);
  });
}

btnAll.addEventListener('click',  () => { getFiltered().forEach(({ idx }) => selected.add(idx));  renderList(); });
btnNone.addEventListener('click', () => { selected.clear(); renderList(); });

// Sync statut + progression depuis le background
function syncStatus() {
  chrome.storage.session.get(['flowStatus', 'queueProgress'], r => {
    if (r.flowStatus) showStatus(r.flowStatus.msg, r.flowStatus.type);
    if (r.queueProgress) {
      const { current, total } = r.queueProgress;
      if (total > 0) {
        const pct = Math.round((current / total) * 100);
        progressWrap.classList.add('visible');
        progressFill.style.width = pct + '%';
        progressCurrent.textContent = `${current}/${total}`;
      }
    }
  });
}
setInterval(syncStatus, 800);
syncStatus();

btnFill.addEventListener('click', async () => {
  if (selected.size === 0) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('moncompte.ffjudo.com')) {
    showStatus("Ouvrez d'abord moncompte.ffjudo.com.", 'error');
    return;
  }
  const queue = [...selected].sort((a, b) => a - b).map(i => adherents[i]);
  showStatus(`Lancement de ${queue.length} ${currentMode === 'renouvellement' ? 'renouvellement(s)' : 'saisie(s)'}...`, 'info');
  progressWrap.classList.add('visible');
  progressFill.style.width = '0%';
  progressCurrent.textContent = `0/${queue.length}`;
  chrome.runtime.sendMessage({
    action: currentMode === 'renouvellement' ? 'startRenewalQueue' : 'startQueue',
    tabId: tab.id,
    tabUrl: tab.url,
    queue
  });
});

btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], result => {
    if (result.adherents?.length > 0) {
      adherents = result.adherents;
      renderList();
      showStatus(`${adherents.length} adhérent(s) rechargé(s).`, 'success');
    } else {
      showStatus("Aucune donnée. Utilisez 📥 HelloAsso.", 'error');
    }
  });
});

// Chargement auto : priorité API, fallback chrome.storage.local
(async () => {
  const hasToken = await checkApiToken();
  if (hasToken) {
    const result = await Api.getAdherents();
    if (result.ok && result.data.adherents.length > 0) {
      adherents = result.data.adherents;
      chrome.storage.local.set({ adherents });
      renderList();
      return;
    }
  }
  // Fallback : chrome.storage.local
  chrome.storage.local.get(['adherents'], result => {
    if (result.adherents?.length > 0) {
      adherents = result.adherents;
      renderList();
    }
  });
})();
