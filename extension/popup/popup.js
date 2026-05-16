// popup.js
let adherents = [];

const select   = document.getElementById('adherent-select');
const fiche    = document.getElementById('fiche');
const btnFill  = document.getElementById('btn-fill');
const btnLoad  = document.getElementById('btn-load');
const status   = document.getElementById('status');

function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}

function hideFiche() { fiche.classList.add('hidden'); btnFill.disabled = true; }

function showFiche(a) {
  document.getElementById('f-nom').textContent      = a.nom || '—';
  document.getElementById('f-prenom').textContent   = a.prenom || '—';
  document.getElementById('f-ddn').textContent      = a.date_naissance || '—';
  document.getElementById('f-email').textContent    = a.email || '—';
  document.getElementById('f-tel').textContent      = a.telephone || '—';
  document.getElementById('f-adresse').textContent  = a.adresse || '—';
  document.getElementById('f-cp').textContent       = a.code_postal || '—';
  document.getElementById('f-ville').textContent    = a.ville || '—';
  document.getElementById('f-sexe').textContent     = a.sexe || '—';
  document.getElementById('f-discipline').textContent = a.discipline || '—';
  fiche.classList.remove('hidden');
  btnFill.disabled = false;
}

function populateSelect(data) {
  select.innerHTML = '<option value="">-- Sélectionner un adhérent --</option>';
  data.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${a.nom} ${a.prenom}`;
    select.appendChild(opt);
  });
}

btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], (result) => {
    if (result.adherents && result.adherents.length > 0) {
      adherents = result.adherents;
      populateSelect(adherents);
      showStatus(`${adherents.length} adhérent(s) chargé(s).`, 'success');
    } else {
      showStatus("Aucune donnée. Importez d'abord les adhérents.", 'error');
    }
  });
});

select.addEventListener('change', () => {
  const idx = select.value;
  if (idx === '') { hideFiche(); return; }
  showFiche(adherents[parseInt(idx)]);
});

// -----------------------------------------------------------------------
// Fonction injectée dans le contexte de la PAGE (world: MAIN)
// A accès au jQuery natif de la page FFJDA
// -----------------------------------------------------------------------
function pageScript(adherent) {
  function norm(s) { return s.toUpperCase().replace(/-/g, ' '); }

  function setInput(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || value == null) return false;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setSelect(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || value == null) return false;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function setCheckbox(id, checked) {
    const el = document.getElementById(id) || document.querySelector(`input[name="${id}"]`);
    if (!el) return false;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillSelect2(selectName, searchText, targetText) {
    return new Promise((resolve) => {
      const $sel = jQuery(`[name="${selectName}"]`);
      if (!$sel.length || !$sel.data('select2')) { resolve(false); return; }

      $sel.select2('open');
      setTimeout(() => {
        const input = document.querySelector('.select2-search__field');
        if (!input) { $sel.select2('close'); resolve(false); return; }

        input.focus();
        input.value = searchText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        setTimeout(() => {
          const opts = document.querySelectorAll(
            '.select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
          );
          const normTarget = targetText ? norm(targetText) : null;
          let match = normTarget
            ? Array.from(opts).find(o => norm(o.textContent).includes(normTarget))
            : opts[0];
          if (!match && opts[0]) match = opts[0];

          if (match) {
            match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            match.click();
            resolve(true);
          } else {
            $sel.select2('close');
            resolve(false);
          }
        }, 1500);
      }, 500);
    });
  }

  // Détection étape
  const hasNaissance    = !!document.querySelector('[name="naissance"]');
  const hasDateNaissance = !!document.querySelector('[name="date_naissance"]');
  const step = (hasNaissance && !hasDateNaissance) ? 1 : hasDateNaissance ? 2 : 0;

  if (step === 1) {
    let filled = 0;
    if (setInput('nom',        adherent.nom))          filled++;
    if (setInput('prenom',     adherent.prenom))        filled++;
    if (setSelect('sexe',      adherent.sexe === 'F' ? 'F' : 'M')) filled++;
    if (setInput('naissance',  adherent.date_naissance || '')) filled++;
    return Promise.resolve({ step: 1, success: filled > 0, filled });
  }

  if (step === 2) {
    let filled = 0;
    if (setInput('nom',          adherent.nom))          filled++;
    if (setInput('prenom',       adherent.prenom))        filled++;
    if (setInput('date_naissance', adherent.date_naissance)) filled++;
    if (setInput('portable',     adherent.telephone))     filled++;
    if (setInput('mail',         adherent.email))         filled++;
    if (setInput('mail-confirm', adherent.email))         filled++;
    if (setSelect('sexe',        adherent.sexe === 'F' ? 'F' : 'M')) filled++;

    const cpTarget = adherent.ville
      ? `${adherent.code_postal} ${adherent.ville}`
      : adherent.code_postal;

    return fillSelect2('cp', adherent.code_postal, cpTarget)
      .then(cpOk => {
        if (cpOk) filled++;
        if (!adherent.adresse) return Promise.resolve();
        return new Promise(r => setTimeout(r, 800))
          .then(() => fillSelect2('adresse', adherent.adresse, adherent.adresse))
          .then(adOk => { if (adOk) filled++; });
      })
      .then(() => {
        if (setSelect('pratiques_1',    adherent.pratique || '1'))    filled++;
        if (setRadio('type_pratique_1', adherent.type_pratique || 'L')) filled++;
        setRadio('handicap', '0');
        if (adherent.certificat) setSelect('certificat', adherent.certificat);
        if (adherent.certificat === 'QU' && setCheckbox('chk_questionnaire', true)) filled++;
        if (setRadio('fonction',       adherent.fonction || '4'))     filled++;
        setRadio('souscription', '1');
        setRadio('newsletter',   '0');
        if (setCheckbox('assurance', true)) filled++;
        setCheckbox('rgpd', true);
        return { step: 2, success: filled > 0, filled };
      });
  }

  return Promise.resolve({ step: 0, success: false, filled: 0, error: 'Page non reconnue' });
}

// -----------------------------------------------------------------------
// Bouton Remplir — exécute pageScript dans world: MAIN
// -----------------------------------------------------------------------
btnFill.addEventListener('click', async () => {
  const idx = select.value;
  if (idx === '') return;
  const adherent = adherents[parseInt(idx)];

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('moncompte.ffjudo.com')) {
    showStatus("Ouvrez d'abord la page de saisie FFJDA.", 'error');
    return;
  }

  showStatus('Remplissage en cours...', 'info');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: pageScript,
      args: [adherent]
    });

    const r = results[0].result;
    // pageScript retourne une Promise — si le résultat est un objet on l'utilise directement
    // (Chrome MV3 résout automatiquement les Promise retournées par executeScript)
    if (!r) { showStatus('Pas de réponse.', 'error'); return; }
    const stepLabel = r.step === 1 ? 'Étape 1' : r.step === 2 ? 'Étape 2' : 'Page non reconnue';
    showStatus(
      r.success ? `${stepLabel} : ${r.filled} champ(s) rempli(s) ✅` : `${stepLabel} : aucun champ rempli.`,
      r.success ? 'success' : 'error'
    );
  } catch (err) {
    showStatus('Erreur : ' + err.message, 'error');
  }
});

// Chargement auto
chrome.storage.local.get(['adherents'], (result) => {
  if (result.adherents && result.adherents.length > 0) {
    adherents = result.adherents;
    populateSelect(adherents);
  }
});
