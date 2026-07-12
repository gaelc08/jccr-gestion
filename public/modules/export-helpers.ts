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

export function showMileagePreviewModal(html, modalTitle = 'Aperçu') {
  let modal = document.getElementById('mileagePreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mileagePreviewModal';
    modal.className = 'modal export-preview-modal';
    modal.innerHTML = `
      <div class="modal-content export-preview-content">
        <h2 id="previewModalTitle"></h2>
        <div class="export-preview-toolbar">
          <button id="previewPrintBtn" class="btn-primary">🖨️ Imprimer / PDF</button>
          <button id="previewCloseBtn" class="btn-danger">Fermer</button>
        </div>
        <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aperçu"></iframe>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeMileagePreviewModal(); });
    modal.querySelector('#previewCloseBtn')?.addEventListener('click', closeMileagePreviewModal);
  }

  const titleEl = modal.querySelector('#previewModalTitle');
  if (titleEl) titleEl.textContent = modalTitle;

  const iframe = modal.querySelector('#mileagePreviewFrame') as HTMLIFrameElement | null;
  const printBtn = modal.querySelector('#previewPrintBtn') as HTMLButtonElement | null;

  if (printBtn) printBtn.disabled = true;
  if (iframe) {
    iframe.onload = () => {
      if (printBtn) printBtn.disabled = false;
      printBtn!.onclick = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          alert("Impossible d'imprimer. Essayez d'ouvrir la page dans un nouvel onglet.");
        }
      };
    };
    iframe.srcdoc = html;
  }
  modal.classList.add('active');
}
