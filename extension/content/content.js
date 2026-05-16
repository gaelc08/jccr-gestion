// Content script — injecté sur moncompte.ffjudo.com
// Étape 1 : nom, prenom, sexe, naissance
// Étape 2 : formulaire complet

// --- Helpers ---

function setInput(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el || !value) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function setSelect(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el || !value) return false;
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

// Normalise une chaîne pour la comparaison : majuscules, tirets → espaces
function normalize(str) {
  return str.toUpperCase().replace(/-/g, ' ');
}

// Select2 : ouvre le dropdown, tape la recherche, attend les résultats, clique l'option.
function fillSelect2(selectName, searchText, targetText) {
  return new Promise((resolve) => {
    if (typeof jQuery === 'undefined') { resolve(false); return; }
    const $select = jQuery(`[name="${selectName}"]`);
    if (!$select.length || !$select.data('select2')) { resolve(false); return; }

    $select.select2('open');

    setTimeout(() => {
      const searchInput = document.querySelector('.select2-search__field');
      if (!searchInput) { $select.select2('close'); resolve(false); return; }

      // Saisie du texte de recherche
      searchInput.focus();
      searchInput.value = searchText;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Attente chargement AJAX
      setTimeout(() => {
        const options = document.querySelectorAll(
          '.select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
        );

        // Comparaison normalisée : "BASSE-HAM" == "BASSE HAM"
        const normalTarget = targetText ? normalize(targetText) : null;
        const match = normalTarget
          ? [...options].find(o => normalize(o.textContent).includes(normalTarget))
          : options[0];

        if (match) {
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          match.click();
          resolve(true);
        } else if (options[0]) {
          // Fallback : première option
          options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          options[0].click();
          resolve(true);
        } else {
          $select.select2('close');
          resolve(false);
        }
      }, 1500);
    }, 500);
  });
}

// --- Étape 1 ---

function fillStep1(a) {
  let filled = 0;
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;
  if (setInput('naissance', a.date_naissance || '')) filled++;
  return { success: filled > 0, filled };
}

// --- Étape 2 ---

async function fillStep2(a) {
  let filled = 0;

  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (setInput('date_naissance', a.date_naissance)) filled++;
  if (setInput('portable', a.telephone)) filled++;
  if (setInput('mail', a.email)) filled++;
  if (setInput('mail-confirm', a.email)) filled++;

  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;

  // CP Select2 : recherche "57970", cible "57970 BASSE HAM" (normalisé)
  if (a.code_postal) {
    const cpTarget = a.ville
      ? `${a.code_postal} ${a.ville}`  // normalize() gère le tiret
      : a.code_postal;
    const cpOk = await fillSelect2('cp', a.code_postal, cpTarget);
    if (cpOk) filled++;

    // Adresse Select2 : après le CP
    if (a.adresse) {
      await new Promise(r => setTimeout(r, 800));
      const adresseOk = await fillSelect2('adresse', a.adresse, a.adresse);
      if (adresseOk) filled++;
    }
  }

  if (setSelect('pratiques_1', a.pratique || '1')) filled++;
  if (setRadio('type_pratique_1', a.type_pratique || 'L')) filled++;
  setRadio('handicap', '0');

  if (a.certificat) setSelect('certificat', a.certificat);
  if (a.certificat === 'QU' && setCheckbox('chk_questionnaire', true)) filled++;

  if (setRadio('fonction', a.fonction || '4')) filled++;

  // Souscription commerciale FFJDA : Non
  setRadio('souscription', '1');
  // Newsletter : Non
  setRadio('newsletter', '0');

  if (setCheckbox('assurance', true)) filled++;
  setCheckbox('rgpd', true);

  return { success: filled > 0, filled };
}

// --- Détection étape ---

function detectStep() {
  const hasNaissance = !!document.querySelector('[name="naissance"]');
  const hasDateNaissance = !!document.querySelector('[name="date_naissance"]');
  if (hasNaissance && !hasDateNaissance) return 1;
  if (hasDateNaissance) return 2;
  return 0;
}

// --- Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_form') {
    const step = detectStep();
    if (step === 1) {
      sendResponse({ ...fillStep1(message.adherent), step: 1 });
    } else if (step === 2) {
      fillStep2(message.adherent).then(result => {
        sendResponse({ ...result, step: 2 });
      });
      return true;
    } else {
      sendResponse({ success: false, step: 0, error: 'Page non reconnue' });
    }
  }
  return true;
});
