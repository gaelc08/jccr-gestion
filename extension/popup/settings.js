// settings.js — Page Paramètres API
const Api = window.JccApi;

const tokenInput     = document.getElementById("api-token");
const haFormSlugInput = document.getElementById("ha-form-slug");
const showToken      = document.getElementById("show-token");
const btnSave        = document.getElementById("btn-save");
const btnTest        = document.getElementById("btn-test");
const btnBack        = document.getElementById("btn-back");
const status         = document.getElementById("status");
const statsBox       = document.getElementById("stats-box");
const statsContent   = document.getElementById("stats-content");

const HA_FORM_SLUG_KEY = "jcc_ha_form_slug";

function showStatus(msg, type = "info") {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove("hidden");
  if (type === "success") {
    setTimeout(() => status.classList.add("hidden"), 3000);
  }
}

function hideStatus() {
  status.classList.add("hidden");
}

async function loadCurrentSettings() {
  const token = await Api.getApiToken();
  if (token) tokenInput.value = token;

  const result = await chrome.storage.sync.get([HA_FORM_SLUG_KEY]);
  if (result[HA_FORM_SLUG_KEY]) haFormSlugInput.value = result[HA_FORM_SLUG_KEY];
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentSettings();

  // Toggle affichage token
  showToken.addEventListener("change", () => {
    tokenInput.type = showToken.checked ? "text" : "password";
  });

  // Retour vers popup
  btnBack.addEventListener("click", () => {
    window.location.href = "popup.html";
  });

  // Enregistrer
  btnSave.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const slug  = haFormSlugInput.value.trim();

    if (!token) {
      showStatus("Veuillez saisir un token avant d'enregistrer.", "error");
      return;
    }
    if (token.length < 16) {
      showStatus("Token trop court (minimum 16 caract\u00e8res). V\u00e9rifiez votre saisie.", "error");
      return;
    }

    await Api.setApiToken(token);

    if (slug) {
      await chrome.storage.sync.set({ [HA_FORM_SLUG_KEY]: slug });
    } else {
      await chrome.storage.sync.remove(HA_FORM_SLUG_KEY);
    }

    showStatus("\u2705 Param\u00e8tres enregistr\u00e9s. Vous pouvez tester la connexion.", "success");
  });

  // Tester la connexion
  btnTest.addEventListener("click", async () => {
    hideStatus();
    statsBox.classList.remove("visible");
    btnTest.disabled = true;
    btnTest.textContent = "\uD83D\uDD0C Test en cours...";

    const token = tokenInput.value.trim();
    if (!token) {
      showStatus("Saisissez d'abord un token avant de tester.", "error");
      btnTest.disabled = false;
      btnTest.textContent = "\uD83D\uDD0C Tester la connexion";
      return;
    }

    // Sauvegarder temporairement le token pour le test
    await Api.setApiToken(token);

    const result = await Api.getStats();
    if (result.ok) {
      showStatus("\u2705 Connexion r\u00e9ussie !", "success");
      const s = result.data;
      const slug = haFormSlugInput.value.trim();
      statsContent.innerHTML = `
        <div class="stat-row"><span>Dernier sync :</span><b>${formatDate(s.synced_at)}</b></div>
        <div class="stat-row"><span>Adh\u00e9rents pay\u00e9s :</span><b>${s.paid || 0}</b></div>
        <div class="stat-row"><span>Avec certificat :</span><b>${s.with_certif || 0}</b></div>
        <div class="stat-row"><span>Rembours\u00e9s/annul\u00e9s :</span><b>${s.refunded || 0}</b></div>
        ${slug ? `<div class="stat-row"><span>Campagne active :</span><b>${slug}</b></div>` : ""}
      `;
      statsBox.classList.add("visible");
    } else if (result.missingToken) {
      showStatus("\u274C Token manquant.", "error");
    } else if (result.status === 401) {
      showStatus("\u274C Token refus\u00e9. V\u00e9rifiez qu'il correspond \u00e0 HELLOASSO_API_TOKEN du VPS.", "error");
    } else if (result.networkError) {
      showStatus(`\u274C Erreur r\u00e9seau : ${result.data.detail}`, "error");
    } else {
      showStatus(`\u274C Erreur serveur (${result.status}) : ${result.data.detail || "inconnue"}`, "error");
    }

    btnTest.disabled = false;
    btnTest.textContent = "\uD83D\uDD0C Tester la connexion";
  });
})();

function formatDate(iso) {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
