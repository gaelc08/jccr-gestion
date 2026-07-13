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
// Filtre saison : 'all' | '2025-26' | '2026-27' ...
let currentSeasonFilter = 'all';
// Cache des campagnes/saisons (GET /campaigns/members), plus récent en premier
let campaignMembersCache = null;

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
const selCampaign = document.getElementById('sel-campaign');
const countUnsaisie = document.getElementById('counter-unsaisie');
const chkUnsaisieOnly = document.getElementById('chk-unsaisie-only');

// --- Injection UI : filtre saison + bandeau renouvellement ---
// (créés dynamiquement pour ne pas modifier popup.html)
const selSeason = document.createElement('select');
selSeason.id = 'sel-season';
const seasonFilterWrap = document.createElement('div');
seasonFilterWrap.className = 'season-filter';
seasonFilterWrap.appendChild(Object.assign(document.createElement('label'), { textContent: 'Filtrer saison :' }));
seasonFilterWrap.appendChild(selSeason);
seasonFilterWrap.style.display = 'none'; // masqué tant qu'il n'y a qu'une saison
document.querySelector('.campaign-filter').after(seasonFilterWrap);

const renewalNotice = document.createElement('div');
renewalNotice.className = 'renewal-notice hidden';
document.querySelector('.tabs').after(renewalNotice);

// --- Helpers saison ---
// "2025-26" -> "25-26" (badge court demandé : 25-26 / 26-27)
function seasonBadgeLabel(season) {
  const m = /^(\d{2})(\d{2})-(\d{2})$/.exec(season || '');
  return m ? `${m[2]}-${m[3]}` : (season || '');
}
// "adhesion-2025-2026-sport" -> "Saison 2025/2026"
function seasonLabelFromSlug(slug) {
  const m = /(\d{4})-(\d{4})/.exec(slug || '');
  return m ? `Saison ${m[1]}/${m[2]}` : (slug || '');
}
// Année de début d'une saison, depuis un slug ("...-2026-2027-...") ou une saison ("2026-27")
function seasonStartYear(x) {
  const m = /(\d{4})/.exec(x || '');
  return m ? parseInt(m[1], 10) : 0;
}

// Clé d'identité d'un adhérent pour dédupliquer entre saisons/chargements
function adherentKey(a) {
  return String(a.item_id || `${a.nom}|${a.prenom}|${a.date_naissance}`);
}
// Ajoute (upsert) une liste d'adhérents à `adherents` sans écraser l'existant
function mergeAdherents(list) {
  const byKey = new Map(adherents.map(a => [adherentKey(a), a]));
  for (const a of (list || [])) byKey.set(adherentKey(a), a);
  adherents = [...byKey.values()];
}

// Reconstruit les options du filtre saison à partir des adhérents chargés
function updateSeasonFilter() {
  const seasons = [...new Set(adherents.map(a => a.season).filter(Boolean))].sort().reverse();
  const prev = selSeason.value || currentSeasonFilter;
  selSeason.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = `Toutes (${adherents.length})`;
  selSeason.appendChild(optAll);
  for (const s of seasons) {
    const n = adherents.filter(a => a.season === s).length;
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `${seasonBadgeLabel(s)} (${n})`;
    selSeason.appendChild(opt);
  }
  if ([...selSeason.options].some(o => o.value === prev)) {
    selSeason.value = prev;
    currentSeasonFilter = prev;
  } else {
    selSeason.value = 'all';
    currentSeasonFilter = 'all';
  }
  // Le filtre n'a de sens qu'avec au moins deux saisons chargées
  seasonFilterWrap.style.display = seasons.length > 1 ? '' : 'none';
}

selSeason.addEventListener('change', () => {
  currentSeasonFilter = selSeason.value;
  // Nettoyer la sélection des items qui ne sont plus visibles
  const visible = new Set(getFiltered().map(f => f.idx));
  selected = new Set([...selected].filter(i => visible.has(i)));
  renderList();
});

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
  }).filter(({ a }) => {
    // Filtre par saison
    if (currentSeasonFilter === 'all') return true;
    return (a.season || '') === currentSeasonFilter;
  }).filter(({ a }) => {
    // Filtre "non saisis seulement"
    if (chkUnsaisieOnly.checked) return !a.saisie_ffjda;
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
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.tab;
    selected.clear();
    btnFill.textContent = currentMode === 'renouvellement'
      ? '▶ Lancer le renouvellement'
      : '▶ Lancer la saisie';
    status.className = 'status hidden';
    // Charger le jeu de données correspondant au mode
    if (currentMode === 'renouvellement') {
      await loadRenewalSeason();
    } else {
      renewalNotice.classList.add('hidden');
      await loadCurrentSeason();
    }
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
  const slug = selCampaign.value || undefined;
  showStatus(`🔄 Synchronisation ${slug ? slug.replace(/^adhesion-/,'Saison ').replace(/-sport$/,'') : ''}...`, 'info');

  const syncResult = await Api.triggerSync(slug);
  if (!syncResult.ok) {
    showStatus(`❌ Sync échoué : ${syncResult.data.detail || 'erreur'}`, 'error');
    btnSync.disabled = false;
    btnSync.textContent = '🔄';
    return;
  }

  showStatus(`✅ ${syncResult.data.paid} adhérent(s) synchronisé(s).`, 'success');

  // Invalider le cache des saisons (les fichiers ont changé côté API)
  campaignMembersCache = null;

  // Re-charger la saison synchronisée depuis l'API
  const adhResult = await Api.getAdherents(slug);
  if (adhResult.ok) {
    adherents = adhResult.data.adherents;
    // Mirroiter dans chrome.storage.local (fallback offline)
    chrome.storage.local.set({ adherents });
    updateSeasonFilter();
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
  // Compteur non saisis
  const unsaisie = adherents.filter(a => !a.saisie_ffjda).length;
  countUnsaisie.textContent = unsaisie > 0 ? `${unsaisie} à saisir` : '';
  countUnsaisie.style.display = unsaisie > 0 ? '' : 'none';
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
    const hasLicence = !!a.ffjda_licence;
    const reconStatus = a.recon_status || '';
    item.className = 'adherent-item' + (selected.has(idx) ? ' checked' : '') + (isSaisie ? ' saisie' : '') + (hasLicence ? ' has-licence' : '');
    const sexeWarn = !a.sexe ? ' ⚠' : '';
    const saisieBadge = isSaisie ? '<span class="saisie-badge">✓ Saisie</span>' : '';
    const licenceBadge = hasLicence ? `<span class="licence-badge">🔑 ${a.ffjda_licence}</span>` : '';
    const reconBadge = reconStatus === 'matched' ? '<span class="recon-badge matched">✅ Match</span>'
      : reconStatus === 'corrected' ? '<span class="recon-badge corrected">✏️ Corrigé</span>'
      : reconStatus === 'name_mismatch' ? '<span class="recon-badge mismatch">⚠️ Nom</span>'
      : reconStatus === 'unmatched' ? '<span class="recon-badge unmatched">❌ Non matché</span>'
      : reconStatus === 'unknown' ? '' : '';
    const tierBadge = isIaido(a) ? '<span class="tier-badge iaido">⚔️</span>' : '';
    const seasonBadge = a.season ? `<span class="season-badge">${seasonBadgeLabel(a.season)}</span>` : '';
    item.innerHTML = `
      <input type="checkbox" data-origidx="${idx}" ${selected.has(idx) ? 'checked' : ''}>
      <span class="name">${a.nom} ${a.prenom}${sexeWarn}${tierBadge}${seasonBadge}${saisieBadge}${licenceBadge}${reconBadge}</span>
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
      updateSeasonFilter();
      renderList();
      showStatus(`${adherents.length} adhérent(s) rechargé(s).`, 'success');
    } else {
      showStatus("Aucune donnée. Utilisez 📥 HelloAsso.", 'error');
    }
  });
});

// --- Chargement des saisons ---

// Récupère (avec cache) les adhérents groupés par campagne/saison
async function fetchCampaignMembers(force = false) {
  if (campaignMembersCache && !force) return campaignMembersCache;
  const res = await Api.getCampaignMembers();
  if (res.ok && Array.isArray(res.data.campaigns)) {
    campaignMembersCache = res.data.campaigns;
  }
  return campaignMembersCache || [];
}

// Charge (remplace) la saison sélectionnée dans selCampaign — mode "Nouvelle licence"
async function loadCurrentSeason() {
  const slug = selCampaign.value || undefined;
  let res = slug ? await Api.getAdherents(slug) : await Api.getAdherents();
  // Pas encore de fichier pour cette saison → agréger toutes les saisons connues
  if (slug && (!res.ok || !(res.data.adherents || []).length)) {
    res = await Api.getAdherents();
  }
  adherents = (res.ok && Array.isArray(res.data.adherents)) ? res.data.adherents : [];
  chrome.storage.local.set({ adherents });
  updateSeasonFilter();
  selected.clear();
  renderList();
  return adherents.length;
}

// Ajoute (sans écraser) les adhérents d'une campagne à la liste courante
async function addCampaign(slug) {
  const res = await Api.getAdherents(slug);
  if (!res.ok || !Array.isArray(res.data.adherents)) {
    showStatus(`Aucune donnée pour ${seasonLabelFromSlug(slug)} — lancez une synchro 🔄`, 'error');
    return;
  }
  const before = adherents.length;
  mergeAdherents(res.data.adherents);
  chrome.storage.local.set({ adherents });
  updateSeasonFilter();
  renderList();
  showStatus(`➕ ${adherents.length - before} adhérent(s) de ${seasonLabelFromSlug(slug)} ajoutés (${adherents.length} au total).`, 'success');
}

// Mode "Renouvellement" : charge les licenciés FFJDA de la saison précédente
async function loadRenewalSeason() {
  const camps = await fetchCampaignMembers();
  if (!camps.length) {
    adherents = [];
    updateSeasonFilter();
    renderList();
    renewalNotice.textContent = '⚠️ Aucune campagne disponible.';
    renewalNotice.classList.remove('hidden');
    return;
  }
  // Saison cible = celle sélectionnée (peut ne pas encore avoir de fichier).
  // Source du renouvellement = la campagne existante la plus récente
  // STRICTEMENT antérieure à la saison cible.
  const targetSlug = selCampaign.value || camps[0].slug;
  const targetYear = seasonStartYear(targetSlug);
  let prev = null;
  if (targetYear) {
    // camps est trié du plus récent au plus ancien → le premier match est le bon
    prev = camps.find(c => seasonStartYear(c.slug) < targetYear) || null;
  } else {
    // Cible non datée : on suppose que camps[0] est la saison courante
    prev = camps[1] || null;
  }
  if (!prev) {
    adherents = [];
    updateSeasonFilter();
    renderList();
    renewalNotice.innerHTML = '⚠️ Aucune saison précédente disponible pour le renouvellement.';
    renewalNotice.classList.remove('hidden');
    return;
  }
  // Ne garder que les membres ayant une licence FFJDA (renouvelables)
  const licensed = (prev.adherents || []).filter(a => a.ffjda_licence);
  adherents = licensed;
  chrome.storage.local.set({ adherents });
  updateSeasonFilter();
  selected.clear();
  renderList();
  renewalNotice.innerHTML =
    `🔁 <strong>Renouvellement des licences</strong> depuis <strong>${prev.label}</strong> — ${licensed.length} licencié(s)`;
  renewalNotice.classList.remove('hidden');
}

// --- Sélecteur de campagne ---
async function loadCampaigns() {
  const hasToken = await checkApiToken();
  if (!hasToken) return;

  const result = await Api.getCampaigns();
  if (!result.ok || !result.data.campaigns) return;

  const campaigns = result.data.campaigns.filter(
    c => (c.type || 'Membership') === 'Membership' && (c.slug.includes('adhesion') || c.slug === 'stage-judo-printemps')
  );
  const current = result.data.current;

  selCampaign.innerHTML = '';
  for (const c of campaigns) {
    const opt = document.createElement('option');
    opt.value = c.slug;
    const label = c.slug
      .replace(/^adhesion-(\d{4})-(\d{4})-sport$/, 'Saison $1/$2')
      .replace(/^stage-judo-printemps$/, 'Stage Printemps');
    opt.textContent = label;
    if (c.slug === current) opt.selected = true;
    selCampaign.appendChild(opt);
  }
}

selCampaign.addEventListener('change', async () => {
  const slug = selCampaign.value;
  if (!slug) return;
  chrome.storage.local.set({ campaignSlug: slug });
  await Api.setCurrentCampaign(slug);
  // Ne plus écraser : on AJOUTE les adhérents de la saison choisie à la liste.
  // (Le bouton 🔄 reste disponible pour synchroniser cette saison depuis HelloAsso.)
  if (currentMode === 'renouvellement') {
    await loadRenewalSeason();
  } else {
    await addCampaign(slug);
  }
});

chrome.storage.local.get(['campaignSlug'], r => {
  if (r.campaignSlug) selCampaign.value = r.campaignSlug;
});

// Filtre saisie
chkUnsaisieOnly.addEventListener('change', () => {
  chrome.storage.local.set({ unsaisieOnly: chkUnsaisieOnly.checked });
  renderList();
});

chrome.storage.local.get(['unsaisieOnly'], r => {
  if (r.unsaisieOnly) {
    chkUnsaisieOnly.checked = true;
    renderList();
  }
});

// Chargement auto : priorité API, fallback chrome.storage.local
(async () => {
  const hasToken = await checkApiToken();
  await loadCampaigns();
  if (hasToken) {
    // Pré-charger le cache des saisons (utile pour l'onglet Renouvellement)
    await fetchCampaignMembers();
    const n = await loadCurrentSeason();
    if (n > 0) return;
  }
  // Fallback : chrome.storage.local
  chrome.storage.local.get(['adherents'], result => {
    if (result.adherents?.length > 0) {
      adherents = result.adherents;
      updateSeasonFilter();
      renderList();
    }
  });
})();
