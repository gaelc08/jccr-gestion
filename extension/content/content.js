// Content script — injecté sur moncompte.ffjudo.com
// Les content scripts sont isolés : jQuery de la page n'est pas accessible directement.
// Pour Select2, on injecte un <script> dans le DOM qui s'exécute dans le contexte de la page.

// --- Helpers standard ---

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

function normalize(str) {
  return str.toUpperCase().replace(/-/g, ' ');
}

// --- Injection Select2 dans le contexte de la page ---
// Injecte un <script> dans le DOM pour accéder au jQuery natif de la page.
// Communique le résultat via un CustomEvent.

function fillSelect2ViaPage(selectName, searchText, targetText) {
  return new Promise((resolve) => {
    const eventId = `s2result_${selectName}_${Date.now()}`;

    // Écoute la réponse de la page
    window.addEventListener(eventId, (e) => resolve(e.detail.success), { once: true });

    // Injecte le script dans la page
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        var selectName = ${JSON.stringify(selectName)};
        var searchText = ${JSON.stringify(searchText)};
        var targetText = ${JSON.stringify(targetText)};
        var eventId    = ${JSON.stringify(eventId)};

        function norm(s) { return s.toUpperCase().replace(/-/g, ' '); }
        function reply(ok) {
          window.dispatchEvent(new CustomEvent(eventId, { detail: { success: ok } }));
        }

        var $sel = jQuery('[name="' + selectName + '"]');
        if (!$sel.length || !$sel.data('select2')) { reply(false); return; }

        $sel.select2('open');

        setTimeout(function() {
          var input = document.querySelector('.select2-search__field');
          if (!input) { $sel.select2('close'); reply(false); return; }

          input.focus();
          input.value = searchText;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

          setTimeout(function() {
            var opts = document.querySelectorAll(
              '.select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
            );
            var normTarget = targetText ? norm(targetText) : null;
            var match = normTarget
              ? Array.from(opts).find(function(o) { return norm(o.textContent).includes(normTarget); })
              : opts[0];

            if (!match && opts[0]) match = opts[0]; // fallback

            if (match) {
              match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              match.click();
              reply(true);
            } else {
              $sel.select2('close');
              reply(false);
            }
          }, 1500);
        }, 500);
      })();
    `;
    document.head.appendChild(script);
    script.remove();

    // Timeout de sécurité
    setTimeout(() => resolve(false), 5000);
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

  // CP via injection page
  if (a.code_postal) {
    const cpTarget = a.ville ? `${a.code_postal} ${a.ville}` : a.code_postal;
    const cpOk = await fillSelect2ViaPage('cp', a.code_postal, cpTarget);
    if (cpOk) filled++;

    // Adresse : attendre que FFJDA active le select après le CP
    if (a.adresse) {
      await new Promise(r => setTimeout(r, 800));
      const adresseOk = await fillSelect2ViaPage('adresse', a.adresse, a.adresse);
      if (adresseOk) filled++;
    }
  }

  if (setSelect('pratiques_1', a.pratique || '1')) filled++;
  if (setRadio('type_pratique_1', a.type_pratique || 'L')) filled++;
  setRadio('handicap', '0');

  if (a.certificat) setSelect('certificat', a.certificat);
  if (a.certificat === 'QU' && setCheckbox('chk_questionnaire', true)) filled++;

  if (setRadio('fonction', a.fonction || '4')) filled++;

  setRadio('souscription', '1');
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
