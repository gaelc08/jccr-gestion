// members-mail.ts — Onglet "Envois groupes" (mailto)

import { getMembers, getFfjCategory, FFJ_CATEGORIES, esc } from './members-core.ts';

export async function renderMailTab(): Promise<void> {
  const panel = document.getElementById('membersTabMail');
  if (!panel) return;

  const members = getMembers();
  if (members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }

  const byCategory:   Record<string, typeof members> = {};
  const byDiscipline: Record<string, typeof members> = { judo: [], iaido: [], taiso: [] };
  const bySaisie:     Record<string, typeof members> = { saisi: [], unsaisi: [] };

  for (const m of members) {
    const key  = getFfjCategory(m.date_of_birth)?.label ?? 'Inconnu';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(m);
    const disc = m.discipline ?? 'judo';
    if (byDiscipline[disc]) byDiscipline[disc].push(m);
    (m.raw_data?.saisie_ffjda ? bySaisie.saisi : bySaisie.unsaisi).push(m);
  }

  const orderedCats = [...FFJ_CATEGORIES.map((c) => c.label), 'Inconnu'].filter((c) => byCategory[c]);
  const allEmails   = members.map((m) => m.email).filter(Boolean) as string[];

  if (allEmails.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun email disponible. Importez d abord les données HelloAsso.</div>';
    return;
  }

  const mailtoAll = `mailto:?bcc=${allEmails.join(',')}&subject=Judo Club Cattenom Rodemack`;
  let html = `<div style="margin-bottom:16px">
    <div class="members-group-card" style="border-color:rgba(226,177,60,0.4)">
      <h3>Tous les membres</h3>
      <div class="group-count">${members.length} membres · ${allEmails.length} emails</div>
      <div class="group-actions">
        <a href="${esc(mailtoAll)}" class="group-action-mailto" target="_blank">✉️ Envoyer un email à tous</a>
        <button class="group-action-copy" data-contacts="${esc(allEmails.join(', '))}">Copier les emails</button>
      </div>
    </div>
  </div><div class="members-group-grid">`;

  const addGroup = (label: string, group: typeof members, subject: string) => {
    const emails  = group.map((m) => m.email).filter(Boolean) as string[];
    const mailto  = `mailto:?bcc=${emails.join(',')}&subject=Judo Club Cattenom Rodemack - ${subject}`;
    html += `<div class="members-group-card">
      <h3>${esc(label)}</h3>
      <div class="group-count">${group.length} membres · ${emails.length} emails</div>
      <ul class="group-contacts">
        ${group.slice(0, 10).map((m) =>
          `<li>${esc(`${m.first_name ?? ''} ${m.last_name ?? ''}`)}${m.email ? ` <span style="color:rgba(255,255,255,0.4)">(${esc(m.email)})</span>` : ''}</li>`
        ).join('')}
        ${group.length > 10 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${group.length - 10} autre(s)</li>` : ''}
      </ul>
      <div class="group-actions">
        <a href="${esc(mailto)}" class="group-action-mailto" target="_blank">✉️ Envoyer</a>
        <button class="group-action-copy" data-contacts="${esc(emails.join(', '))}">Copier les emails</button>
      </div>
    </div>`;
  };

  for (const [disc, group] of Object.entries(byDiscipline)) {
    if (group.length) addGroup(disc.charAt(0).toUpperCase() + disc.slice(1), group, disc);
  }
  for (const cat of orderedCats) {
    if (byCategory[cat]?.length) addGroup(cat, byCategory[cat], cat);
  }
  addGroup('Saisis FFJDA',     bySaisie.saisi,   'Saisis FFJDA');
  addGroup('Non saisis FFJDA', bySaisie.unsaisi, 'Non saisis FFJDA');

  html += '</div>';
  panel.innerHTML = html;

  panel.querySelectorAll('.group-action-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = btn as HTMLButtonElement;
      const text = b.dataset.contacts ?? '';
      navigator.clipboard.writeText(text).then(() => {
        b.textContent = 'Copié !';
        b.classList.add('copied');
        setTimeout(() => { b.textContent = 'Copier les emails'; b.classList.remove('copied'); }, 2000);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        b.textContent = 'Copié !';
        b.classList.add('copied');
        setTimeout(() => { b.textContent = 'Copier les emails'; b.classList.remove('copied'); }, 2000);
      });
    });
  });
}
