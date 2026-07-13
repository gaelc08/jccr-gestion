// lib/api.js — Client API HelloAsso Sync (partagé popup, background, import)
const API_BASE = "https://sync.judo-cattenom.fr";
const TOKEN_KEY = "jcc_api_token";
const HA_FORM_SLUG_KEY = "jcc_ha_form_slug";

/**
 * Récupère le token API depuis chrome.storage.sync (partage cross-devices).
 * Retourne null si non configuré (→ invite l'utilisateur à le faire).
 */
async function getApiToken() {
  const result = await chrome.storage.sync.get([TOKEN_KEY]);
  return result[TOKEN_KEY] || null;
}

/**
 * Sauvegarde le token API dans chrome.storage.sync.
 */
async function setApiToken(token) {
  await chrome.storage.sync.set({ [TOKEN_KEY]: token });
}

/**
 * Vérifie si le token est configuré.
 */
async function hasApiToken() {
  const token = await getApiToken();
  return !!token;
}

/**
 * Récupère le slug de la campagne HelloAsso depuis chrome.storage.sync.
 * Retourne null si non configuré.
 */
async function getHaFormSlug() {
  const result = await chrome.storage.sync.get([HA_FORM_SLUG_KEY]);
  return result[HA_FORM_SLUG_KEY] || null;
}

/**
 * Appelle un endpoint de l'API avec authentification Bearer.
 * @param {string} endpoint - "/sync", "/adherents", "/stats", "/mark-saisie"
 * @param {object} options - { method, body, ... }
 * @returns {Promise<{status: number, data: object, ok: boolean}>}
 */
async function apiCall(endpoint, options = {}) {
  const token = await getApiToken();
  if (!token) {
    return {
      status: 401,
      data: { detail: "Token API non configuré. Ouvrez la page Paramètres (⚙️)." },
      ok: false,
      missingToken: true,
    };
  }

  const method = options.method || "GET";
  const fetchOptions = {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const r = await fetch(`${API_BASE}${endpoint}`, fetchOptions);
    let data;
    try {
      data = await r.json();
    } catch {
      data = { detail: await r.text() };
    }
    return { status: r.status, data, ok: r.ok };
  } catch (err) {
    return { status: 0, data: { detail: err.message }, ok: false, networkError: true };
  }
}

// --- Fonctions utilitaires publiques ---

/**
 * GET /adherents — récupère les adhérents synchronisés.
 * @param {string} [campaign] - slug d'une campagne : ne charge que cette saison.
 *                              Sans argument : agrège toutes les saisons connues
 *                              (chaque adhérent porte alors un champ "season").
 */
async function getAdherents(campaign) {
  const qs = campaign ? `?campaign=${encodeURIComponent(campaign)}` : "";
  return apiCall(`/adherents${qs}`);
}

/**
 * GET /campaigns/members — récupère les adhérents groupés par campagne/saison.
 * Retourne { campaigns: [ { slug, label, season, count, adherents: [...] } ] }.
 */
async function getCampaignMembers() {
  return apiCall("/campaigns/members");
}

/**
 * POST /sync — déclenche une synchronisation avec HelloAsso
 * @param {string} formSlug - optionnel, slug de la campagne
 */
async function triggerSync(formSlug) {
  const slug = formSlug || (await getHaFormSlug());
  const body = slug ? { form_slug: slug } : undefined;
  return apiCall("/sync", { method: "POST", body });
}

/**
 * GET /campaigns — liste les campagnes disponibles
 */
async function getCampaigns() {
  return apiCall("/campaigns");
}

/**
 * POST /campaigns/current — change la campagne active
 */
async function setCurrentCampaign(formSlug) {
  return apiCall("/campaigns/current", {
    method: "POST",
    body: { form_slug: formSlug },
  });
}

/**
 * GET /stats — récupère les stats de la dernier synchro
 */
async function getStats() {
  return apiCall("/stats");
}

/**
 * POST /mark-saisie — marque un item_id comme licence saisie dans FFJDA
 */
async function markSaisie(itemId, value = true) {
  return apiCall("/mark-saisie", {
    method: "POST",
    body: { item_id: itemId, value },
  });
}

/**
 * Cherche un adhérent par (nom + prénom) dans la liste.
 * Retourne l'adhérent matching ou null.
 */
function findAdherentByNomPrenom(adherents, nom, prenom) {
  const normName = (s) =>
    (s || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, " ")
      .trim();

  const nA = normName(nom);
  const pA = normName(prenom);

  return adherents.find((a) => {
    const nA_a = normName(a.nom);
    const pA_a = normName(a.prenom);
    return nA_a.includes(nA) && pA_a.includes(pA);
  });
}

// Export via window.* pour usage depuis <script src>
if (typeof window !== "undefined") {
  window.JccApi = {
    getApiToken,
    setApiToken,
    hasApiToken,
    getHaFormSlug,
    getAdherents,
    getCampaignMembers,
    triggerSync,
    getCampaigns,
    setCurrentCampaign,
    getStats,
    markSaisie,
    findAdherentByNomPrenom,
    API_BASE,
  };
}
