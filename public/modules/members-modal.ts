// members-modal.ts — Modal d'édition inline de nom (remplace prompt())

import { getDeps, getMembers, setMembers } from './members-core.ts';

const MODAL_ID = 'membersEditModal';

function getOrCreateModal(): HTMLElement {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = [
    'display:none',
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'background:rgba(0,0,0,0.55)',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  modal.innerHTML = `
    <div style="background:#1e2433;border:1px solid rgba(255,255,255,0.12);border-radius:10px;
      padding:24px 28px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <h3 style="margin:0 0 16px;font-size:1rem;color:#e2b13c">Corriger le nom</h3>
      <label style="display:block;margin-bottom:10px;font-size:0.85rem;color:rgba(255,255,255,0.7)">
        Prénom
        <input id="membersEditFirst" type="text"
          style="display:block;width:100%;margin-top:4px;padding:6px 10px;
            background:rgba(255,255,255,0.08);color:#e0e0e0;
            border:1px solid rgba(255,255,255,0.15);border-radius:4px;font-size:0.9rem">
      </label>
      <label style="display:block;margin-bottom:18px;font-size:0.85rem;color:rgba(255,255,255,0.7)">
        Nom
        <input id="membersEditLast" type="text"
          style="display:block;width:100%;margin-top:4px;padding:6px 10px;
            background:rgba(255,255,255,0.08);color:#e0e0e0;
            border:1px solid rgba(255,255,255,0.15);border-radius:4px;font-size:0.9rem">
      </label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="membersEditCancel"
          style="padding:6px 16px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);
            background:transparent;color:rgba(255,255,255,0.6);cursor:pointer;font-size:0.85rem">
          Annuler
        </button>
        <button id="membersEditConfirm"
          style="padding:6px 16px;border-radius:4px;border:none;
            background:#e2b13c;color:#1a1a2e;cursor:pointer;font-size:0.85rem;font-weight:700">
          Enregistrer
        </button>
      </div>
      <div id="membersEditError"
        style="display:none;margin-top:10px;font-size:0.8rem;color:#e57373"></div>
    </div>`;

  document.body.appendChild(modal);
  return modal;
}

export function openEditNameModal(
  itemId: unknown,
  currentFirst: string,
  currentLast: string,
  onSuccess: () => void,
): void {
  const modal = getOrCreateModal();
  const firstInput = document.getElementById('membersEditFirst') as HTMLInputElement;
  const lastInput  = document.getElementById('membersEditLast')  as HTMLInputElement;
  const errorEl   = document.getElementById('membersEditError')  as HTMLDivElement;
  const confirmBtn = document.getElementById('membersEditConfirm') as HTMLButtonElement;
  const cancelBtn  = document.getElementById('membersEditCancel')  as HTMLButtonElement;

  firstInput.value = currentFirst;
  lastInput.value  = currentLast;
  errorEl.style.display = 'none';
  errorEl.textContent   = '';
  confirmBtn.disabled   = false;
  confirmBtn.textContent = 'Enregistrer';

  modal.style.display = 'flex';
  firstInput.focus();

  // Keyboard: Enter = confirm, Escape = cancel
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter')  void confirm();
  };
  document.addEventListener('keydown', onKeydown, { once: false });

  // Close on backdrop click
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === modal) close();
  };
  modal.addEventListener('click', onBackdrop);

  function close(): void {
    modal.style.display = 'none';
    document.removeEventListener('keydown', onKeydown);
    modal.removeEventListener('click', onBackdrop);
    confirmBtn.onclick = null;
    cancelBtn.onclick  = null;
  }

  async function confirm(): Promise<void> {
    const first = firstInput.value.trim();
    const last  = lastInput.value.trim();
    if (!first && !last) {
      errorEl.textContent = 'Prénom et nom ne peuvent pas être tous les deux vides.';
      errorEl.style.display = 'block';
      return;
    }
    confirmBtn.disabled   = true;
    confirmBtn.textContent = 'Enregistrement...';
    errorEl.style.display = 'none';
    try {
      await getDeps().correctMemberName(itemId, first, last);
      close();
      onSuccess();
    } catch (e) {
      errorEl.textContent = 'Erreur : ' + ((e as Error).message || String(e));
      errorEl.style.display = 'block';
      confirmBtn.disabled   = false;
      confirmBtn.textContent = 'Enregistrer';
    }
  }

  confirmBtn.onclick = () => void confirm();
  cancelBtn.onclick  = close;
}
