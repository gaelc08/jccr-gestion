const FFJ_CATEGORIES = [
  { label: "Baby Judo", minYear: 2020, maxYear: 2099 },
  { label: "Mini-Poussin", minYear: 2018, maxYear: 2019 },
  { label: "Poussin", minYear: 2016, maxYear: 2017 },
  { label: "Benjamin", minYear: 2014, maxYear: 2015 },
  { label: "Minime", minYear: 2012, maxYear: 2013 },
  { label: "Cadet", minYear: 2009, maxYear: 2011 },
  { label: "Junior", minYear: 2006, maxYear: 2008 },
  { label: "Senior", minYear: 1996, maxYear: 2005 },
  { label: "Veteran", minYear: 0, maxYear: 1995 }
];
function getFfjCategory(dateOfBirth) {
  if (!dateOfBirth) return null;
  const yearMatch = String(dateOfBirth).match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  if (isNaN(year)) return null;
  for (const cat of FFJ_CATEGORIES) {
    if (year >= cat.minYear && year <= cat.maxYear) {
      return { label: cat.label, year };
    }
  }
  return null;
}
let _deps;
let _members = [];
let _lastSync = null;
let _activeTab = "list";
let _visible = false;
let _supabase;
let _listDisciplines = { judo: true, iaido: true, taiso: true };
let _listSort = "name-asc";
const _listColumns = {
  name: true,
  age: true,
  email: true,
  birth: true,
  amount: true,
  status: true,
  licence: true
};
function initMembersSection(deps) {
  _deps = deps;
  _supabase = deps.supabase;
}
let _membersVisible = false;
function showCalendarElements(show) {
  const els = [
    document.getElementById("coachSelectorGroup"),
    document.getElementById("monthSelect")?.closest("label"),
    document.getElementById("frozenBanner"),
    document.getElementById("calendar"),
    document.querySelector(".summary.card"),
    document.querySelector(".legend.card"),
    document.getElementById("coachGreeting")
  ];
  els.forEach((el) => {
    if (el) el.style.display = show ? "" : "none";
  });
}
function toggleMembersSection(show) {
  const section = document.getElementById("membersSection");
  if (!section) return;
  _membersVisible = show !== void 0 ? show : !_membersVisible;
  section.style.display = _membersVisible ? "block" : "none";
  showCalendarElements(!_membersVisible);
  const compSection = document.getElementById("competitionsSection");
  if (compSection && _membersVisible) {
    compSection.style.display = "none";
  }
  if (_membersVisible) {
    void loadAndRenderAll();
  }
}
function hideMembersSection() {
  toggleMembersSection(false);
}
async function loadAndRenderAll() {
  try {
    const [lastSync, members] = await Promise.all([
      _deps.getLastSyncTime(),
      _deps.getHelloAssoMembers()
    ]);
    _lastSync = lastSync;
    _members = members;
    void renderActiveTab();
    void updateToolbarInfo();
    void loadCampaigns();
  } catch (e) {
    console.error("Members load error:", e);
    const panel = document.getElementById("membersTabList");
    if (panel) panel.innerHTML = `<div class="members-empty">Erreur de chargement : ${_deps.escapeHtml(String(e.message || e))}</div>`;
  }
}
async function updateToolbarInfo() {
  const syncInfo = _lastSync ? `Derniere sync. : ${new Date(_lastSync).toLocaleString("fr-FR")}` : "Jamais synchronise";
  const syncEl = document.getElementById("membersSyncInfo");
  if (syncEl) syncEl.textContent = syncInfo;
  const total = _members.length;
  const unsaisis = _members.filter((m) => !m.raw_data?.saisie_ffjda).length;
  const counterEl = document.getElementById("membersCounter");
  if (counterEl) {
    counterEl.textContent = `${unsaisis}/${total} a saisir`;
    counterEl.style.color = unsaisis > 0 ? "#e57373" : "#81c784";
  }
}
async function loadCampaigns() {
  const sel = document.getElementById("membersCampaignSelect");
  if (!sel) return;
  try {
    const token = localStorage.getItem("jcc_api_token");
    if (!token) {
      sel.innerHTML = '<option value="">Token non configure</option>';
      return;
    }
    const r = await fetch("https://sync.judo-cattenom.fr/campaigns", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!r.ok) {
      sel.innerHTML = '<option value="">Erreur API</option>';
      return;
    }
    const data = await r.json();
    const campaigns = (data.campaigns ?? []).filter((c) => (c.type ?? "Membership") === "Membership" && c.slug.includes("adhesion"));
    sel.innerHTML = "";
    for (const c of campaigns) {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = c.slug.replace(/^adhesion-(\d{4})-(\d{4})-sport$/, "Saison $1/$2");
      if (c.slug === data.current) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Erreur: ' + _deps.escapeHtml(e.message) + "</option>";
  }
}
function switchTab(tabId) {
  _activeTab = tabId;
  document.querySelectorAll(".members-tab").forEach((t) => t.classList.remove("is-active"));
  document.querySelectorAll(".members-tab-panel").forEach((p) => p.classList.remove("is-active"));
  const tabEl = document.querySelector(`.members-tab[data-tab="${tabId}"]`);
  if (tabEl) tabEl.classList.add("is-active");
  const panel = document.getElementById(`membersTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (panel) panel.classList.add("is-active");
  void renderActiveTab();
}
async function renderActiveTab() {
  switch (_activeTab) {
    case "list":
      void renderListTab();
      break;
    case "age":
      void renderAgeTab();
      break;
    case "whatsapp":
      void renderWhatsappTab();
      break;
    case "mail":
      void renderMailTab();
      break;
    case "reconciliation":
      void renderReconciliationTab();
      break;
  }
}
function esc(v) {
  return _deps.escapeHtml(v);
}
function renderEditableName(itemId, firstName, lastName) {
  const ef = esc(firstName ?? "");
  const el = esc(lastName ?? "");
  const display = `${firstName ?? ""} ${lastName ?? ""}`.trim() || "\u2014";
  return `<span class="ha-name-display">
    ${esc(display)}
    <button class="ha-edit-btn" data-item-id="${esc(String(itemId))}"
      data-first="${ef}" data-last="${el}"
      style="border:none;background:none;cursor:pointer;font-size:11px;padding:0 4px;opacity:0;vertical-align:middle"
      title="Corriger le nom">\u270F\uFE0F</button>
  </span>`;
}
function openInlineEdit(itemId, currentFirst, currentLast) {
  const first = prompt("Prenom (HelloAsso) :", currentFirst);
  if (first === null) return;
  const last = prompt("Nom (HelloAsso) :", currentLast);
  if (last === null) return;
  void (async () => {
    try {
      await _deps.correctMemberName(itemId, first.trim(), last.trim());
      void loadAndRenderAll();
    } catch (e) {
      alert("Erreur : " + (e.message || e));
    }
  })();
}
function wireEditButtons(container) {
  container.querySelectorAll(".ha-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = btn;
      openInlineEdit(b.dataset.itemId, b.dataset.first ?? "", b.dataset.last ?? "");
    });
  });
}
async function renderListTab() {
  const panel = document.getElementById("membersTabList");
  if (!panel) return;
  panel.innerHTML = `<div class="members-list-controls">
    <div class="members-filter-row" style="margin-bottom:0">
      <span style="display:flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5)">
        Disciplines :
        <label class="members-disc-toggle ${_listDisciplines["judo"] ? "active" : ""}"><input type="checkbox" data-disc="judo" ${_listDisciplines["judo"] ? "checked" : ""}> Judo</label>
        <label class="members-disc-toggle ${_listDisciplines["iaido"] ? "active" : ""}"><input type="checkbox" data-disc="iaido" ${_listDisciplines["iaido"] ? "checked" : ""}> Iaido</label>
        <label class="members-disc-toggle ${_listDisciplines["taiso"] ? "active" : ""}"><input type="checkbox" data-disc="taiso" ${_listDisciplines["taiso"] ? "checked" : ""}> Taiso</label>
      </span>
      <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:600">
        Trier :
        <select id="membersFilterSort" class="members-filter-select">
          <option value="name-asc"${_listSort === "name-asc" ? " selected" : ""}>Nom A-Z</option>
          <option value="name-desc"${_listSort === "name-desc" ? " selected" : ""}>Nom Z-A</option>
          <option value="age-asc"${_listSort === "age-asc" ? " selected" : ""}>Age +</option>
          <option value="age-desc"${_listSort === "age-desc" ? " selected" : ""}>Age -</option>
          <option value="status"${_listSort === "status" ? " selected" : ""}>Non saisis d'abord</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:600;cursor:pointer">
        <input type="checkbox" id="membersUnsaisieList" ${document.getElementById("membersUnsaisieOnly")?.checked ? "checked" : ""}> Non saisis seulement
      </label>
    </div>
    <div class="members-col-selector" style="position:relative;display:inline-block;margin-top:6px">
      <button id="membersColsBtn" class="members-col-btn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:4px;padding:2px 10px;font-size:0.78rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        \u2630 Colonnes <span style="font-size:0.7rem;opacity:0.5">\u25BC</span>
      </button>
      <div id="membersColsDropdown" class="members-cols-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:100;background:#1e2433;border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px;min-width:140px;margin-top:4px;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
        <label class="members-col-toggle ${_listColumns["name"] ? "active" : ""}"><input type="checkbox" data-col="name" ${_listColumns["name"] ? "checked" : ""}> Nom</label>
        <label class="members-col-toggle ${_listColumns["age"] ? "active" : ""}"><input type="checkbox" data-col="age" ${_listColumns["age"] ? "checked" : ""}> Age</label>
        <label class="members-col-toggle ${_listColumns["email"] ? "active" : ""}"><input type="checkbox" data-col="email" ${_listColumns["email"] ? "checked" : ""}> Email</label>
        <label class="members-col-toggle ${_listColumns["birth"] ? "active" : ""}"><input type="checkbox" data-col="birth" ${_listColumns["birth"] ? "checked" : ""}> Naissance</label>
        <label class="members-col-toggle ${_listColumns["amount"] ? "active" : ""}"><input type="checkbox" data-col="amount" ${_listColumns["amount"] ? "checked" : ""}> Montant</label>
        <label class="members-col-toggle ${_listColumns["status"] ? "active" : ""}"><input type="checkbox" data-col="status" ${_listColumns["status"] ? "checked" : ""}> FFJDA</label>
        <label class="members-col-toggle ${_listColumns["licence"] ? "active" : ""}"><input type="checkbox" data-col="licence" ${_listColumns["licence"] ? "checked" : ""}> Licence</label>
      </div>
    </div>
  </div>`;
  const discToggles = panel.querySelectorAll('.members-disc-toggle input[type="checkbox"]');
  const sortSel = document.getElementById("membersFilterSort");
  const unsaisieChk = document.getElementById("membersUnsaisieList");
  const reRender = () => {
    void renderListContent(panel);
  };
  discToggles.forEach((cb) => {
    cb.addEventListener("change", () => {
      const disc = cb.dataset.disc ?? "";
      const checked = cb.checked;
      const label = cb.closest(".members-disc-toggle");
      if (label) label.classList.toggle("active", checked);
      if (disc) _listDisciplines[disc] = checked;
      void renderListContent(panel);
    });
  });
  sortSel?.addEventListener("change", () => {
    _listSort = sortSel?.value ?? "name-asc";
    void renderListContent(panel);
  });
  unsaisieChk?.addEventListener("change", () => {
    const mainChk = document.getElementById("membersUnsaisieOnly");
    if (mainChk && mainChk !== unsaisieChk) mainChk.checked = unsaisieChk.checked;
    void renderListContent(panel);
  });
  const colsBtn = document.getElementById("membersColsBtn");
  const colsDropdown = document.getElementById("membersColsDropdown");
  colsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (colsDropdown) {
      colsDropdown.style.display = colsDropdown.style.display === "none" ? "block" : "none";
    }
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (colsDropdown && colsDropdown.style.display !== "none" && !target.closest(".members-col-selector")) {
      colsDropdown.style.display = "none";
    }
  });
  const colToggles = (colsDropdown ?? panel).querySelectorAll('.members-col-toggle input[type="checkbox"]');
  colToggles.forEach((cb) => {
    cb.addEventListener("change", () => {
      const col = cb.dataset.col ?? "";
      const checked = cb.checked;
      const label = cb.closest(".members-col-toggle");
      if (label) label.classList.toggle("active", checked);
      if (col in _listColumns) {
        _listColumns[col] = checked;
      }
      void renderListContent(panel);
    });
  });
  void renderListContent(panel);
}
function renderListContent(panel) {
  const selectedDiscs = Object.entries(_listDisciplines).filter(([, v]) => v).map(([k]) => k);
  let filtered = _members;
  if (selectedDiscs.length > 0 && selectedDiscs.length < 3) {
    filtered = filtered.filter((m) => selectedDiscs.includes(m.discipline ?? "judo"));
  }
  const unsaisieChk = document.getElementById("membersUnsaisieList");
  if (unsaisieChk?.checked) {
    filtered = filtered.filter((m) => !m.raw_data?.saisie_ffjda);
  }
  if (filtered.length === 0) {
    appendTableHtml(panel, [], "Aucun membre correspondant aux filtres.");
    return;
  }
  const sorted = [...filtered].sort((a, b) => {
    const aName = `${a.last_name ?? ""} ${a.first_name ?? ""}`;
    const bName = `${b.last_name ?? ""} ${b.first_name ?? ""}`;
    switch (_listSort) {
      case "name-desc":
        return bName.localeCompare(aName, "fr");
      case "age-asc": {
        const aYear = a.date_of_birth ? parseInt(String(a.date_of_birth).match(/(\d{4})/)?.[1] ?? "0", 10) : 0;
        const bYear = b.date_of_birth ? parseInt(String(b.date_of_birth).match(/(\d{4})/)?.[1] ?? "0", 10) : 0;
        return bYear - aYear;
      }
      case "age-desc": {
        const aYear = a.date_of_birth ? parseInt(String(a.date_of_birth).match(/(\d{4})/)?.[1] ?? "0", 10) : 0;
        const bYear = b.date_of_birth ? parseInt(String(b.date_of_birth).match(/(\d{4})/)?.[1] ?? "0", 10) : 0;
        return aYear - bYear;
      }
      case "status": {
        const aStatus = a.raw_data?.saisie_ffjda ? 1 : 0;
        const bStatus = b.raw_data?.saisie_ffjda ? 1 : 0;
        return aStatus - bStatus;
      }
      default:
        return aName.localeCompare(bName, "fr");
    }
  });
  const cols = { ..._listColumns };
  const hasAnyCol = Object.values(cols).some(Boolean);
  if (!hasAnyCol) cols["name"] = true;
  const existingArea = panel.querySelector(".members-list-area");
  if (existingArea) existingArea.remove();
  const area = document.createElement("div");
  area.className = "members-list-area";
  const selectedDiscsList = Object.entries(_listDisciplines).filter(([, v]) => v).map(([k]) => k);
  if (selectedDiscsList.length > 0 && selectedDiscsList.length < 3) {
    area.appendChild(createTable(sorted, cols));
  } else {
    const byDiscipline = {};
    for (const m of sorted) {
      const disc = m.discipline ?? "judo";
      if (!byDiscipline[disc]) byDiscipline[disc] = [];
      byDiscipline[disc].push(m);
    }
    for (const [disc, group] of Object.entries(byDiscipline)) {
      if (group.length === 0) continue;
      const discLabel = disc.charAt(0).toUpperCase() + disc.slice(1);
      const heading = document.createElement("h3");
      heading.style.cssText = "font-size:0.95rem;font-weight:700;color:#e2b13c;margin:14px 0 6px";
      heading.textContent = `${discLabel} (${group.length})`;
      area.appendChild(heading);
      area.appendChild(createTable(group, cols));
    }
  }
  panel.appendChild(area);
  wireEditButtons(area);
}
function createTable(members, cols) {
  const table = document.createElement("table");
  table.className = "members-table";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  const colLabels = [
    ["name", "Nom"],
    ["age", "Age"],
    ["email", "Email"],
    ["birth", "Naissance"],
    ["amount", "Montant"],
    ["status", "FFJDA"],
    ["licence", "Licence"]
  ];
  for (const [key, label] of colLabels) {
    if (cols[key]) {
      const th = document.createElement("th");
      th.textContent = label;
      tr.appendChild(th);
    }
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const m of members) {
    const row = document.createElement("tr");
    const cellValues = [
      ["name", () => renderEditableName(m.helloasso_id ?? m.id, m.first_name, m.last_name)],
      ["age", () => {
        const catInfo = getFfjCategory(m.date_of_birth);
        return catInfo ? `<span class="members-age-badge">${esc(catInfo.label)}</span>` : "\u2014";
      }],
      ["email", () => esc(m.email ?? "")],
      ["birth", () => esc(m.date_of_birth ?? "")],
      ["amount", () => m.membership_amount != null ? `${Number(m.membership_amount).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}` : "\u2014"],
      ["status", () => {
        const saisie = m.raw_data?.saisie_ffjda;
        return saisie ? '<span style="background:rgba(76,175,80,0.2);color:#81c784;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">\u2713 FFJDA</span>' : '<span style="background:rgba(244,67,54,0.2);color:#e57373;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">A saisir</span>';
      }],
      ["licence", () => esc(m.ffjda_licence ?? m.raw_data?.ffjda_licence ?? "")]
    ];
    for (const [key, fn] of cellValues) {
      if (cols[key]) {
        const td = document.createElement("td");
        td.innerHTML = fn();
        row.appendChild(td);
      }
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  const wrap = document.createElement("div");
  wrap.className = "members-table-wrap";
  wrap.appendChild(table);
  return wrap;
}
function appendTableHtml(panel, _members2, emptyMsg) {
  const existingArea = panel.querySelector(".members-list-area");
  if (existingArea) existingArea.remove();
  const area = document.createElement("div");
  area.className = "members-list-area";
  const div = document.createElement("div");
  div.className = "members-empty";
  div.textContent = emptyMsg ?? "Aucun membre.";
  area.appendChild(div);
  panel.appendChild(area);
}
async function renderAgeTab() {
  const panel = document.getElementById("membersTabAge");
  if (!panel) return;
  if (_members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }
  const byCategory = {};
  for (const m of _members) {
    const cat = getFfjCategory(m.date_of_birth);
    const key = cat?.label ?? "Inconnu";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(m);
  }
  const orderedCats = [...FFJ_CATEGORIES.map((c) => c.label), "Inconnu"];
  const sortedCats = orderedCats.filter((c) => byCategory[c]);
  let html = '<div class="members-category-grid">';
  for (const cat of sortedCats) {
    const group = byCategory[cat];
    if (!group || group.length === 0) continue;
    const sorted = [...group].sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr"));
    const saisieCount = group.filter((m) => m.raw_data?.saisie_ffjda).length;
    const statusColor = saisieCount === group.length ? "#81c784" : saisieCount > 0 ? "#ffb74d" : "#e57373";
    html += `<div class="members-category-card">
      <h3>${esc(cat)} <span class="members-category-count">${group.length} membres</span></h3>
      <div style="font-size:0.78rem;color:${statusColor};margin-bottom:8px;font-weight:600">
        ${saisieCount}/${group.length} saisie(s) FFJDA
      </div>
      <ul class="members-category-list">`;
    for (const m of sorted) {
      const dot = m.raw_data?.saisie_ffjda ? '<span class="member-status-dot saisi" title="Saisi FFJDA"></span>' : '<span class="member-status-dot unsaisi" title="A saisir"></span>';
      const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "?";
      html += `<li>${dot} ${esc(name)}</li>`;
    }
    html += `</ul></div>`;
  }
  html += "</div>";
  if (sortedCats.length === 0) {
    html = '<div class="members-empty">Aucune categorie d age determinee (date de naissance manquante).</div>';
  }
  panel.innerHTML = html;
}
async function renderWhatsappTab() {
  const panel = document.getElementById("membersTabWhatsapp");
  if (!panel) return;
  if (_members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }
  const byDiscipline = { judo: [], iaido: [], taiso: [] };
  for (const m of _members) {
    const disc = m.discipline ?? "judo";
    if (byDiscipline[disc]) byDiscipline[disc].push(m);
    else byDiscipline.judo.push(m);
  }
  let html = '<div class="members-group-grid">';
  for (const [disc, group] of Object.entries(byDiscipline)) {
    if (group.length === 0) continue;
    const discLabel = disc.charAt(0).toUpperCase() + disc.slice(1);
    const byAge = {};
    for (const m of group) {
      const cat = getFfjCategory(m.date_of_birth);
      const key = cat?.label ?? "Inconnu";
      if (!byAge[key]) byAge[key] = [];
      byAge[key].push(m);
    }
    const allSorted = [...group].sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr"));
    const allNames = allSorted.map((m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()).filter(Boolean);
    html += `<div class="members-group-card">
      <h3>${discLabel} \u2014 Tous les cours</h3>
      <div class="group-count">${group.length} membres</div>
      <ul class="group-contacts">
        ${allSorted.slice(0, 15).map((m) => `<li>${esc(`${m.first_name ?? ""} ${m.last_name ?? ""}`)} ${m.email ? `<span style="color:rgba(255,255,255,0.4);font-size:0.75rem">(${esc(m.email)})</span>` : ""}</li>`).join("")}
        ${allSorted.length > 15 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${allSorted.length - 15} autre(s)</li>` : ""}
      </ul>
      <div class="group-actions">
        <button class="group-action-copy" data-contacts="${esc(allNames.join(", "))}" data-label="${esc(discLabel)} - Tous">Copier les noms</button>
      </div>
    </div>`;
    const orderedCats = FFJ_CATEGORIES.map((c) => c.label);
    for (const cat of orderedCats) {
      const subGroup = byAge[cat];
      if (!subGroup || subGroup.length === 0) continue;
      const sorted = [...subGroup].sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? "", "fr"));
      const nameList = sorted.map((m) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()).filter(Boolean);
      html += `<div class="members-group-card">
        <h3>${esc(discLabel)} \u2014 ${esc(cat)}</h3>
        <div class="group-count">${subGroup.length} membres</div>
        <ul class="group-contacts">
          ${sorted.map((m) => `<li>${esc(`${m.first_name ?? ""} ${m.last_name ?? ""}`)} ${m.email ? `<span style="color:rgba(255,255,255,0.4);font-size:0.75rem">(${esc(m.email)})</span>` : ""}</li>`).join("")}
        </ul>
        <div class="group-actions">
          <button class="group-action-copy" data-contacts="${esc(nameList.join(", "))}" data-label="${esc(`${discLabel} - ${cat}`)}">Copier les noms</button>
        </div>
      </div>`;
    }
  }
  html += "</div>";
  if (Object.values(byDiscipline).every((g) => g.length === 0)) {
    html = '<div class="members-empty">Aucun groupe a afficher.</div>';
  }
  panel.innerHTML = html;
  panel.querySelectorAll(".group-action-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn;
      const contacts = b.dataset.contacts ?? "";
      const label = b.dataset.label ?? "";
      navigator.clipboard.writeText(contacts).then(() => {
        b.textContent = "Copie !";
        b.classList.add("copied");
        setTimeout(() => {
          b.textContent = "Copier les noms";
          b.classList.remove("copied");
        }, 2e3);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = contacts;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        b.textContent = "Copie !";
        b.classList.add("copied");
        setTimeout(() => {
          b.textContent = "Copier les noms";
          b.classList.remove("copied");
        }, 2e3);
      });
    });
  });
}
async function renderMailTab() {
  const panel = document.getElementById("membersTabMail");
  if (!panel) return;
  if (_members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }
  const byCategory = {};
  const byDiscipline = { judo: [], iaido: [], taiso: [] };
  const bySaisie = { saisi: [], unsaisi: [] };
  for (const m of _members) {
    const cat = getFfjCategory(m.date_of_birth);
    const key = cat?.label ?? "Inconnu";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(m);
    const disc = m.discipline ?? "judo";
    if (byDiscipline[disc]) byDiscipline[disc].push(m);
    if (m.raw_data?.saisie_ffjda) bySaisie.saisi.push(m);
    else bySaisie.unsaisi.push(m);
  }
  const orderedCats = [...FFJ_CATEGORIES.map((c) => c.label), "Inconnu"].filter((c) => byCategory[c]);
  const allEmails = _members.map((m) => m.email).filter(Boolean);
  const mailtoAll = `mailto:?bcc=${allEmails.join(",")}&subject=Judo Club Cattenom Rodemack`;
  let html = `
    <div style="margin-bottom:16px">
      <div class="members-group-card" style="border-color:rgba(226,177,60,0.4)">
        <h3>Tous les membres</h3>
        <div class="group-count">${_members.length} membres \xB7 ${allEmails.length} emails</div>
        <div class="group-actions">
          <a href="${esc(mailtoAll)}" class="group-action-mailto" target="_blank">\u2709\uFE0F Envoyer un email a tous</a>
          <button class="group-action-copy" data-contacts="${esc(allEmails.join(", "))}" data-label="Tous">Copier les emails</button>
        </div>
      </div>
    </div>`;
  html += '<div class="members-group-grid">';
  for (const [disc, group] of Object.entries(byDiscipline)) {
    if (group.length === 0) continue;
    const discLabel = disc.charAt(0).toUpperCase() + disc.slice(1);
    const emails = group.map((m) => m.email).filter(Boolean);
    const mailto = `mailto:?bcc=${emails.join(",")}&subject=Judo Club Cattenom Rodemack - ${discLabel}`;
    html += `<div class="members-group-card">
      <h3>${esc(discLabel)}</h3>
      <div class="group-count">${group.length} membres \xB7 ${emails.length} emails</div>
      <ul class="group-contacts">
        ${group.slice(0, 10).map((m) => `<li>${esc(`${m.first_name ?? ""} ${m.last_name ?? ""}`)} ${m.email ? `<span style="color:rgba(255,255,255,0.4)">(${esc(m.email)})</span>` : ""}</li>`).join("")}
        ${group.length > 10 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${group.length - 10} autre(s)</li>` : ""}
      </ul>
      <div class="group-actions">
        <a href="${esc(mailto)}" class="group-action-mailto" target="_blank">\u2709\uFE0F Envoyer</a>
        <button class="group-action-copy" data-contacts="${esc(emails.join(", "))}" data-label="${esc(discLabel)}">Copier les emails</button>
      </div>
    </div>`;
  }
  for (const cat of orderedCats) {
    const group = byCategory[cat];
    if (!group || group.length === 0) continue;
    const emails = group.map((m) => m.email).filter(Boolean);
    const mailto = `mailto:?bcc=${emails.join(",")}&subject=Judo Club Cattenom Rodemack - ${cat}`;
    html += `<div class="members-group-card">
      <h3>${esc(cat)}</h3>
      <div class="group-count">${group.length} membres \xB7 ${emails.length} emails</div>
      <ul class="group-contacts">
        ${group.slice(0, 10).map((m) => `<li>${esc(`${m.first_name ?? ""} ${m.last_name ?? ""}`)} ${m.email ? `<span style="color:rgba(255,255,255,0.4)">(${esc(m.email)})</span>` : ""}</li>`).join("")}
        ${group.length > 10 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${group.length - 10} autre(s)</li>` : ""}
      </ul>
      <div class="group-actions">
        <a href="${esc(mailto)}" class="group-action-mailto" target="_blank">\u2709\uFE0F Envoyer</a>
        <button class="group-action-copy" data-contacts="${esc(emails.join(", "))}" data-label="${esc(cat)}">Copier les emails</button>
      </div>
    </div>`;
  }
  for (const [status, group] of Object.entries(bySaisie)) {
    if (group.length === 0) continue;
    const label = status === "saisi" ? "Saisis FFJDA" : "Non saisis FFJDA";
    const emails = group.map((m) => m.email).filter(Boolean);
    const mailto = `mailto:?bcc=${emails.join(",")}&subject=Judo Club Cattenom Rodemark - ${label}`;
    html += `<div class="members-group-card">
      <h3>${esc(label)}</h3>
      <div class="group-count">${group.length} membres \xB7 ${emails.length} emails</div>
      <ul class="group-contacts">
        ${group.slice(0, 10).map((m) => `<li>${esc(`${m.first_name ?? ""} ${m.last_name ?? ""}`)} ${m.email ? `<span style="color:rgba(255,255,255,0.4)">(${esc(m.email)})</span>` : ""}</li>`).join("")}
        ${group.length > 10 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${group.length - 10} autre(s)</li>` : ""}
      </ul>
      <div class="group-actions">
        <a href="${esc(mailto)}" class="group-action-mailto" target="_blank">\u2709\uFE0F Envoyer</a>
        <button class="group-action-copy" data-contacts="${esc(emails.join(", "))}" data-label="${esc(label)}">Copier les emails</button>
      </div>
    </div>`;
  }
  html += "</div>";
  if (allEmails.length === 0) {
    html = '<div class="members-empty">Aucun email disponible. Importez d abord les donnees HelloAsso.</div>';
  }
  panel.innerHTML = html;
  panel.querySelectorAll(".group-action-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn;
      const contacts = b.dataset.contacts ?? "";
      navigator.clipboard.writeText(contacts).then(() => {
        b.textContent = "Copie !";
        b.classList.add("copied");
        setTimeout(() => {
          b.textContent = "Copier les emails";
          b.classList.remove("copied");
        }, 2e3);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = contacts;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        b.textContent = "Copie !";
        b.classList.add("copied");
        setTimeout(() => {
          b.textContent = "Copier les emails";
          b.classList.remove("copied");
        }, 2e3);
      });
    });
  });
}
function wireToolbarEvents() {
  const tabsContainer = document.getElementById("membersTabs");
  if (tabsContainer) {
    tabsContainer.addEventListener("click", (e) => {
      const tab = e.target?.closest(".members-tab");
      if (tab && tab.dataset.tab) {
        switchTab(tab.dataset.tab);
      }
    });
  }
  const syncBtn = document.getElementById("syncMembersBtn");
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = "Synchronisation...";
      try {
        await _deps.syncHelloAssoMembers();
      } catch (e) {
        alert("Erreur synchronisation : " + (e.message || e));
      } finally {
        await loadAndRenderAll();
        syncBtn.disabled = false;
        syncBtn.textContent = "Synchroniser";
      }
    };
  }
  const sel = document.getElementById("membersCampaignSelect");
  if (sel) {
    sel.onchange = async () => {
      const slug = sel.value;
      if (!slug) return;
      try {
        const token = localStorage.getItem("jcc_api_token");
        await fetch("https://sync.judo-cattenom.fr/campaigns/current", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ form_slug: slug })
        });
      } catch {
      }
      await loadAndRenderAll();
    };
  }
  const filterChk = document.getElementById("membersUnsaisieOnly");
  if (filterChk) {
    filterChk.onchange = () => {
      if (_activeTab === "list") void renderListTab();
    };
  }
  const csvInput = document.getElementById("membersCsvInput");
  if (csvInput) {
    csvInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = _deps.parseHelloAssoCsv(text);
        if (rows.length === 0) {
          alert("Aucune donnee trouvee dans le CSV.");
          return;
        }
        const withDob = rows.filter((r) => r.date_of_birth);
        if (withDob.length === 0) {
          alert('Le CSV ne contient pas de colonne "date de naissance".');
          return;
        }
        const { updated, notFound } = await _deps.importHelloAssoCsvData(_supabase, withDob);
        let msg = `${updated} date(s) de naissance importee(s).`;
        if (notFound.length > 0) msg += `
${notFound.length} email(s) non trouve(s).`;
        alert(msg);
        await loadAndRenderAll();
      } catch (err) {
        alert("Erreur import CSV : " + (err.message || err));
      }
      csvInput.value = "";
    };
  }
  const ffjdaInput = document.getElementById("membersFfjdaCsvInput");
  if (ffjdaInput) {
    ffjdaInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = await _deps.importFfjdaCsv(text);
        let msg = `${result.matched}/${result.total} adherents marques comme saisis.`;
        if (result.not_found > 0) msg += `
${result.not_found} non trouve(s).`;
        alert(msg);
        await loadAndRenderAll();
      } catch (err) {
        const msg = err?.message ?? err?.detail ?? String(err);
        alert("Erreur import FFJDA : " + msg);
      }
      ffjdaInput.value = "";
    };
  }
  const reconBtn = document.getElementById("membersReconBtn");
  if (reconBtn) {
    reconBtn.onclick = () => {
      const tab = document.querySelector('.members-tab[data-tab="reconciliation"]');
      if (tab) tab.click();
    };
  }
  const tokenInput = document.getElementById("membersTokenInput");
  const saveBtn = document.getElementById("membersTokenSave");
  const testBtn = document.getElementById("membersTokenTest");
  const statusEl = document.getElementById("membersTokenStatus");
  if (tokenInput) {
    tokenInput.value = localStorage.getItem("jcc_api_token") ?? "";
  }
  saveBtn?.addEventListener("click", () => {
    if (!tokenInput) return;
    const token = tokenInput.value.trim();
    if (token) {
      localStorage.setItem("jcc_api_token", token);
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.textContent = "Token enregistre";
        statusEl.style.color = "#28a745";
      }
    } else {
      localStorage.removeItem("jcc_api_token");
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.textContent = "Token supprime";
        statusEl.style.color = "#17a2b8";
      }
    }
  });
  testBtn?.addEventListener("click", async () => {
    if (!tokenInput || !statusEl) return;
    const token = tokenInput.value.trim();
    if (!token) {
      statusEl.style.display = "block";
      statusEl.textContent = "Aucun token a tester";
      statusEl.style.color = "#ffc107";
      return;
    }
    statusEl.style.display = "block";
    statusEl.textContent = "Test en cours...";
    statusEl.style.color = "#17a2b8";
    try {
      const resp = await fetch("https://sync.judo-cattenom.fr/stats", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        statusEl.textContent = `Connexion OK \u2014 ${data.paid ?? "?"} adherents`;
        statusEl.style.color = "#28a745";
      } else {
        statusEl.textContent = `Erreur ${resp.status}: ${resp.statusText}`;
        statusEl.style.color = "#dc3545";
      }
    } catch (err) {
      statusEl.textContent = `Erreur reseau: ${err.message}`;
      statusEl.style.color = "#dc3545";
    }
  });
}
async function renderReconciliationTab() {
  const panel = document.getElementById("membersTabReconciliation");
  if (!panel) return;
  panel.innerHTML = '<div class="members-empty" style="padding:20px;text-align:center">Chargement de la reconciliation...</div>';
  try {
    const data = await _deps.getReconciliation();
    if (!data?.reconciliation) {
      panel.innerHTML = `<div class="members-empty">Aucune donnee de reconciliation. Importez d abord un CSV FFJDA (bouton "CSV FFJDO" dans la barre d'outils).</div>`;
      return;
    }
    const rec = data.reconciliation;
    const matched = data.matched || 0;
    const nameMismatch = data.name_mismatch || 0;
    const corrected = data.corrected || 0;
    const unmatched = data.unmatched || 0;
    const ffjdaOnly = data.ffjda_only || 0;
    const totalHa = data.total_ha || 0;
    const totalFfjda = data.total_ffjda || 0;
    let html = `
      <div class="members-stats-bar" style="margin-bottom:12px">
        <span class="members-stat matched">\u2705 <strong>${matched}</strong> match</span>
        <span class="members-stat mismatch">\u26A0\uFE0F <strong>${nameMismatch}</strong> nom diff.</span>
        <span class="members-stat corrected">\u270F\uFE0F <strong>${corrected}</strong> corrige</span>
        <span class="members-stat unmatched">\u274C <strong>${unmatched}</strong> non matche</span>
        <span class="members-stat ffjda-only">\u{1F195} <strong>${ffjdaOnly}</strong> FFJDA seul</span>
        <span style="margin-left:auto;color:rgba(255,255,255,0.5);font-size:0.82rem">${totalHa} HA \xB7 ${totalFfjda} FFJDA</span>
      </div>
      <div class="members-table-wrap" style="max-height:55vh">
        <table class="members-table" style="font-size:0.8rem">
          <thead><tr>
            <th>HelloAsso</th><th>FFJDA</th><th>Email HA</th><th>Email FFJDA</th>
            <th>Naiss. HA</th><th>Naiss. FFJDA</th><th>Licence</th><th>Statut</th>
          </tr></thead>
          <tbody>`;
    for (const r of rec) {
      const status = String(r.status ?? "");
      const statusBadge = getStatusHtml(status);
      const haName = r.ha_first_name || r.ha_last_name ? renderEditableName(r.item_id, r.ha_first_name, r.ha_last_name) : "\u2014";
      const ffjdaName = r.ffjda_first_name || r.ffjda_last_name ? `${esc(r.ffjda_first_name)} ${esc(r.ffjda_last_name)}` : "\u2014";
      html += `<tr>
        <td>${haName}</td><td>${ffjdaName}</td>
        <td style="font-size:0.78rem">${r.ha_email ? esc(r.ha_email) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_email ? esc(r.ffjda_email) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ha_dob ? esc(r.ha_dob) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_dob ? esc(r.ffjda_dob) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_licence ? esc(r.ffjda_licence) : "\u2014"}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    panel.innerHTML = html;
    panel.querySelectorAll(".ha-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = btn;
        openInlineEdit(b.dataset.itemId, b.dataset.first ?? "", b.dataset.last ?? "");
      });
    });
  } catch (e) {
    console.error("Reconciliation render error:", e);
    panel.innerHTML = `<div class="members-empty">Erreur : ${esc(String(e))}</div>`;
  }
}
async function loadReconciliationContent() {
  const content = document.getElementById("reconciliationContent");
  if (!content) return;
  try {
    const data = await _deps.getReconciliation();
    if (!data?.reconciliation) {
      content.innerHTML = '<p class="audit-status">Aucune donnee de reconciliation. Importez d abord un CSV FFJDA.</p>';
      return;
    }
    const rec = data.reconciliation;
    const matched = data.matched || 0;
    const nameMismatch = data.name_mismatch || 0;
    const corrected = data.corrected || 0;
    const unmatched = data.unmatched || 0;
    const ffjdaOnly = data.ffjda_only || 0;
    const totalHa = data.total_ha || 0;
    const totalFfjda = data.total_ffjda || 0;
    const statsHtml = `
      <div class="members-stats-bar">
        <span class="members-stat matched">\u2705 <strong>${matched}</strong> match</span>
        <span class="members-stat mismatch">\u26A0\uFE0F <strong>${nameMismatch}</strong> nom diff.</span>
        <span class="members-stat corrected">\u270F\uFE0F <strong>${corrected}</strong> corrige</span>
        <span class="members-stat unmatched">\u274C <strong>${unmatched}</strong> non matche</span>
        <span class="members-stat ffjda-only">\u{1F195} <strong>${ffjdaOnly}</strong> FFJDA seul</span>
        <span style="margin-left:auto;color:rgba(255,255,255,0.5);font-size:0.82rem">${totalHa} HA \xB7 ${totalFfjda} FFJDA</span>
      </div>`;
    const rows = rec.map((r) => {
      const status = String(r.status ?? "");
      const statusBadge = getStatusHtml(status);
      const haName = r.ha_first_name || r.ha_last_name ? renderEditableName(r.item_id, r.ha_first_name, r.ha_last_name) : "\u2014";
      const ffjdaName = r.ffjda_first_name || r.ffjda_last_name ? `${esc(r.ffjda_first_name)} ${esc(r.ffjda_last_name)}` : "\u2014";
      return `<tr>
        <td>${haName}</td><td>${ffjdaName}</td>
        <td style="font-size:0.78rem">${r.ha_email ? esc(r.ha_email) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_email ? esc(r.ffjda_email) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ha_dob ? esc(r.ha_dob) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_dob ? esc(r.ffjda_dob) : "\u2014"}</td>
        <td style="font-size:0.78rem">${r.ffjda_licence ? esc(r.ffjda_licence) : "\u2014"}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join("");
    content.innerHTML = statsHtml + `
      <div class="members-table-wrap" style="max-height:55vh">
        <table class="members-table" style="font-size:0.8rem">
          <thead><tr>
            <th>HelloAsso</th><th>FFJDA</th><th>Email HA</th><th>Email FFJDA</th>
            <th>Naiss. HA</th><th>Naiss. FFJDA</th><th>Licence</th><th>Statut</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    content.querySelectorAll(".ha-edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = btn;
        openInlineEdit(b.dataset.itemId, b.dataset.first ?? "", b.dataset.last ?? "");
      });
    });
  } catch (e) {
    console.error("Reconciliation load error:", e);
    content.innerHTML = `<div class="members-empty">Erreur : ${esc(String(e))}</div>`;
  }
}
function getStatusHtml(status) {
  const styles = {
    "matched": "background:rgba(76,175,80,0.2);color:#81c784;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600",
    "name_mismatch": "background:rgba(255,152,0,0.2);color:#ffb74d;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600",
    "corrected": "background:rgba(76,175,80,0.15);color:#a5d6a7;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600",
    "unmatched": "background:rgba(244,67,54,0.2);color:#e57373;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600",
    "ffjda_only": "background:rgba(156,39,176,0.2);color:#ce93d8;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600"
  };
  const labels = {
    "matched": "\u2705 Match",
    "name_mismatch": "\u26A0\uFE0F Nom diff.",
    "corrected": "\u270F\uFE0F Corrige",
    "unmatched": "\u274C Non matche",
    "ffjda_only": "\u{1F195} FFJDA seul"
  };
  const style = styles[status] || "background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600";
  const label = labels[status] || esc(status);
  return `<span style="${style}">${label}</span>`;
}
function bootMembersSection() {
  wireToolbarEvents();
}
export {
  bootMembersSection,
  hideMembersSection,
  initMembersSection,
  toggleMembersSection
};
