// members-list.ts — Onglet "Liste des membres" avec filtres, tri, colonnes

import { getMembers, getFfjCategory, esc, renderEditableName, wireEditButtons } from './members-core.ts';
import { openEditNameModal } from './members-modal.ts';
import type { HaMember } from './members-types.ts';

let _listDisciplines: Record<string, boolean> = { judo: true, iaido: true, taiso: true };
let _listSort = 'name-asc';
let _listSearch = '';
let _colsDropdownListenerAttached = false;
const _listColumns: Record<string, boolean> = {
  name: true, age: true, email: true, birth: true, amount: true, status: true, licence: true,
};

export async function renderListTab(): Promise<void> {
  const panel = document.getElementById('membersTabList');
  if (!panel) return;

  panel.innerHTML = `<div class="members-list-controls">
    <div class="members-search-row" style="margin-bottom:8px">
      <input type="text" id="membersListSearch" value="${esc(_listSearch)}"
        placeholder="Rechercher (nom, email, naissance, licence, discipline, statut...)"
        style="width:100%;max-width:440px;background:rgba(255,255,255,0.08);color:#e0e0e0;
          border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:5px 10px;
          font-size:0.85rem;font-weight:600">
    </div>
    <div class="members-filter-row" style="margin-bottom:0">
      <span style="display:flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:700;color:rgba(255,255,255,0.5)">
        Disciplines :
        <label class="members-disc-toggle ${_listDisciplines['judo']   ? 'active' : ''}"><input type="checkbox" data-disc="judo"  ${_listDisciplines['judo']   ? 'checked' : ''}> Judo</label>
        <label class="members-disc-toggle ${_listDisciplines['iaido']  ? 'active' : ''}"><input type="checkbox" data-disc="iaido" ${_listDisciplines['iaido']  ? 'checked' : ''}> Iaido</label>
        <label class="members-disc-toggle ${_listDisciplines['taiso']  ? 'active' : ''}"><input type="checkbox" data-disc="taiso" ${_listDisciplines['taiso']  ? 'checked' : ''}> Taiso</label>
      </span>
      <label style="display:flex;align-items:center;gap:4px;font-size:0.8rem;font-weight:600">
        Trier :
        <select id="membersFilterSort" class="members-filter-select">
          <option value="name-asc"${_listSort==='name-asc'   ?' selected':''}>Nom A-Z</option>
          <option value="name-desc"${_listSort==='name-desc' ?' selected':''}>Nom Z-A</option>
          <option value="age-asc"${_listSort==='age-asc'    ?' selected':''}>Age +</option>
          <option value="age-desc"${_listSort==='age-desc'   ?' selected':''}>Age -</option>
          <option value="status"${_listSort==='status'      ?' selected':''}>Non saisis d'abord</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:600;cursor:pointer">
        <input type="checkbox" id="membersUnsaisieList"> Non saisis seulement
      </label>
    </div>
    <div class="members-col-selector" style="position:relative;display:inline-block;margin-top:6px">
      <button id="membersColsBtn" class="members-col-btn"
        style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
          color:rgba(255,255,255,0.6);border-radius:4px;padding:2px 10px;font-size:0.78rem;
          font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        &#9776; Colonnes <span style="font-size:0.7rem;opacity:0.5">&#9660;</span>
      </button>
      <div id="membersColsDropdown" class="members-cols-dropdown"
        style="display:none;position:absolute;top:100%;left:0;z-index:100;
          background:#1e2433;border:1px solid rgba(255,255,255,0.12);border-radius:6px;
          padding:6px;min-width:140px;margin-top:4px;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
        ${(['name','age','email','birth','amount','status','licence'] as const).map((col) =>
          `<label class="members-col-toggle ${_listColumns[col]?'active':''}"><input type="checkbox" data-col="${col}" ${_listColumns[col]?'checked':''}> ${colLabel(col)}</label>`
        ).join('')}
      </div>
    </div>
  </div>`;

  wireListEvents(panel);
  renderListContent(panel);
}

function colLabel(col: string): string {
  const map: Record<string, string> = {
    name: 'Nom', age: 'Age', email: 'Email',
    birth: 'Naissance', amount: 'Montant', status: 'FFJDA', licence: 'Licence',
  };
  return map[col] ?? col;
}

function wireListEvents(panel: HTMLElement): void {
  const discToggles = panel.querySelectorAll('.members-disc-toggle input[type="checkbox"]');
  const sortSel     = document.getElementById('membersFilterSort') as HTMLSelectElement;
  const unsaisieChk = document.getElementById('membersUnsaisieList') as HTMLInputElement;
  const searchInput = document.getElementById('membersListSearch') as HTMLInputElement | null;
  const colsBtn     = document.getElementById('membersColsBtn') as HTMLButtonElement;
  const colsDropdown = document.getElementById('membersColsDropdown') as HTMLDivElement;

  discToggles.forEach((cb) => {
    cb.addEventListener('change', () => {
      const disc = (cb as HTMLInputElement).dataset.disc ?? '';
      const checked = (cb as HTMLInputElement).checked;
      (cb as HTMLInputElement).closest('.members-disc-toggle')?.classList.toggle('active', checked);
      if (disc) _listDisciplines[disc] = checked;
      renderListContent(panel);
    });
  });

  sortSel?.addEventListener('change', () => {
    _listSort = sortSel.value;
    renderListContent(panel);
  });

  unsaisieChk?.addEventListener('change', () => {
    const mainChk = document.getElementById('membersUnsaisieOnly') as HTMLInputElement;
    if (mainChk && mainChk !== unsaisieChk) mainChk.checked = unsaisieChk.checked;
    renderListContent(panel);
  });

  if (searchInput) {
    let t: ReturnType<typeof setTimeout>;
    searchInput.addEventListener('input', () => {
      _listSearch = searchInput.value;
      clearTimeout(t);
      t = setTimeout(() => renderListContent(panel), 200);
    });
  }

  colsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (colsDropdown) colsDropdown.style.display = colsDropdown.style.display === 'none' ? 'block' : 'none';
  });

  if (!_colsDropdownListenerAttached) {
    _colsDropdownListenerAttached = true;
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('membersColsDropdown');
      if (dropdown?.style.display !== 'none' && !(e.target as HTMLElement).closest('.members-col-selector')) {
        dropdown!.style.display = 'none';
      }
    });
  }

  colsDropdown?.querySelectorAll('.members-col-toggle input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const col = (cb as HTMLInputElement).dataset.col ?? '';
      const checked = (cb as HTMLInputElement).checked;
      (cb as HTMLInputElement).closest('.members-col-toggle')?.classList.toggle('active', checked);
      if (col in _listColumns) _listColumns[col] = checked;
      renderListContent(panel);
    });
  });
}

function renderListContent(panel: HTMLElement): void {
  const selectedDiscs = Object.entries(_listDisciplines).filter(([, v]) => v).map(([k]) => k);
  let filtered = getMembers();

  if (selectedDiscs.length > 0 && selectedDiscs.length < 3) {
    filtered = filtered.filter((m) => selectedDiscs.includes(m.discipline ?? 'judo'));
  }

  const unsaisieChk = document.getElementById('membersUnsaisieList') as HTMLInputElement | null;
  if (unsaisieChk?.checked) filtered = filtered.filter((m) => !m.raw_data?.saisie_ffjda);

  const q = _listSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((m) => {
      const cat = getFfjCategory(m.date_of_birth)?.label ?? '';
      const saisie = m.raw_data?.saisie_ffjda ? 'saisi oui ffjda' : 'a saisir non unsaisi';
      const haystack = [
        m.first_name, m.last_name, m.email, m.date_of_birth, m.discipline,
        m.ffjda_licence, m.raw_data?.ffjda_licence,
        m.membership_amount != null ? String(m.membership_amount) : '',
        cat, saisie,
      ].filter(Boolean).map(String).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  const existingArea = panel.querySelector('.members-list-area');
  if (existingArea) existingArea.remove();
  const area = document.createElement('div');
  area.className = 'members-list-area';

  if (filtered.length === 0) {
    const div = document.createElement('div');
    div.className = 'members-empty';
    div.textContent = 'Aucun membre correspondant aux filtres.';
    area.appendChild(div);
    panel.appendChild(area);
    return;
  }

  const sorted = sortMembers(filtered);
  const cols = { ..._listColumns };
  if (!Object.values(cols).some(Boolean)) cols['name'] = true;

  if (selectedDiscs.length > 0 && selectedDiscs.length < 3) {
    area.appendChild(createTable(sorted, cols));
  } else {
    const byDiscipline: Record<string, HaMember[]> = {};
    for (const m of sorted) {
      const disc = m.discipline ?? 'judo';
      if (!byDiscipline[disc]) byDiscipline[disc] = [];
      byDiscipline[disc].push(m);
    }
    for (const [disc, group] of Object.entries(byDiscipline)) {
      if (!group.length) continue;
      const h3 = document.createElement('h3');
      h3.style.cssText = 'font-size:0.95rem;font-weight:700;color:#e2b13c;margin:14px 0 6px';
      h3.textContent = `${disc.charAt(0).toUpperCase() + disc.slice(1)} (${group.length})`;
      area.appendChild(h3);
      area.appendChild(createTable(group, cols));
    }
  }

  panel.appendChild(area);
  wireEditButtons(area, (itemId, first, last) =>
    openEditNameModal(itemId, first, last, () => void renderListTab()));
}

function sortMembers(members: HaMember[]): HaMember[] {
  return [...members].sort((a, b) => {
    const aName = `${a.last_name ?? ''} ${a.first_name ?? ''}`;
    const bName = `${b.last_name ?? ''} ${b.first_name ?? ''}`;
    const getYear = (m: HaMember) =>
      m.date_of_birth ? parseInt(String(m.date_of_birth).match(/(\d{4})/)?.[1] ?? '0', 10) : 0;
    switch (_listSort) {
      case 'name-desc': return bName.localeCompare(aName, 'fr');
      case 'age-asc':   return getYear(b) - getYear(a);
      case 'age-desc':  return getYear(a) - getYear(b);
      case 'status':    return (a.raw_data?.saisie_ffjda ? 1 : 0) - (b.raw_data?.saisie_ffjda ? 1 : 0);
      default:          return aName.localeCompare(bName, 'fr');
    }
  });
}

function createTable(members: HaMember[], cols: Record<string, boolean>): HTMLDivElement {
  const table = document.createElement('table');
  table.className = 'members-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const colLabels: [string, string][] = [
    ['name','Nom'],['age','Age'],['email','Email'],
    ['birth','Naissance'],['amount','Montant'],['status','FFJDA'],['licence','Licence'],
  ];
  for (const [key, label] of colLabels) {
    if (cols[key]) { const th = document.createElement('th'); th.textContent = label; headerRow.appendChild(th); }
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const m of members) {
    const row = document.createElement('tr');
    const cells: [string, () => string][] = [
      ['name',    () => renderEditableName(m.helloasso_id ?? m.id, m.first_name, m.last_name)],
      ['age',     () => { const c = getFfjCategory(m.date_of_birth); return c ? `<span class="members-age-badge">${esc(c.label)}</span>` : '\u2014'; }],
      ['email',   () => esc(m.email ?? '')],
      ['birth',   () => esc(m.date_of_birth ?? '')],
      ['amount',  () => m.membership_amount != null ? Number(m.membership_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) : '\u2014'],
      ['status',  () => m.raw_data?.saisie_ffjda
        ? '<span style="background:rgba(76,175,80,0.2);color:#81c784;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">&#x2713; FFJDA</span>'
        : '<span style="background:rgba(244,67,54,0.2);color:#e57373;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600">A saisir</span>'],
      ['licence', () => esc(m.ffjda_licence ?? m.raw_data?.ffjda_licence ?? '')],
    ];
    for (const [key, fn] of cells) {
      if (cols[key]) { const td = document.createElement('td'); td.innerHTML = fn(); row.appendChild(td); }
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'members-table-wrap';
  wrap.appendChild(table);
  return wrap;
}
