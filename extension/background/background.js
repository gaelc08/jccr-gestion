// background.js — v2026.05.16-16
// Gère le flux complet même quand la popup est fermée

let flowState = null; // { tabId, adherent, targetStep }
let pollTimer = null;

function setStatus(msg, type = 'info') {
  chrome.storage.session.set({ flowStatus: { msg, type, ts: Date.now() } });
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function detectStep(url) {
  if (!url) return null;
  if (url.includes('/achat-licence/creation-licence-club/etape_1')) return 'etape2';
  if (url.includes('/saisir-licence/etape-2'))                       return 'intermediaire';
  if (url.includes('/saisir-licence'))                               return 'etape1';
  if (url.includes('/prise-licence'))                                return 'depart';
  return null;
}

// --- Scripts injectés dans la page (world MAIN) ---

function fillEtape1(adherent) {
  let f = 0;
  function si(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function ss(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (si('nom',       adherent.nom))                      f++;
  if (si('prenom',    adherent.prenom))                    f++;
  if (ss('sexe',      adherent.sexe === 'F' ? 'F' : 'M')) f++;
  if (si('naissance', adherent.date_naissance || ''))     f++;
  return { step: 1, success: f > 0, filled: f };
}

function clickCreerLicence() {
  const btn = Array.from(document.querySelectorAll('a.big-btn'))
    .find(a => a.textContent.trim().toLowerCase().includes('cr\u00e9er une licence'));
  if (btn) { btn.click(); return true; }
  return false;
}

function fillEtape2(adherent) {
  function norm(s) { return (s || '').toUpperCase().replace(/-/g, ' '); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function si(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function ss(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function sr(name, val) {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function sc(id, checked) {
    const el = document.getElementById(id) || document.querySelector(`input[name="${id}"]`);
    if (!el) return false;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function clickOpt(el) {
    ['mouseenter','mouseover','mousedown','mouseup','click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    );
  }
  function fillSelect2(selectName, searchText, targetText) {
    return new Promise(resolve => {
      jQuery('.select2-container--open [name]').each(function() {
        try { jQuery(this).select2('close'); } catch(e) {}
      });
      const $sel = jQuery(`[name="${selectName}"]`);
      if (!$sel.length || !$sel.data('select2')) { resolve(false); return; }
      setTimeout(() => {
        $sel.select2('open');
        setTimeout(() => {
          const input = document.querySelector('.select2-container--open .select2-search__field');
          if (!input) { $sel.select2('close'); resolve(false); return; }
          input.focus(); input.value = searchText;
          input.dispatchEvent(new Event('input',         { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          setTimeout(() => {
            const opts = document.querySelectorAll(
              '.select2-container--open .select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
            );
            const nt = norm(targetText);
            let match = Array.from(opts).find(o => norm(o.textContent).includes(nt));
            if (!match && opts[0]) match = opts[0];
            if (match) { clickOpt(match); setTimeout(() => resolve(true), 400); }
            else { $sel.select2('close'); resolve(false); }
          }, 1500);
        }, 500);
      }, 200);
    });
  }

  let f = 0;
  if (si('nom',            adherent.nom))           f++;
  if (si('prenom',         adherent.prenom))         f++;
  if (si('date_naissance', adherent.date_naissance)) f++;
  if (si('portable',       adherent.telephone))      f++;
  if (si('mail',           adherent.email))          f++;
  if (si('mail-confirm',   adherent.email))          f++;
  if (ss('sexe', adherent.sexe === 'F' ? 'F' : 'M')) f++;

  const cpTarget = adherent.ville
    ? `${adherent.code_postal} ${adherent.ville}`
    : adherent.code_postal;

  return fillSelect2('cp', adherent.code_postal, cpTarget)
    .then(ok => { if (ok) f++; return wait(1200); })
    .then(() => {
      if (!adherent.adresse) return;
      return fillSelect2('adresse', adherent.adresse, adherent.adresse)
        .then(ok => { if (ok) f++; });
    })
    .then(() => {
      if (ss('pratiques_1',     adherent.pratique || '1'))       f++;
      if (sr('type_pratique_1', adherent.type_pratique || 'L'))  f++;
      sr('handicap', '0');
      if (adherent.certificat) ss('certificat', adherent.certificat);
      if (adherent.certificat === 'QU') sc('chk_questionnaire', true);
      if (sr('fonction',    adherent.fonction || '4')) f++;
      sr('souscription', '1');
      sr('newsletter',   '0');
      if (sc('assurance', true)) f++;
      sc('rgpd', true);
      return { step: 2, success: f > 0, filled: f };
    });
}

async function runInTab(tabId, fn, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: fn,
    args
  });
  return results[0].result;
}

// --- Machine à états ---

async function handleStep(tabId, step, adherent) {
  if (step === 'depart') {
    setStatus('Navigation vers "Saisir une licence"...', 'info');
    await chrome.tabs.update(tabId, { url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence' });
    watchFor(tabId, adherent, 'etape1');
    return;
  }

  if (step === 'etape1') {
    setStatus('\u00c9tape 1 : remplissage...', 'info');
    const r = await runInTab(tabId, fillEtape1, [adherent]);
    if (!r || !r.success) { setStatus('\u00c9tape 1 : aucun champ rempli.', 'error'); flowState = null; return; }
    setStatus(`\u00c9tape 1 : ${r.filled} champ(s) \u2705 \u2014 Clique sur "Valider"...`, 'info');
    watchFor(tabId, adherent, 'intermediaire');
    return;
  }

  if (step === 'intermediaire') {
    setStatus('Clic sur "Je souhaite cr\u00e9er une licence"...', 'info');
    await new Promise(r => setTimeout(r, 800));
    const ok = await runInTab(tabId, clickCreerLicence);
    if (!ok) { setStatus('Bouton "cr\u00e9er une licence" introuvable.', 'error'); flowState = null; return; }
    setStatus('Navigation vers \u00e9tape 2...', 'info');
    watchFor(tabId, adherent, 'etape2');
    return;
  }

  if (step === 'etape2') {
    setStatus('\u00c9tape 2 : remplissage...', 'info');
    await new Promise(r => setTimeout(r, 800));
    const r = await runInTab(tabId, fillEtape2, [adherent]);
    if (!r) { setStatus('\u00c9tape 2 : pas de r\u00e9ponse.', 'error'); flowState = null; return; }
    setStatus(
      r.success ? `\u00c9tape 2 : ${r.filled} champ(s) rempli(s) \u2705` : `\u00c9tape 2 : ${r.error || 'aucun champ.'}`,
      r.success ? 'success' : 'error'
    );
    flowState = null;
    return;
  }
}

function watchFor(tabId, adherent, targetStep) {
  stopPoll();
  flowState = { tabId, adherent, targetStep };
  const deadline = Date.now() + 60000;

  pollTimer = setInterval(async () => {
    if (!flowState) { stopPoll(); return; }
    if (Date.now() > deadline) {
      stopPoll(); flowState = null;
      setStatus(`Timeout : \u00e9tape "${targetStep}" non atteinte.`, 'error');
      return;
    }
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch(e) { stopPoll(); flowState = null; return; }
    const current = detectStep(tab.url || '');
    if (current === targetStep) {
      stopPoll();
      await new Promise(r => setTimeout(r, 600));
      await handleStep(tabId, targetStep, adherent);
    }
  }, 500);
}

// --- Écoute des messages de la popup ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'startFlow') {
    stopPoll();
    flowState = null;
    const { tabId, tabUrl, adherent } = msg;
    const step = detectStep(tabUrl);
    if (!step) {
      setStatus('Page FFJDA non reconnue.', 'error');
      sendResponse({ ok: false });
      return true;
    }
    handleStep(tabId, step, adherent);
    sendResponse({ ok: true, step });
    return true;
  }

  if (msg.action === 'cancelFlow') {
    stopPoll(); flowState = null;
    setStatus('Flux annul\u00e9.', 'info');
    sendResponse({ ok: true });
    return true;
  }
});
