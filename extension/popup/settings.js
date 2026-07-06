// settings.js — Page Paramètres API
// Note: HA_FORM_SLUG_KEY est déclaré dans lib/api.js (chargé avant ce script)

function showStatus(msg, type = "info") {
  const status = document.getElementById("status");
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove("hidden");
  if (type === "success") {
    setTimeout(() => status.classList.add("hidden"), 3000);
  }
}

function hideStatus() {
  document.getElementById("status").classList.add("hidden");
}

async function loadCurrentSettings() {
  const Api = window.JccApi;
  const token = await Api.getApiToken();
  if (token) document.getElementById("api-token").value = token;

  const result = await chrome.storage.sync.get([HA_FORM_SLUG_KEY]);
  if (result[HA_FORM_SLUG_KEY]) document.getElementById("ha-form-slug").value = result[HA_FORM_SLUG_KEY];
}

function formatDate(iso) {
  if (!iso) return "—";
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

document.addEventListener("DOMContentLoaded", async () => {
  const Api = window.JccApi;

  const tokenInput      = document.getElementById("api-token");
  const haFormSlugInput = document.getElementById("ha-form-slug");
  const showToken       = document.getElementById("show-token");
  const btnSave         = document.getElementById("btn-save");
  const btnTest         = document.getElementById("btn-test");
  const btnBack         = document.getElementById("btn-back");
  const statsBox        = document.getElementById("stats-box");
  const statsContent    = document.getElementById("stats-content");

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
      showStatus("Token trop court (minimum 16 caractères).", "error");
      return;
    }

    await Api.setApiToken(token);

    if (slug) {
      await chrome.storage.sync.set({ [HA_FORM_SLUG_KEY]: slug });
    } else {
      await chrome.storage.sync.remove(HA_FORM_SLUG_KEY);
    }

    showStatus("✅ Paramètres enregistrés.", "success");
  });

  // Tester la connexion
  btnTest.addEventListener("click", async () => {
    hideStatus();
    statsBox.classList.remove("visible");
    btnTest.disabled = true;
    btnTest.textContent = "🔌 Test en cours...";

    const token = tokenInput.value.trim();
    if (!token) {
      showStatus("Saisissez d'abord un token avant de tester.", "error");
      btnTest.disabled = false;
      btnTest.textContent = "🔌 Tester la connexion";
      return;
    }

    await Api.setApiToken(token);
    const result = await Api.getStats();

    if (result.ok) {
      showStatus("✅ Connexion réussie !", "success");
      const s = result.data;
      const slug = haFormSlugInput.value.trim();
      statsContent.innerHTML = `
        <div class="stat-row"><span>Dernier sync :</span><b>${formatDate(s.synced_at)}</b></div>
        <div class="stat-row"><span>Adhérents payés :</span><b>${s.paid || 0}</b></div>
        <div class="stat-row"><span>Avec certificat :</span><b>${s.with_certif || 0}</b></div>
        <div class="stat-row"><span>Remboursés/annulés :</span><b>${s.refunded || 0}</b></div>
        ${slug ? `<div class="stat-row"><span>Campagne active :</span><b>${slug}</b></div>` : ""}
      `;
      statsBox.classList.add("visible");
    } else if (result.missingToken) {
      showStatus("❌ Token manquant.", "error");
    } else if (result.status === 401) {
      showStatus("❌ Token refusé. Vérifiez HELLOASSO_API_TOKEN sur le VPS.", "error");
    } else if (result.networkError) {
      showStatus(`❌ Erreur réseau : ${result.data.detail}`, "error");
    } else {
      showStatus(`❌ Erreur serveur (${result.status}) : ${result.data.detail || "inconnue"}`, "error");
    }

    btnTest.disabled = false;
    btnTest.textContent = "🔌 Tester la connexion";
  });
});
