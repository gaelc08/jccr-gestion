import { fetchCompetitions, toggleClubSelected, triggerSync } from "./competitions-service.js";
const NIVEAU_CONFIG = {
  FEDERAL: { label: "F\xE9d\xE9ral", color: "#c0392b", bg: "#fdecea" },
  NATIONAL: { label: "National", color: "#1565c0", bg: "#e3f0ff" },
  REGIONAL: { label: "R\xE9gional", color: "#2e7d32", bg: "#e6f5e7" },
  DEPARTEMENTAL: { label: "D\xE9part.", color: "#e65100", bg: "#fff3e0" },
  LOCAL: { label: "Local", color: "#555", bg: "#f0f0f0" }
};
const TYPE_OPTIONS = ["COMPETITION", "PASSAGE DE GRADE", "KATA", "FORMATION"];
function getNiveauConfig(niveau) {
  if (!niveau) return { label: niveau ?? "\u2014", color: "#555", bg: "#f0f0f0" };
  return NIVEAU_CONFIG[niveau.toUpperCase()] ?? { label: niveau, color: "#555", bg: "#f0f0f0" };
}
function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatDate(dateStr) {
  if (!dateStr) return "\u2014";
  try {
    const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return dateStr;
  }
}
let _deps = null;
let _competitions = [];
let _filteredNiveau = "";
let _filteredCategory = "";
let _filteredType = "";
let _loading = false;
let _selectedDate = null;
let _currentMonth = null;
function initCompetitionsUi(deps) {
  _deps = deps;
}
function getCurrentMonth() {
  if (!_currentMonth) {
    const now = /* @__PURE__ */ new Date();
    _currentMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  return _currentMonth;
}
function getMonthCompetitions(competitions, { year, month }) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return competitions.filter((c) => c.date?.startsWith(prefix));
}
function renderNiveauBadge(niveau) {
  const cfg = getNiveauConfig(niveau);
  return `<span class="comp-badge" style="background:${cfg.bg};color:${cfg.color}">${escapeHtml(cfg.label)}</span>`;
}
function renderCompetitionCard(comp, isAdmin) {
  const selected = comp.club_selected ? " comp-card--selected" : "";
  const categories = Array.isArray(comp.categories) && comp.categories.length > 0 ? comp.categories.join(", ") : null;
  const lieu = [comp.lieu_nom, comp.lieu_ville].filter(Boolean).join(" \u2014 ");
  const selectBtn = isAdmin ? `<button class="comp-select-btn btn-secondary ${comp.club_selected ? "comp-select-btn--on" : ""}" data-id="${escapeHtml(comp.id)}" data-selected="${comp.club_selected ? "true" : "false"}" title="${comp.club_selected ? "Retirer" : "Retenir pour le club"}">\u{1F3C6}</button>` : comp.club_selected ? '<span class="comp-club-badge">\u{1F3C6} Retenu club</span>' : "";
  return `
    <div class="comp-card card${selected}">
      <div class="comp-card-header">
        <div class="comp-card-date">${escapeHtml(formatDate(comp.date))}</div>
        <div class="comp-card-badges">${renderNiveauBadge(comp.niveau)}</div>
        ${selectBtn}
      </div>
      <div class="comp-card-title">${escapeHtml(comp.title)}</div>
      ${lieu ? `<div class="comp-card-lieu">\u{1F4CD} ${escapeHtml(lieu)}</div>` : ""}
      ${categories ? `<div class="comp-card-categories">\u{1F94B} ${escapeHtml(categories)}</div>` : ""}
      ${comp.type_competition ? `<div class="comp-card-type">\u{1F4CB} ${escapeHtml(comp.type_competition)}</div>` : ""}
      ${comp.commentaire ? `<div class="comp-card-commentaire">${escapeHtml(comp.commentaire)}</div>` : ""}
      ${comp.url_source ? `<div class="comp-card-link"><a href="${escapeHtml(comp.url_source)}" target="_blank" rel="noopener">Voir sur judo-moselle.fr \u2197</a></div>` : ""}
    </div>`;
}
function getAllCategories(competitions) {
  const cats = /* @__PURE__ */ new Set();
  for (const c of competitions) if (Array.isArray(c.categories)) c.categories.forEach((cat) => cats.add(cat));
  return [...cats].sort();
}
function renderFilters(competitions, isAdmin) {
  const categories = getAllCategories(competitions);
  const niveaux = Object.keys(NIVEAU_CONFIG);
  const niveauOptions = niveaux.map((n) => `<option value="${n}"${_filteredNiveau === n ? " selected" : ""}>${NIVEAU_CONFIG[n].label}</option>`).join("");
  const categoryOptions = categories.map((c) => `<option value="${escapeHtml(c)}"${_filteredCategory === c ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");
  const typeOptions = TYPE_OPTIONS.map((t) => `<option value="${t}"${_filteredType === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("");
  const syncBtn = isAdmin ? `<button id="compSyncBtn" class="btn-secondary">\u{1F504} Synchroniser</button>` : "";
  return `
    <div class="comp-toolbar">
      <label class="toolbar-label"><span>Niveau</span><select id="compNiveauFilter"><option value="">Tous</option>${niveauOptions}</select></label>
      ${categories.length > 0 ? `<label class="toolbar-label"><span>Cat\xE9gorie</span><select id="compCategoryFilter"><option value="">Toutes</option>${categoryOptions}</select></label>` : ""}
      <label class="toolbar-label"><span>Type</span><select id="compTypeFilter"><option value="">Tous</option>${typeOptions}</select></label>
      <div class="comp-toolbar-actions">${syncBtn}</div>
    </div>`;
}
function applyFilters(competitions) {
  return competitions.filter((c) => {
    if (_filteredNiveau && (c.niveau ?? "").toUpperCase() !== _filteredNiveau) return false;
    if (_filteredCategory && !(Array.isArray(c.categories) && c.categories.includes(_filteredCategory))) return false;
    if (_filteredType && (c.type_competition ?? "") !== _filteredType) return false;
    return true;
  });
}
function renderCalendar(monthComps, { year, month }, selectedDate) {
  const monthNames = ["Janvier", "F\xE9vrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Ao\xFBt", "Septembre", "Octobre", "Novembre", "D\xE9cembre"];
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const eventsByDay = {};
  for (const c of monthComps) if (c.date) eventsByDay[c.date] = (eventsByDay[c.date] ?? 0) + 1;
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayHeaders = dayNames.map((d) => `<div class="comp-cal-header-day">${d}</div>`).join("");
  let cells = "";
  for (let i = 0; i < startOffset; i++) cells += '<div class="comp-cal-day comp-cal-day--empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const count = eventsByDay[dateStr] ?? 0;
    let cls = "comp-cal-day";
    if (count > 0) cls += " comp-cal-day--has-events";
    if (selectedDate === dateStr) cls += " comp-cal-day--selected";
    const badge = count > 0 ? `<span class="comp-cal-day-badge">${count}</span>` : "";
    cells += `<div class="${cls}" data-date="${dateStr}"><span class="comp-cal-day-num">${d}</span>${badge}</div>`;
  }
  return `
    <div class="comp-calendar">
      <div class="comp-cal-nav">
        <button class="comp-cal-prev btn-secondary">\u2190 Pr\xE9c.</button>
        <span class="comp-cal-month-label">${monthNames[month]} ${year}</span>
        <button class="comp-cal-next btn-secondary">Suiv. \u2192</button>
      </div>
      <div class="comp-cal-grid">${dayHeaders}${cells}</div>
    </div>`;
}
function renderDayDetail(monthComps, date) {
  if (!date) return "";
  const isAdmin = _deps?.isAdminForUi?.() ?? false;
  const dayComps = monthComps.filter((c) => c.date === date);
  if (dayComps.length === 0) return "";
  const [y, m, d] = date.split("-");
  return `
    <div class="comp-day-detail">
      <h3 class="comp-day-detail-title">\u{1F4C5} \xC9v\xE9nements du ${d}/${m}/${y}</h3>
      <div class="comp-day-detail-list">${dayComps.map((c) => renderCompetitionCard(c, isAdmin)).join("")}</div>
    </div>`;
}
async function renderSection() {
  const container = document.getElementById("competitionsSection");
  if (!container) return;
  const isAdmin = _deps?.isAdminForUi?.() ?? false;
  if (_loading) {
    container.innerHTML = `<div class="comp-header"><h2>\u{1F4C5} Agenda</h2></div><div class="comp-status">Chargement\u2026</div>`;
    return;
  }
  const currentMonth = getCurrentMonth();
  const filtered = applyFilters(_competitions);
  const monthComps = getMonthCompetitions(filtered, currentMonth);
  const filtersHtml = renderFilters(_competitions, isAdmin);
  const calendarHtml = renderCalendar(monthComps, currentMonth, _selectedDate);
  const dayDetailHtml = renderDayDetail(monthComps, _selectedDate);
  const cardsHtml = monthComps.length > 0 ? monthComps.map((c) => renderCompetitionCard(c, isAdmin)).join("") : `<div class="comp-status comp-empty">Aucune comp\xE9tition ce mois.</div>`;
  container.innerHTML = `
    <div class="comp-header">
      <h2>\u{1F4C5} Agenda</h2>
      <p class="comp-subtitle">Source : <a href="https://www.judo-moselle.fr/evenement" target="_blank" rel="noopener">judo-moselle.fr</a></p>
    </div>
    ${filtersHtml}${calendarHtml}${dayDetailHtml}
    <div class="comp-list">${cardsHtml}</div>`;
  const niveauFilter = document.getElementById("compNiveauFilter");
  const categoryFilter = document.getElementById("compCategoryFilter");
  const typeFilter = document.getElementById("compTypeFilter");
  niveauFilter?.addEventListener("change", (e) => {
    _filteredNiveau = e.target.value;
    void renderSection();
  });
  categoryFilter?.addEventListener("change", (e) => {
    _filteredCategory = e.target.value;
    void renderSection();
  });
  typeFilter?.addEventListener("change", (e) => {
    _filteredType = e.target.value;
    void renderSection();
  });
  container.querySelector(".comp-cal-prev")?.addEventListener("click", () => {
    let { year, month } = _currentMonth ?? getCurrentMonth();
    month--;
    if (month < 0) {
      month = 11;
      year--;
    }
    _currentMonth = { year, month };
    _selectedDate = null;
    void renderSection();
  });
  container.querySelector(".comp-cal-next")?.addEventListener("click", () => {
    let { year, month } = _currentMonth ?? getCurrentMonth();
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    _currentMonth = { year, month };
    _selectedDate = null;
    void renderSection();
  });
  container.querySelectorAll(".comp-cal-day--has-events").forEach((el) => {
    el.addEventListener("click", () => {
      const date = el.dataset.date ?? null;
      _selectedDate = _selectedDate === date ? null : date;
      void renderSection();
    });
  });
  const syncBtn = document.getElementById("compSyncBtn");
  if (syncBtn && isAdmin) syncBtn.addEventListener("click", () => void handleSync());
  container.querySelectorAll(".comp-select-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const b = btn;
      const id = b.dataset.id ?? "";
      const currentSel = b.dataset.selected === "true";
      const newSelected = !currentSel;
      b.disabled = true;
      try {
        const token = _deps?.getCurrentAccessToken?.();
        await toggleClubSelected(id, newSelected, token);
        const comp = _competitions.find((c) => c.id === id);
        if (comp) comp.club_selected = newSelected;
        await renderSection();
      } catch (e) {
        alert(`Erreur : ${e.message}`);
        b.disabled = false;
      }
    });
  });
}
async function handleSync() {
  const syncBtn = document.getElementById("compSyncBtn");
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "\u23F3 Synchronisation\u2026";
  }
  try {
    const token = _deps?.getCurrentAccessToken?.();
    const result = await triggerSync(token);
    alert(`Synchronisation termin\xE9e : ${result.synced} ajout\xE9es/mises \xE0 jour, ${result.errors} erreurs, ${result.skipped} ignor\xE9es.`);
    await loadCompetitions();
  } catch (e) {
    alert(`Erreur de synchronisation : ${e.message}`);
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = "\u{1F504} Synchroniser";
    }
  }
}
async function loadCompetitions() {
  _loading = true;
  await renderSection();
  try {
    _competitions = await fetchCompetitions({ upcoming: true });
  } catch (e) {
    console.error("competitions-ui: loadCompetitions error", e);
    _competitions = [];
  } finally {
    _loading = false;
    await renderSection();
  }
}
async function showCompetitionsSection() {
  await loadCompetitions();
}
function hideCompetitionsSection() {
  const container = document.getElementById("competitionsSection");
  if (container) container.style.display = "none";
}
export {
  hideCompetitionsSection,
  initCompetitionsUi,
  showCompetitionsSection
};
