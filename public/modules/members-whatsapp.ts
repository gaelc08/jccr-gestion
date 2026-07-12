// members-whatsapp.ts — Onglet "Groupes WhatsApp"

import { getMembers, getFfjCategory, FFJ_CATEGORIES, esc } from './members-core.ts';

export async function renderWhatsappTab(): Promise<void> {
  const panel = document.getElementById('membersTabWhatsapp');
  if (!panel) return;

  const members = getMembers();
  if (members.length === 0) {
    panel.innerHTML = '<div class="members-empty">Aucun membre. Synchronisez d abord.</div>';
    return;
  }

  const byDiscipline: Record<string, typeof members> = { judo: [], iaido: [], taiso: [] };
  for (const m of members) {
    const disc = m.discipline ?? 'judo';
    if (byDiscipline[disc]) byDiscipline[disc].push(m);
    else byDiscipline.judo.push(m);
  }

  let html = '<div class="members-group-grid">';

  for (const [disc, group] of Object.entries(byDiscipline)) {
    if (!group.length) continue;
    const discLabel = disc.charAt(0).toUpperCase() + disc.slice(1);
    const allSorted = [...group].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr'));
    const allNames  = allSorted.map((m) => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()).filter(Boolean);

    html += `<div class="members-group-card">
      <h3>${discLabel} — Tous les cours</h3>
      <div class="group-count">${group.length} membres</div>
      <ul class="group-contacts">
        ${allSorted.slice(0, 15).map((m) =>
          `<li>${esc(`${m.first_name ?? ''} ${m.last_name ?? ''}`)}${m.email ? ` <span style="color:rgba(255,255,255,0.4);font-size:0.75rem">(${esc(m.email)})</span>` : ''}</li>`
        ).join('')}
        ${allSorted.length > 15 ? `<li style="color:rgba(255,255,255,0.4);font-style:italic">... et ${allSorted.length - 15} autre(s)</li>` : ''}
      </ul>
      <div class="group-actions">
        <button class="group-action-copy" data-contacts="${esc(allNames.join(', '))}" data-label="${esc(discLabel)} - Tous">Copier les noms</button>
      </div>
    </div>`;

    for (const cat of FFJ_CATEGORIES.map((c) => c.label)) {
      const subGroup = group.filter((m) => getFfjCategory(m.date_of_birth)?.label === cat);
      if (!subGroup.length) continue;
      const sorted    = [...subGroup].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr'));
      const nameList  = sorted.map((m) => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()).filter(Boolean);

      html += `<div class="members-group-card">
        <h3>${esc(discLabel)} — ${esc(cat)}</h3>
        <div class="group-count">${subGroup.length} membres</div>
        <ul class="group-contacts">
          ${sorted.map((m) =>
            `<li>${esc(`${m.first_name ?? ''} ${m.last_name ?? ''}`)}${m.email ? ` <span style="color:rgba(255,255,255,0.4);font-size:0.75rem">(${esc(m.email)})</span>` : ''}</li>`
          ).join('')}
        </ul>
        <div class="group-actions">
          <button class="group-action-copy" data-contacts="${esc(nameList.join(', '))}" data-label="${esc(`${discLabel} - ${cat}`)}">Copier les noms</button>
        </div>
      </div>`;
    }
  }
  html += '</div>';
  panel.innerHTML = html;
  wireCopyButtons(panel, 'Copier les noms');
}

function wireCopyButtons(container: HTMLElement, resetLabel: string): void {
  container.querySelectorAll('.group-action-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = btn as HTMLButtonElement;
      const text = b.dataset.contacts ?? '';
      const copy = (t: string) => {
        b.textContent = 'Copié !';
        b.classList.add('copied');
        setTimeout(() => { b.textContent = resetLabel; b.classList.remove('copied'); }, 2000);
        return t;
      };
      navigator.clipboard.writeText(text).then(() => copy(text)).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        copy(text);
      });
    });
  });
}
