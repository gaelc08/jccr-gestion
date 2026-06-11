// settings.js — Page Paramètres API

const Api = window.JccApi;

const tokenInput = document.getElementById("api-token");
const showToken  = document.getElementById("show-token");
const btnSave    = document.getElementById("btn-save");
const btnTest    = document.getElementById("btn-test");
const btnBack    = document.getElementById("btn-back");
const status     = document.getElementById("status");
const statsBox   = document.getElementById("stats-box");
const statsContent = document.getElementById("stats-content");

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

async function loadCurrentToken() {
  const token = await Api.getApiToken();
  if (token) tokenInput.value = token;
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentToken();

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
    if (!token) {
      showStatus("Veuillez saisir un token avant d'enregistrer.", "error");
      return;
    }
    if (token.length < 16) {
      showStatus("Token trop court (minimum 16 caractères). Vérifiez votre saisie.", "error");
      return;
    }
    await Api.setApiToken(token);
    showStatus("✅ Token enregistré. Vous pouvez tester la connexion.", "success");
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

    // Sauvegarder temporairement le token pour le test
    await Api.setApiToken(token);

    const result = await Api.getStats();
    if (result.ok) {
      showStatus("✅ Connexion réussie !", "success");
      // Afficher les stats
      const s = result.data;
      statsContent.innerHTML = `
        <div class="stat-row"><span>Dernier sync :</span><b>${formatDate(s.synced_at)}</b></div>
        <div class="stat-row"><span>Adhérents payés :</span><b>${s.paid || 0}</b></div>
        <div class="stat-row"><span>Avec certificat :</span><b>${s.with_certif || 0}</b></div>
        <div class="stat-row"><span>Remboursés/annulés :</span><b>${s.refunded || 0}</b></div>
      `;
      statsBox.classList.add("visible");
    } else if (result.missingToken) {
      showStatus("❌ Token manquant.", "error");
    } else if (result.status === 401) {
      showStatus("❌ Token refusé. Vérifiez qu'il correspond à HELLOASSO_API_TOKEN du VPS.", "error");
    } else if (result.networkError) {
      showStatus(`❌ Erreur réseau : ${result.data.detail}`, "error");
    } else {
      showStatus(`❌ Erreur serveur (${result.status}) : ${result.data.detail || "inconnue"}`, "error");
    }

    btnTest.disabled = false;
    btnTest.textContent = "🔌 Tester la connexion";
  });
})();

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
