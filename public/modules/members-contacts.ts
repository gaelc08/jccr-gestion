// members-contacts.ts — Onglet "Contacts & groupes"
// Fusion des anciens onglets "Groupes WhatsApp" (copie de noms) et
// "Envois groupés" (mailto / copie d'emails). Chaque groupe expose les deux.

import { getMembers, getFfjCategory, FFJ_CATEGORIES, esc } from './members-core.ts';
import type { HaMember } from './members-types.ts';

const MAIL_SUBJECT = 'Judo Club Cattenom Rodemack';

export async function renderContactsTab(): Promise<void> {
  const panel = document.getElementById('membersTabContacts');
  if (!panel) return;

  const members = getMembers();
  if (members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d’abord.</div>';
    return;
  }

  // ── Regroupements ──
  const byDiscipline: Record<string, HaMember[]> = { judo: [], iaido: [], taiso: [] };
  const byCategory:   Record<string, HaMember[]> = {};
  const bySaisie:     Record<string, HaMember[]> = { saisi: [], unsaisi: [] };

  for (const m of members) {
    const disc = m.discipline ?? (m.source === 'ffjda' ? 'ffjda' : 'judo');
    (byDiscipline[disc] ??= []).push(m);
    const cat = getFfjCategory(m.date_of_birth)?.label ?? 'Inconnu';
    (byCategory[cat] ??= []).push(m);
    (m.raw_data?.saisie_ffjda ? bySaisie.saisi : bySaisie.unsaisi).push(m);
  }

  const orderedCats = [...FFJ_CATEGORIES.map((c) => c.label), 'Inconnu'].filter((c) => byCategory[c]?.length);
  const allEmails   = uniqueEmails(members);

  let html = `<div style="margin-bottom:16px">
    ${groupCard('Tous les membres', members, MAIL_SUBJECT, true)}
  </div>`;

  html += '<h3 class="members-contacts-heading" style="font-size:0.9rem;color:rgba(255,255,255,0.55);margin:6px 0">Par discipline</h3><div class="members-group-grid">';
  const discLabels: Record<string, string> = { judo: 'Judo', iaido: 'Iaido', taiso: 'Taiso', ffjda: 'FFJDA seul' };
  for (const [disc, group] of Object.entries(byDiscipline)) {
    if (group.length) html += groupCard(discLabels[disc] ?? disc, group, discLabels[disc] ?? disc);
  }
  html += '</div>';

  html += '<h3 class="members-contacts-heading" style="font-size:0.9rem;color:rgba(255,255,255,0.55);margin:12px 0 6px">Par cat&eacute;gorie d’&acirc;ge</h3><div class="members-group-grid">';
  for (const cat of orderedCats) {
    html += groupCard(cat, byCategory[cat], cat);
  }
  html += '</div>';

  html += '<h3 class="members-contacts-heading" style="font-size:0.9rem;color:rgba(255,255,255,0.55);margin:12px 0 6px">Par statut FFJDA</h3><div class="members-group-grid">';
  html += groupCard('Saisis FFJDA',     bySaisie.saisi,   'Saisis FFJDA');
  html += groupCard('Non saisis FFJDA', bySaisie.unsaisi, 'Non saisis FFJDA');
  html += '</div>';

  panel.innerHTML = html;
  wireCopyButtons(panel);

  // Info utile si aucun email (les groupes mailto sont alors inactifs).
  if (allEmails.length === 0) {
    const note = document.createElement('div');
    note.className = 'members-empty';
    note.style.marginTop = '10px';
    note.textContent = 'Aucun email disponible : les boutons d’envoi sont inactifs. Importez les données HelloAsso.';
    panel.appendChild(note);
  }
}

function uniqueEmails(members: HaMember[]): string[] {
  const seen = new Set<string>();
  for (const m of members) {
    const e = (m.email ?? '').trim();
    if (e) seen.add(e);
  }
  return [...seen];
}

function groupCard(label: string, group: HaMember[], subject: string, highlight = false): string {
  const emails = uniqueEmails(group);
  const names  = group
    .map((m) => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim())
    .filter(Boolean);
  const mailto = emails.length
    ? `mailto:?bcc=${emails.join(',')}&subject=${encodeURIComponent(`${MAIL_SUBJECT} - ${subject}`)}`
    : '';
  const preview = group.slice(0, 12);

  const mailBtn = emails.length
    ? `<a href="${esc(mailto)}" class="group-action-mailto" target="_blank">✉️ Envoyer un email</a>`
    : `<span class="group-action-mailto" style="opacity:0.4;pointer-events:none">✉️ Aucun email</span>`;

  return `<div class="members-group-card"${highlight ? ' style="border-color:rgba(226,177,60,0.4)"' : ''}>
    <h3>${esc(label)}</h3>
    <div class="group-count">${group.length} membres · ${emails.length} emails</div>
    <ul class="group-contacts">
      ${preview.map((m) =>
        `<li>${esc(`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || '?')}${m.email ? ` <span style="color:rgba(255,255,255,0.4);font-size:0.75rem">(${esc(m.email)})</span>` : ''}</li>`
      ).join('')}
      ${group.length > preview.length ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${group.length - preview.length} autre(s)</li>` : ''}
    </ul>
    <div class="group-actions">
      ${mailBtn}
      <button class="group-action-copy" data-copy="${esc(names.join(', '))}" data-reset="Copier les noms">Copier les noms</button>
      <button class="group-action-copy" data-copy="${esc(emails.join(', '))}" data-reset="Copier les emails">Copier les emails</button>
    </div>
  </div>`;
}

function wireCopyButtons(container: HTMLElement): void {
  container.querySelectorAll('.group-action-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = btn as HTMLButtonElement;
      const text  = b.dataset.copy ?? '';
      const reset = b.dataset.reset ?? 'Copier';
      const done = () => {
        b.textContent = 'Copié !';
        b.classList.add('copied');
        setTimeout(() => { b.textContent = reset; b.classList.remove('copied'); }, 2000);
      };
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        done();
      });
    });
  });
}
