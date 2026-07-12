// export-helpers.js — Shared private helpers for export modules

interface ExpenseReceiptIssue {
  date: string;
  missing: string[];
}

export function formatMonthLabel(monthValue, normalizeMonth) {
  const normalized = normalizeMonth(monthValue);
  const [year, month] = String(normalized || '').split('-');
  if (!year || !month) return normalized;
  return `${month}/${year}`;
}

export function closeMileagePreviewModal() {
  const modal = document.getElementById('mileagePreviewModal');
  if (modal) modal.classList.remove('active');
}

export function getMonthlyExpenseReceiptIssues(coachId, year, month, getTimeData) {
  const timeData = getTimeData();
  const issues: ExpenseReceiptIssue[] = [];
  Object.keys(timeData)
    .filter((key) => key.startsWith(`${coachId}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split('-').slice(-3).join('-');
      const data = timeData[key] || {};
      const missing: string[] = [];
      if ((data.peage || 0) > 0 && !data.justificationUrl) missing.push('péage');
      if ((data.hotel || 0) > 0 && !data.hotelJustificationUrl) missing.push('hôtel');
      if ((data.achat || 0) > 0 && !data.achatJustificationUrl) missing.push('achat');
      if (missing.length) issues.push({ date, missing });
    });
  return issues;
}

function _printInNewWindow(html: string): void {
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) { alert('Veuillez autoriser les popups pour imprimer.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the browser a moment to render before triggering print
  setTimeout(() => { try { w.print(); } catch { /* silent */ } }, 100);
}

export function showMileagePreviewModal(html: string, modalTitle = 'Aperçu') {
  // Remove any existing modal to get a clean slate (avoids stale DOM elements)
  const oldModal = document.getElementById('mileagePreviewModal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'mileagePreviewModal';
  modal.className = 'modal export-preview-modal';
  modal.innerHTML = `
    <div class="modal-content export-preview-content">
      <h2 id="previewModalTitle"></h2>
      <div class="export-preview-toolbar">
        <button id="previewPrintBtn" class="btn-primary">🖨️ Imprimer / PDF</button>
        <button id="previewOpenInTabBtn" class="btn-secondary">Ouvrir dans un onglet</button>
        <button id="previewCloseBtn" class="btn-danger">Fermer</button>
      </div>
      <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aperçu"></iframe>
    </div>
  `;
  document.body.appendChild(modal);

  const titleEl = modal.querySelector('#previewModalTitle');
  if (titleEl) titleEl.textContent = modalTitle;

  const iframe = modal.querySelector('#mileagePreviewFrame') as HTMLIFrameElement | null;
  const printBtn = modal.querySelector('#previewPrintBtn') as HTMLButtonElement | null;
  const openInTabBtn = modal.querySelector('#previewOpenInTabBtn') as HTMLButtonElement | null;
  const closeBtn = modal.querySelector('#previewCloseBtn') as HTMLButtonElement | null;

  if (closeBtn) closeBtn.addEventListener('click', closeMileagePreviewModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeMileagePreviewModal(); });

  if (openInTabBtn) {
    openInTabBtn.addEventListener('click', () => _printInNewWindow(html));
  }

  if (printBtn && iframe) {
    printBtn.disabled = true;
    // Use srcdoc for reliable display in the iframe
    iframe.onload = () => {
      printBtn.disabled = false;
      printBtn.onclick = () => _printInNewWindow(html);
    };
    iframe.srcdoc = html;
  }

  modal.classList.add('active');
}
