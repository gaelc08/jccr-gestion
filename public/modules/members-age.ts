// members-age.ts — Onglet "Par catégorie d'âge"

import { getMembers, getFfjCategory, FFJ_CATEGORIES, esc } from './members-core.ts';

export async function renderAgeTab(): Promise<void> {
  const panel = document.getElementById('membersTabAge');
  if (!panel) return;

  const members = getMembers();
  if (members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }

  const byCategory: Record<string, typeof members> = {};
  for (const m of members) {
    const key = getFfjCategory(m.date_of_birth)?.label ?? 'Inconnu';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(m);
  }

  const orderedCats = [...FFJ_CATEGORIES.map((c) => c.label), 'Inconnu'].filter((c) => byCategory[c]);

  if (orderedCats.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucune catégorie d âge déterminée (date de naissance manquante).</div>';
    return;
  }

  let html = '<div class="members-category-grid">';
  for (const cat of orderedCats) {
    const group = byCategory[cat];
    const sorted = [...group].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr'));
    const saisieCount = group.filter((m) => m.raw_data?.saisie_ffjda).length;
    const statusColor = saisieCount === group.length ? '#81c784' : saisieCount > 0 ? '#ffb74d' : '#e57373';

    html += `<div class="members-category-card">
      <h3>${esc(cat)} <span class="members-category-count">${group.length} membres</span></h3>
      <div style="font-size:0.78rem;color:${statusColor};margin-bottom:8px;font-weight:600">
        ${saisieCount}/${group.length} saisie(s) FFJDA
      </div>
      <ul class="members-category-list">`;

    for (const m of sorted) {
      const dot = m.raw_data?.saisie_ffjda
        ? '<span class="member-status-dot saisi" title="Saisi FFJDA"></span>'
        : '<span class="member-status-dot unsaisi" title="A saisir"></span>';
      const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || '?';
      html += `<li>${dot} ${esc(name)}</li>`;
    }
    html += `</ul></div>`;
  }
  html += '</div>';
  panel.innerHTML = html;
}
